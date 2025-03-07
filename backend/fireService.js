const axios = require("axios");
const turf = require("@turf/turf");
const pool = require("./database");
const fs = require("fs");
const path = require("path");

//load South Carolina border GeoJSON
const geojsonPath = path.join(__dirname, "southCarolinaBorder.geojson");
if (!fs.existsSync(geojsonPath)) {
    console.error("ERROR: GeoJSON file not found at:", geojsonPath);
    process.exit(1);
}
const southCarolinaBorder = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
const southCarolinaPolygon = southCarolinaBorder.geometry;

//fetch new fire data from NASA FIRMS API
async function fetchFireData() {
    try {
        console.log("Fetching new NASA FIRMS fire data...");
        const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${process.env.NASA_API_KEY}/VIIRS_SNPP_NRT/USA/2`;
        const response = await axios.get(url);

        if (!response.data) {
            throw new Error("Invalid response format from API");
        }

        const csvRows = response.data.split("\n");

        //filter only fires inside South Carolina
        const fires = csvRows.slice(1)
            .filter(row => row.trim() !== "")
            .map(row => {
                const columns = row.split(",");
                const latitude = parseFloat(columns[1]);
                const longitude = parseFloat(columns[2]);

                if (!latitude || !longitude) return null;

                const firePoint = turf.point([longitude, latitude]);
                if (!turf.booleanPointInPolygon(firePoint, southCarolinaPolygon)) return null; //keep only fires inside SC

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
            .filter(fire => fire !== null); //store only valid SC fires

        //delete old fire data before inserting new data
        console.log("Clearing old fire data...");
        await pool.query("DELETE FROM fires");

        console.log(`Inserting ${fires.length} new fire records...`);
        const insertQuery = `
            INSERT INTO fires (latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp, daynight)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;

        for (const fire of fires) {
            await pool.query(insertQuery, [
                fire.latitude,
                fire.longitude,
                fire.brightness,
                fire.confidence,
                fire.acq_date,
                fire.acq_time,
                fire.satellite,
                fire.frp,
                fire.daynight
            ]);
        }

        console.log(`Successfully updated fire data.`);
        return fires;
    } catch (error) {
        console.error("Error fetching fire data:", error.message);
        return [];
    }
}

module.exports = { fetchFireData };