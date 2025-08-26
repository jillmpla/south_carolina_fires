//fetch NASA FIRMS (VIIRS S-NPP + NOAA-20), filter to South Carolina, dedupe, and upsert into Postgres.

const axios = require("axios");
const turf = require("@turf/turf");
const pool = require("./database");
const fs = require("fs");
const path = require("path");

//---- config ---------------------------------------------------------------
const PRODUCTS = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"];
const COUNTRY = "USA"; // kept for reference; AREA API below doesn't use it
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
    geom = raw;
  }

  if (!geom || !["Polygon", "MultiPolygon"].includes(geom.type)) {
    throw new Error(`SC geometry must be Polygon/MultiPolygon, got: ${geom?.type}`);
  }
  return turf.feature(geom);
}

const scPolygon = loadScPolygon();

//compute a bounding box for the AREA API: [minLon, minLat, maxLon, maxLat]
const [minLon, minLat, maxLon, maxLat] = turf.bbox(scPolygon);

//helper to build FIRMS AREA endpoint URL for a product and SC bbox
function firmsAreaUrl(product) {
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.NASA_API_KEY}/${product}/${bbox}/${DAYS}`;
}

//expected header (13 columns):
//0 latitude, 1 longitude, 2 bright_ti4, 3 scan, 4 track, 5 acq_date, 6 acq_time,
//7 satellite, 8 confidence, 9 version, 10 bright_ti5, 11 frp, 12 daynight
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
  const url = firmsAreaUrl(product);
  try {
    const res = await axios.get(url, { responseType: "text", timeout: 30_000 });
    if (typeof res.data !== "string") throw new Error("Non-text response");
    if (res.data.startsWith("Invalid")) {
      console.error(`[FIRMS] ${product} AREA response indicates error: ${res.data.slice(0, 80)}`);
      return [];
    }
    return parseViirsCsv(res.data);
  } catch (err) {
    console.error(`[FIRMS] ${product} fetch failed:`, err.message);
    return [];
  }
}

async function fetchFireData() {
  try {
    console.log(`Fetching NASA FIRMS for products: ${PRODUCTS.join(", ")} (last ${DAYS} day(s))`);

    //fetch both products
    const results = await Promise.all(PRODUCTS.map(fetchFirmsProduct));
    const combined = results.flat();

    //deduplicate
    const dedup = new Map();
    for (const f of combined) {
      const key = `${f.acq_date}|${f.acq_time}|${f.latitude}|${f.longitude}|${f.satellite}`;
      if (!dedup.has(key)) dedup.set(key, f);
    }
    const fires = [...dedup.values()];

    //insert (UPSERT)
    const insert = `
      INSERT INTO fires
        (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (acq_date, acq_time, latitude, longitude, satellite) DO NOTHING
    `;

    for (const f of fires) {
      await pool.query(insert, [
        f.latitude, f.longitude, f.brightness, f.confidence,
        f.acq_date, f.acq_time, f.satellite, f.frp, f.daynight
      ]);
    }

    console.log(`Inserted ${fires.length} new detections`);
    return fires;
  } catch (err) {
    console.error("Error in fetchFireData:", err.message);
    return [];
  }
}

module.exports = { fetchFireData };


