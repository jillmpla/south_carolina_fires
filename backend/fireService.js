//fetch NASA FIRMS (VIIRS S-NPP + NOAA-20), filter to South Carolina, dedupe, and upsert into Postgres.

const axios = require("axios");
const turf = require("@turf/turf");
const pool = require("./database");
const fs = require("fs");
const path = require("path");

//---- config ---------------------------------------------------------------
const PRODUCTS = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"];
const COUNTRY = "USA";
const DAYS = Number(process.env.FIRMS_DAYS || 2);

//---- load South Carolina boundary ------------------
const geojsonPath = path.join(__dirname, "southCarolinaBorder.geojson");
if (!fs.existsSync(geojsonPath)) {
  console.error("ERROR: GeoJSON file not found at:", geojsonPath);
  process.exit(1);
}

function loadScPolygon() {
  const raw = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
  let geom = null;

  if (raw.type === "FeatureCollection") {
    const feat = raw.features?.find(
      f => f && f.geometry && ["Polygon", "MultiPolygon"].includes(f.geometry.type)
    );
    if (!feat) throw new Error("No Polygon/MultiPolygon in FeatureCollection");
    geom = feat.geometry;
  } else if (raw.type === "Feature") {
    geom = raw.geometry;
  } else {
    //assume raw is a Geometry
    geom = raw;
  }

  if (!geom || !["Polygon", "MultiPolygon"].includes(geom.type)) {
    throw new Error(`SC geometry must be Polygon/MultiPolygon, got: ${geom?.type}`);
  }
  return turf.feature(geom);
}

const scPolygon = loadScPolygon();

// Expected header (13 columns):
// 0 latitude, 1 longitude, 2 bright_ti4, 3 scan, 4 track, 5 acq_date, 6 acq_time,
// 7 satellite, 8 confidence, 9 version, 10 bright_ti5, 11 frp, 12 daynight
function parseViirsCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (!rows.length) return [];

  const header = rows[0].split(",");
  if (header[0] !== "latitude" || header[1] !== "longitude") {
    console.warn("Unexpected CSV header (first columns):", header.slice(0, 6).join(","));
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i].trim();
    if (!line) continue;

    const c = line.split(",");
    if (c.length < 13) continue; 

    const lat = Number(c[0]);
    const lon = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    //spatial filter: keep only detections inside SC
    const pt = turf.point([lon, lat]);
    if (!turf.booleanPointInPolygon(pt, scPolygon)) continue;

    const frp = Number(c[11]);

    out.push({
      latitude: lat,
      longitude: lon,
      brightness: Number(c[2]) || null, 
      confidence: c[8] || "Unknown",   
      acq_date: c[5] || null,
      acq_time: c[6] || null,
      satellite: c[7] || null,          
      frp: Number.isFinite(frp) ? frp : null,
      daynight: c[12] === "D" ? "Daytime" : "Nighttime"
    });
  }
  return out;
}

