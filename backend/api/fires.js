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
                ? Math.max(1, Math.min(24 * 30, parseInt(rawHours, 10)))
                : null;

        const limit =
            rawLimit !== undefined && !Number.isNaN(parseInt(rawLimit, 10))
                ? Math.max(1, Math.min(5000, parseInt(rawLimit, 10)))
                : 500;

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
            FROM fires`;
        const params = [];

        if (hours) {
            params.push(hours);
            sql += ` WHERE acq_ts >= NOW() - ($${params.length} || ' hours')::interval`;
        }

        sql += ` ORDER BY acq_ts DESC`;
        params.push(limit);
        sql += ` LIMIT $${params.length}`;

        const { rows } = await pool.query(sql, params);

        //cache until the next scheduled run at 19:00 UTC (daily)
        const now = new Date();
        const next1900UTC = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 19, 0, 0, 0
        ));
        if (now >= next1900UTC) {
            next1900UTC.setUTCDate(next1900UTC.getUTCDate() + 1);
        }
        const maxAge = Math.max(0, Math.floor((next1900UTC - now) / 1000));

        res.setHeader("Cache-Control", `public, max-age=${maxAge}, must-revalidate`);
        res.setHeader("Expires", next1900UTC.toUTCString());
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.json({ fires: rows, count: rows.length });

    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

//GET /api/update-fires
//scheduled in vercel.json to run ONCE DAILY at 19:00 UTC
app.get("/api/update-fires", async (req, res) => {
    try {
        const cronSecret = process.env.CRON_SECRET;

        //accept either Authorization header (Vercel cron) or ?key=... (manual)
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
            //debug info
            console.warn("Unauthorized update-fires call", {
                hasAuthHeader: Boolean(authHeader),
                headerLen: headerToken?.length ?? 0,
                hasQueryKey: typeof queryToken === "string",
                queryLen: queryToken?.length ?? 0
            });
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("Updating fire data from NASA FIRMS...");
        const fires = await fetchFireData(); //pulls fresh data into DB

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.json({
            message: "Fire data updated",
            fetchedInsideSC: fires.length,
            schedule: "Triggered by Vercel cron at 19:00 UTC (daily)"
        });
    } catch (error) {
        console.error("Error updating fire data:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;

