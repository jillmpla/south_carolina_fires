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

function buildAcqTimestampUTC(dateStr, timeStr) {
    //timeStr like "814" or "0814"
    if (!dateStr || !timeStr) return null;
    const t = String(timeStr).padStart(4, "0");
    const hh = t.slice(0, 2);
    const mm = t.slice(2, 4);
    //FIRMS times are UTC
    return new Date(`${dateStr}T${hh}:${mm}:00Z`);
}

function parseViirsCsv(text) {
    const rows = text.trim().split(/\r?\n/);
    if (rows.length < 2) return [];

    const header = rows[0].split(",").map(h => h.trim().toLowerCase());
    const idx = name => header.indexOf(name);

    const col = {
        latitude: idx("latitude"),
        longitude: idx("longitude"),
        bright_ti4: idx("bright_ti4"),
        bright_ti5: idx("bright_ti5"),
        acq_date: idx("acq_date"),
        acq_time: idx("acq_time"),
        satellite: idx("satellite"),
        instrument: idx("instrument"),
        confidence: idx("confidence"),
        version: idx("version"),
        frp: idx("frp"),
        daynight: idx("daynight"),
    };

    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line) continue;
        const c = line.split(",");

        const lat = Number(c[col.latitude]);
        const lon = Number(c[col.longitude]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        //spatial filter: keep only detections inside SC
        const pt = turf.point([lon, lat]);
        if (!turf.booleanPointInPolygon(pt, scPolygon)) continue;

        const frpVal = col.frp >= 0 ? Number(c[col.frp]) : null;
        const dnRaw = col.daynight >= 0 ? c[col.daynight] : null;

        out.push({
            latitude: lat,
            longitude: lon,
            brightness: col.bright_ti4 >= 0 ? Number(c[col.bright_ti4]) : null,
            confidence: col.confidence >= 0 ? c[col.confidence] || "Unknown" : "Unknown",
            acq_date: col.acq_date >= 0 ? c[col.acq_date] : null,
            acq_time: col.acq_time >= 0 ? c[col.acq_time] : null,
            satellite: col.satellite >= 0 ? c[col.satellite] : null,
            frp: Number.isFinite(frpVal) ? frpVal : null,
            daynight: dnRaw === "D" ? "Daytime" : "Nighttime",
            instrument: col.instrument >= 0 ? c[col.instrument] : null, //optional
            version: col.version >= 0 ? c[col.version] : null,          //optional
            bright_ti5: col.bright_ti5 >= 0 ? Number(c[col.bright_ti5]) : null, //optional
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
            (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight, acq_ts)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (acq_date, acq_time, latitude, longitude, satellite) DO NOTHING
        `;

        let inserted = 0;
        for (const f of fires) {
            const ts = buildAcqTimestampUTC(f.acq_date, f.acq_time);
            const res = await pool.query(insert, [
                f.latitude, f.longitude, f.brightness, f.confidence,
                f.acq_date, f.acq_time, f.satellite, f.frp, f.daynight, ts
            ]);
            inserted += res.rowCount || 0;
        }

        console.log(`Fetched: ${combined.length}, deduped: ${fires.length}, inserted: ${inserted}`);
        return fires;
    } catch (err) {
        console.error("Error in fetchFireData:", err.message);
        return [];
    }
}

module.exports = { fetchFireData };


