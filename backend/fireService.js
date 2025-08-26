const axios = require("axios");
const turf = require("@turf/turf");
const pool = require("./database");
const fs = require("fs");
const path = require("path");

//load SC border
const geojsonPath = path.join(__dirname, "southCarolinaBorder.geojson");
if (!fs.existsSync(geojsonPath)) {
  console.error("ERROR: GeoJSON file not found at:", geojsonPath);
  process.exit(1);
}
const scFeature = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
//use a Feature object for turf
const scPolygon = scFeature.type === "Feature" ? scFeature : turf.feature(scFeature.geometry);

async function fetchFireData() {
  try {
    console.log("Fetching new NASA FIRMS fire data...");
    const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${process.env.NASA_API_KEY}/VIIRS_SNPP_NRT/USA/2`;
    const response = await axios.get(url, { responseType: "text" });

    if (typeof response.data !== "string") {
      throw new Error("Invalid response format from API");
    }

    const csvRows = response.data.trim().split(/\r?\n/);
    const header = csvRows[0]?.split(",") ?? [];
    //sanity check a couple of expected headers
    if (header[0] !== "latitude" || header[1] !== "longitude") {
      console.warn("Unexpected CSV header. First two columns:", header[0], header[1]);
    }

    const fires = csvRows.slice(1)
      .filter(row => row.trim() !== "")
      .map(row => {
        const c = row.split(",");
        const latitude  = Number(c[0]);
        const longitude = Number(c[1]);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

        const pt = turf.point([longitude, latitude]);
        if (!turf.booleanPointInPolygon(pt, scPolygon)) return null;

        const frp = Number(c[11]);
        return {
          latitude,
          longitude,
          brightness: Number(c[2]) || null,      
          confidence: c[8] || "Unknown",
          acq_date: c[5] || null,
          acq_time: c[6] || null,
          satellite: c[7] || null,
          frp: Number.isFinite(frp) ? frp : null,
          daynight: c[12] === "D" ? "Daytime" : "Nighttime"
        };
      })
      .filter(Boolean);

    console.log(`Found ${fires.length} SC fires in feed`);
    console.log("Clearing old fire data...");
      
    await pool.query("DELETE FROM fires");

    console.log(`Inserting ${fires.length} new fire records...`);
    const insert = `
      INSERT INTO fires (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `;
    for (const f of fires) {
      await pool.query(insert, [
        f.latitude, f.longitude, f.brightness, f.confidence,
        f.acq_date, f.acq_time, f.satellite, f.frp, f.daynight
      ]);
    }

    console.log("Successfully updated fire data.");
    return fires;
  } catch (err) {
    console.error("Error fetching fire data:", err.message);
    return [];
  }
}

module.exports = { fetchFireData };
