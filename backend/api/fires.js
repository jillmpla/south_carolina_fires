/* /backend/api/fires.js */
//express API routes for serving and updating fire detections

const express = require("express");
const cors = require("cors");
const pool = require("../database");
const { fetchFireData } = require("../fireService");

const app = express();

//CORS
app.use(cors({
    origin: "*",
    methods: ["GET"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

//GET /api/fires
app.get("/api/fires", async (req, res) => {
    try {
        const rawHours = req.query.hours;
        const rawLimit = req.query.limit;

        const hours =
            rawHours !== undefined && !Number.isNaN(parseInt(rawHours, 10))
                ? Math.max(1, Math.min(48, parseInt(rawHours, 10)))
                : 48;

        const limit =
            rawLimit !== undefined && !Number.isNaN(parseInt(rawLimit, 10))
                ? Math.max(1, Math.min(5000, parseInt(rawLimit, 10)))
                : 500;

        const { rows: maxRows } = await pool.query(`SELECT MAX(acq_ts) AS max FROM fires`);
        const maxTs = maxRows[0]?.max ? new Date(maxRows[0].max) : null;

        if (!maxTs) {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            return res.json({
                fires: [],
                count: 0,
                meta: { reason: "no-data", lookback_hours: hours }
            });
        }

        const end = maxTs;
        const start = new Date(end.getTime() - hours * 3600 * 1000);

        let sql = `
            SELECT
                id,
                latitude,
                longitude,
                brightness,
                confidence,
                acq_date,
                to_char(acq_time, 'HH24MI') AS acq_time,  -- return HHMM for frontend
                satellite,
                frp,
                daynight,
                acq_ts
            FROM fires
            WHERE acq_ts >= $1 AND acq_ts < $2
            ORDER BY acq_ts DESC
            LIMIT $3`;

        const params = [start.toISOString(), end.toISOString(), limit];

        const { rows } = await pool.query(sql, params);

        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.json({
            fires: rows,
            count: rows.length,
            meta: {
                mode: "latest-available",
                start_utc: start.toISOString(),
                end_utc: end.toISOString(),
                lookback_hours: hours
            }
        });

    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

//GET /api/update-fires
app.get("/api/update-fires", async (req, res) => {
    try {
        const cronSecret = process.env.CRON_SECRET;

        const authHeader = req.headers["authorization"];
        const headerToken = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length)
            : null;

        const queryToken = req.query.key;

        const authorized = Boolean(
            cronSecret &&
            (headerToken === cronSecret || queryToken === cronSecret)
        );

        if (!authorized) {
            console.warn("Unauthorized update-fires call", {
                hasAuthHeader: Boolean(authHeader),
                headerLen: headerToken?.length ?? 0,
                hasQueryKey: typeof queryToken === "string",
                queryLen: queryToken?.length ?? 0
            });
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("Updating fire data from NASA FIRMS...");

        await pool.query(`DELETE FROM fires WHERE acq_ts < NOW() - INTERVAL '72 hours'`);

        const result = await fetchFireData();
        const fetchedLength = Array.isArray(result) ? result.length : (result?.fetched ?? 0);
        const insertedCount = result?.inserted ?? null;

        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.json({
            message: "Fire data updated (daily snapshot)",
            fetchedInsideSC: fetchedLength,
            inserted: insertedCount,
            schedule: "Triggered by Vercel cron at 19:00 UTC (daily)"
        });
    } catch (error) {
        console.error("Error updating fire data:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;
