require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./database");
const { fetchFireData } = require("./fireService");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

//fetch new fire data every 24 hours
setInterval(() => {
    console.log("🔄 Refreshing fire data...");
    fetchFireData();
}, 24 * 60 * 60 * 1000);

//API Route: Get fires from SQLite
app.get("/api/fires", (req, res) => {
    db.all("SELECT * FROM fires", [], (err, rows) => {
        if (err) {
            console.error("🚨 Error fetching fires from SQLite:", err.message);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json({ fires: rows });
        }
    });
});

//Start server
app.listen(PORT, async () => {
    console.log(`✅ Server running on port ${PORT}`);
    await fetchFireData();
});






