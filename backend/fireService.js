const axios = require("axios");
const turf = require("@turf/turf");
const fs = require("fs");
const path = require("path");
const db = require("./database");

const NASA_API_KEY = process.env.NASA_API_KEY;
if (!NASA_API_KEY) {
    console.error("NASA API Key is missing! Make sure it's in the .env file.");
    process.exit(1);
}

const geojsonPath = path.join(__dirname, "southCarolinaBorder.geojson");
if (!fs.existsSync(geojsonPath)) {
    console.error("ERROR: GeoJSON file not found at:", geojsonPath);
    process.exit(1);
}

const southCarolinaBorder = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
const southCarolinaPolygon = southCarolinaBorder.geometry;

async function fetchFireData() {
    try {
        console.log("🔍 Fetching new NASA FIRMS fire data...");
        const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${NASA_API_KEY}/VIIRS_SNPP_NRT/USA/3`;
        const response = await axios.get(url);

        if (!response.data) {
            throw new Error("Invalid response format from API");
        }

        const csvRows = response.data.split("\n");
        const fires = csvRows.slice(1)
            .filter(row => row.trim() !== "")
            .map(row => {
                const columns = row.split(",");
                const latitude = parseFloat(columns[1]);
                const longitude = parseFloat(columns[2]);

                if (!latitude || !longitude) return null;

                const firePoint = turf.point([longitude, latitude]);
                if (!turf.booleanPointInPolygon(firePoint, southCarolinaPolygon)) return null;

                return {
                    latitude,
                    longitude,
                    brightness: parseFloat(columns[3]) || null,
                    confidence: columns[10] || "Unknown",
                    acq_date: columns[6] || "Unknown",
                    acq_time: columns[7] || "Unknown",
                    satellite: columns[8] || "Unknown",
                    frp: parseFloat(columns[13]) || null,
                    daynight: columns[14] === "D" ? "Daytime" : "Nighttime"
                };
            })
            .filter(fire => fire !== null);

        // Save to SQLite
        db.run("DELETE FROM fires"); // Clear old data
        const stmt = db.prepare("INSERT INTO fires (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        fires.forEach(fire => {
            stmt.run(fire.latitude, fire.longitude, fire.brightness, fire.confidence, fire.acq_date, fire.acq_time, fire.satellite, fire.frp, fire.daynight);
        });
        stmt.finalize();

        console.log(`Fetched and saved ${fires.length} fires to SQLite.`);
        return fires;
    } catch (error) {
        console.error("Error fetching fire data:", error.message);
        return [];
    }
}

module.exports = { fetchFireData };
