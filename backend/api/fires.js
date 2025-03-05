require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("../database");

const app = express();
app.use(cors());

//Debugging: Print DATABASE_URL in Vercel logs
console.log("DATABASE_URL in Vercel:", process.env.DATABASE_URL);

//API Route - Get fires from PostgreSQL (Supabase)
app.get("/fires", async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM fires");
        res.json({ fires: rows });
    } catch (error) {
        console.error("🚨 Database Error:", error);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = app;









