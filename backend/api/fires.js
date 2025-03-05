require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("../database");
const { fetchFireData } = require("../fireService");

const app = express();
app.use(cors());

// API Route: Get fires from SQLite
app.get("/api/fires", async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM fires", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json({ fires: rows });
    } catch (error) {
        console.error("🚨 Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

// Fetch data on first request (since setInterval won't work in Vercel)
fetchFireData();

// Export the app for Vercel (serverless)
module.exports = app;







