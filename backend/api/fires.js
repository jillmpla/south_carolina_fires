require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("../database");
const { fetchFireData } = require("../fireService");

const app = express();
app.use(cors());

app.get("/api/fires", async (req, res) => {
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM fires", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        await fetchFireData();

        res.json({ fires: rows });
    } catch (error) {
        console.error("🚨 Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = app;








