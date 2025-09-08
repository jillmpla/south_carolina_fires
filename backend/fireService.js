/* /backend/fireService.js */
//fetch NASA FIRMS (VIIRS S-NPP + NOAA-20), filter to South Carolina, dedupe, and upsert into Postgres.

const axios = require("axios");
const turf = require("@turf/turf");
const pool = require("./database");
const fs = require("fs");
const path = require("path");

const PRODUCTS = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"];
const DAYS = Number(process.env.FIRMS_DAYS || 2);
const NASA_API_KEY = process.env.NASA_API_KEY;

if (!NASA_API_KEY) {
    console.error("ERROR: NASA_API_KEY env var is not set");
}

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
            (f) => f && f.geometry && ["Polygon", "MultiPolygon"].includes(f.geometry.type)
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

    const feature = turf.feature(geom);

    const center = turf.centroid(feature);
    if (!turf.booleanPointInPolygon(center, feature)) {
        console.warn("[SC Polygon] Centroid check failed—polygon may be invalid or coordinates flipped.");
    }
    return feature;
}

const scPolygon = loadScPolygon();

const [minLon, minLat, maxLon, maxLat] = turf.bbox(scPolygon);
console.log(
    `[FIRMS] SC bbox: ${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}`
);

function firmsAreaUrl(product) {
    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${NASA_API_KEY}/${product}/${bbox}/${DAYS}`;
}

function buildAcqTimestampUTC(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const t = String(timeStr).padStart(4, "0");
    const hh = t.slice(0, 2);
    const mm = t.slice(2, 4);
    const d = new Date(`${dateStr}T${hh}:${mm}:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

function looksLikeViirsCsv(text) {
    const first = text.split(/\r?\n/, 1)[0]?.toLowerCase() || "";
    return (
        first.includes("latitude") &&
        first.includes("longitude") &&
        first.includes("acq_date") &&
        first.includes("acq_time")
    );
}

function parseViirsCsv(text) {
    const rows = text.trim().split(/\r?\n/);
    if (rows.length < 2) return [];

    const header = rows[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);

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

    let total = 0,
        badCoord = 0,
        outside = 0;
    const out = [];

    for (let i = 1; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line) continue;
        total++;
        const c = line.split(",");

        const lat = Number(c[col.latitude]);
        const lon = Number(c[col.longitude]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            badCoord++;
            continue;
        }

        const pt = turf.point([lon, lat]);
        if (!turf.booleanPointInPolygon(pt, scPolygon)) {
            outside++;
            continue;
        }

        const frpVal = col.frp >= 0 ? Number(c[col.frp]) : null;

        const dnRaw =
            col.daynight >= 0 ? String(c[col.daynight] || "").trim().toUpperCase() : "";

        const daynight = dnRaw === "D" ? "Daytime" : dnRaw === "N" ? "Nighttime" : "Unknown";

        out.push({
            latitude: lat,
            longitude: lon,
            brightness: col.bright_ti4 >= 0 ? Number(c[col.bright_ti4]) : null,
            confidence: col.confidence >= 0 ? c[col.confidence] || "Unknown" : "Unknown",
            acq_date: col.acq_date >= 0 ? c[col.acq_date] : null,
            acq_time: col.acq_time >= 0 ? c[col.acq_time] : null,
            satellite: col.satellite >= 0 ? c[col.satellite] : null,
            frp: Number.isFinite(frpVal) ? frpVal : null,
            daynight,
            instrument: col.instrument >= 0 ? c[col.instrument] : null,
            version: col.version >= 0 ? c[col.version] : null,
            bright_ti5: col.bright_ti5 >= 0 ? Number(c[col.bright_ti5]) : null,
        });
    }

    console.log(
        `parseViirsCsv: totalRows=${total} kept=${out.length} badCoord=${badCoord} outsidePoly=${outside}`
    );
    return out;
}

async function fetchFirmsProduct(product) {
    const url = firmsAreaUrl(product);

    const redactedUrl = url.replace(NASA_API_KEY || "MISSING_KEY", "****");
    console.log(`[FIRMS] Fetching ${product} (last ${DAYS} day(s)) URL=${redactedUrl}`);

    try {
        const res = await axios.get(url, { responseType: "text", timeout: 30_000 });

        if (typeof res.data !== "string") {
            console.error(`[FIRMS] ${product} non-text response`);
            return [];
        }

        const body = res.data;

        if (!looksLikeViirsCsv(body)) {
            const first120 = body.slice(0, 120).replace(/\s+/g, " ");
            console.error(`[FIRMS] ${product} unexpected response (first 120): ${first120}`);
            return [];
        }

        const parsed = parseViirsCsv(body);
        console.log(`[FIRMS] ${product} parsed ${parsed.length} record(s) inside SC`);
        return parsed;
    } catch (err) {
        console.error(`[FIRMS] ${product} fetch failed:`, err.message);
        return [];
    }
}

async function fetchFireData() {
    console.log(
        `Fetching NASA FIRMS for products: ${PRODUCTS.join(", ")} (last ${DAYS} day(s))`
    );

    try {
        const results = await Promise.all(PRODUCTS.map(fetchFirmsProduct));
        console.log(
            "[FIRMS] per-product inside-SC counts:",
            results.map((r, i) => `${PRODUCTS[i]}=${r.length}`).join(", ")
        );
        const combined = results.flat();

        const dedup = new Map();
        for (const f of combined) {
            const t4 = f.acq_time ? String(f.acq_time).trim().padStart(4, "0") : null;
            const key = `${f.acq_date}|${t4}|${f.latitude}|${f.longitude}|${f.satellite}`;
            if (!dedup.has(key)) dedup.set(key, f);
        }
        const fires = [...dedup.values()];

        //insert (UPSERT)
        const insert = `
      INSERT INTO fires
      (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight, acq_ts)
      VALUES ($1,$2,$3,$4,$5::date,$6::time,$7,$8,$9,$10)
      ON CONFLICT (acq_date, acq_time, latitude, longitude, satellite) DO NOTHING
    `;

        let inserted = 0,
            failed = 0;

        for (const f of fires) {
            try {
                const t4 = f.acq_time ? String(f.acq_time).trim().padStart(4, "0") : null;
                const timeForDb = t4 ? `${t4.slice(0, 2)}:${t4.slice(2, 4)}` : null;
                const ts = buildAcqTimestampUTC(f.acq_date, t4);

                const sat = f.satellite ? String(f.satellite).trim().toUpperCase() : null;
                const conf = f.confidence ? String(f.confidence).trim() : "Unknown";

                const res = await pool.query(insert, [
                    f.latitude,
                    f.longitude,
                    f.brightness,
                    conf,
                    f.acq_date,
                    timeForDb,
                    sat,
                    f.frp,
                    f.daynight,
                    ts,
                ]);

                inserted += res.rowCount || 0;
            } catch (e) {
                failed++;
                console.error("Insert error:", e.message, " row:", {
                    acq_date: f.acq_date,
                    acq_time: f.acq_time,
                    lat: f.latitude,
                    lon: f.longitude,
                    sat: f.satellite,
                });
            }
        }

        console.log(
            `Fetched(total in-SC): ${combined.length}, deduped: ${fires.length}, inserted: ${inserted}, failed: ${failed}`
        );
        return fires;
    } catch (err) {
        console.error("Error in fetchFireData:", err.message);
        return [];
    }
}

module.exports = { fetchFireData };


