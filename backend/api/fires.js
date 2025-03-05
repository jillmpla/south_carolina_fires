//require("dotenv").config(); ->only used locally
const express = require("express");
const cors = require("cors");
const pool = require("../database");
const { fetchFireData } = require("../fireService");

const app = express();
app.use(cors());

//get fires from Supabase
app.get("/api/fires", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM fires");
        res.json({ fires: rows });
    } catch (error) {
        console.error("🚨 Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

//manually Refresh Fire Data (using daily UptimeRobot Cron Job)
app.get("/api/update-fires", async (req, res) => {
    try {
        console.log("🔄 Fetching new fire data...");
        await fetchFireData();
        res.json({ message: "Fire data updated successfully!" });
    } catch (error) {
        console.error("🚨 Error updating fire data:", error);
        res.status(500).json({ error: "Failed to update fire data" });
    }
});

module.exports = app;










