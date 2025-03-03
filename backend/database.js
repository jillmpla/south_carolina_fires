const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "fires.db");
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("🚨 Database connection error:", err.message);
    } else {
        console.log("✅ Connected to SQLite database.");
        db.run(`
            CREATE TABLE IF NOT EXISTS fires (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL,
                longitude REAL,
                brightness REAL,
                confidence TEXT,
                acq_date TEXT,
                acq_time TEXT,
                satellite TEXT,
                frp REAL,
                daynight TEXT
            )
        `);
    }
});

module.exports = db;