async function fetchFirmsProduct(product) {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${process.env.NASA_API_KEY}/${product}/${COUNTRY}/${DAYS}`;
  try {
    const res = await axios.get(url, { responseType: "text", timeout: 30_000 });
    if (typeof res.data !== "string") throw new Error("Non-text response");
    return parseViirsCsv(res.data);
  } catch (err) {
    console.error(`[FIRMS] ${product} fetch failed:`, err.message);
    return [];
  }
}

/* async function fetchFireData() {
  try {
    console.log(`Fetching NASA FIRMS for products: ${PRODUCTS.join(", ")} (last ${DAYS} day(s))`);

    const results = await Promise.all(PRODUCTS.map(fetchFirmsProduct));
    const combined = results.flat();

    const dedup = new Map();
    for (const f of combined) {
      const key = `${f.acq_date}|${f.acq_time}|${f.latitude}|${f.longitude}|${f.satellite}`;
      if (!dedup.has(key)) dedup.set(key, f);
    }
    const fires = [...dedup.values()];

    const gt2 = fires.filter(f => (f.frp ?? -1) > 2).length;
    console.log(`Parsed ${fires.length} SC detections (${gt2} with FRP > 2)`);

    //upsert into DB
    const insert = `
      INSERT INTO fires
        (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (acq_date, acq_time, latitude, longitude, satellite) DO NOTHING
    `;

    //simple batching
    for (const f of fires) {
      await pool.query(insert, [
        f.latitude, f.longitude, f.brightness, f.confidence,
        f.acq_date, f.acq_time, f.satellite, f.frp, f.daynight
      ]);
    }

    //quick visibility on what landed
    const { rows: [{ total }] } =
      await pool.query("SELECT COUNT(*)::int AS total FROM fires");
    const { rows: [{ gt2: dbgt2 }] } =
      await pool.query("SELECT COUNT(*)::int AS gt2 FROM fires WHERE frp > 2");
    console.log(`DB now has ${total} rows (${dbgt2} with FRP > 2)`);

    return fires;
  } catch (err) {
    console.error("Error in fetchFireData:", err.message);
    return [];
  }
} */

async function fetchFireData() {
  const debug = {
    products: ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"],
    days: Number(process.env.FIRMS_DAYS || 2),
    nasaKeyConfigured: Boolean(process.env.NASA_API_KEY),
    rawResponses: [],       // status codes or error messages per product
    header: null,           // first CSV header we saw
    parsedRows: 0,          // total parsed rows before SC filter
    keptInSC: 0,            // rows inside SC
    gt2: 0,                 // FRP > 2 count
    inserted: 0,            // rows inserted this run
    dbCountsAfter: null,    // totals in DB after insert
    sample: []              // up to 3 rows we tried to insert
  };

  try {
    const urls = debug.products.map(p =>
      `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${process.env.NASA_API_KEY}/${p}/USA/${debug.days}`
    );

    // Fetch both products
    const responses = await Promise.allSettled(
      urls.map(u => axios.get(u, { responseType: "text", timeout: 30000 }))
    );

    // Parse
    const all = [];
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      if (r.status === "fulfilled" && typeof r.value.data === "string") {
        debug.rawResponses.push({ product: debug.products[i], ok: true, length: r.value.data.length });
        const rows = r.value.data.trim().split(/\r?\n/);
        if (!debug.header && rows.length) {
          debug.header = rows[0].split(",").slice(0, 6); // show first few
        }
        for (let j = 1; j < rows.length; j++) {
          const line = rows[j].trim();
          if (!line) continue;
          const c = line.split(",");
          if (c.length < 13) continue;
          const lat = Number(c[0]);
          const lon = Number(c[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

          // Before SC filter, count as parsed
          debug.parsedRows++;

          // SC filter
          const pt = turf.point([lon, lat]);
          if (!turf.booleanPointInPolygon(pt, scPolygon)) continue;

          const frp = Number(c[11]);
          const row = {
            latitude: lat,
            longitude: lon,
            brightness: Number(c[2]) || null,
            confidence: c[8] || "Unknown",
            acq_date: c[5] || null,
            acq_time: c[6] || null,
            satellite: c[7] || null,
            frp: Number.isFinite(frp) ? frp : null,
            daynight: c[12] === "D" ? "Daytime" : "Nighttime"
          };
          all.push(row);
        }
      } else {
        const msg = r.status === "rejected" ? (r.reason?.message || "request failed") : "bad response";
        debug.rawResponses.push({ product: debug.products[i], ok: false, error: msg });
      }
    }

    // Dedupe
    const dedup = new Map();
    for (const f of all) {
      const key = `${f.acq_date}|${f.acq_time}|${f.latitude}|${f.longitude}|${f.satellite}`;
      if (!dedup.has(key)) dedup.set(key, f);
    }
    const fires = [...dedup.values()];
    debug.keptInSC = fires.length;
    debug.gt2 = fires.filter(f => (f.frp ?? -1) > 2).length;
    debug.sample = fires.slice(0, 3);

    // UPSERT (requires fires_unique index as we set earlier)
    const insert = `
      INSERT INTO fires
        (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (acq_date, acq_time, latitude, longitude, satellite) DO NOTHING
    `;

    let inserted = 0;
    for (const f of fires) {
      const r = await pool.query(insert, [
        f.latitude, f.longitude, f.brightness, f.confidence,
        f.acq_date, f.acq_time, f.satellite, f.frp, f.daynight
      ]);
      inserted += r.rowCount || 0;
    }
    debug.inserted = inserted;

    // DB totals
    const { rows: [{ total }] } =
      await pool.query("SELECT COUNT(*)::int AS total FROM fires");
    const { rows: [{ gt2 }] } =
      await pool.query("SELECT COUNT(*)::int AS gt2 FROM fires WHERE frp > 2");
    debug.dbCountsAfter = { total, gt2 };

    return debug;
  } catch (err) {
    return { ...debug, error: err.message, stack: err.stack };
  }
}

module.exports = { fetchFireData };

