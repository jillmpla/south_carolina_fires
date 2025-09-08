/* /backend/database.js */

const { Pool } = require("pg");

const connStr = process.env.DATABASE_URL;
if (!connStr) {
    console.error("ERROR: DATABASE_URL env var is not set");
    process.exit(1);
}

const pool = new Pool({
    connectionString: connStr,
    ssl: connStr.includes("supabase") ? { rejectUnauthorized: false } : false,
});

(async () => {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS fires (
        id          SERIAL PRIMARY KEY,
        latitude    DOUBLE PRECISION,
        longitude   DOUBLE PRECISION,
        brightness  DOUBLE PRECISION,
        confidence  TEXT,
        acq_date    DATE,
        acq_time    TIME,
        satellite   TEXT,
        frp         DOUBLE PRECISION,
        daynight    TEXT,
        acq_ts      TIMESTAMPTZ
      )
    `);

        await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS fires_uni
      ON fires (acq_date, acq_time, latitude, longitude, satellite)
    `);
    } catch (err) {
        console.error("Database bootstrap error:", err.message);
    }
})().catch((e) => console.error("Database init failed:", e));

module.exports = pool;
