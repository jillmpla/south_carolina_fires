const express = require("express");
const cors = require("cors");
const pool = require("../database");
const { fetchFireData } = require("../fireService");

const app = express();
app.use(cors());

app.get("/api/fires", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM fires");
        res.json({ fires: rows });
    } catch (error) {
        console.error("🚨 Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

app.get("/api/update-fires", async (req, res) => {
    try {
        console.log("🔄 Fetching new fire data...");
        if (!fetchFireData) {
            throw new Error("fetchFireData is not defined! Check import.");
        }
        await fetchFireData();
        res.json({ message: "Fire data updated successfully!" });
    } catch (error) {
        console.error("🚨 Error updating fire data:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;











