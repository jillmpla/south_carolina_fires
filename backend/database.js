const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("supabase")
        ? { rejectUnauthorized: false }
        : false
});

pool.query(`
    CREATE TABLE IF NOT EXISTS fires (
        id SERIAL PRIMARY KEY,
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
`).catch(err => console.error("🚨 Database Error:", err));

module.exports = pool;