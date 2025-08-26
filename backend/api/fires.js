//express API routes for serving and updating fire detections

const express = require("express");
const cors = require("cors");
const pool = require("../database");
const { fetchFireData } = require("../fireService");

const app = express();

//---- CORS setup -----------------------------------------------------------
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

//extra CORS config
const corsOptions = {
  origin: "*",
  methods: "GET",
  allowedHeaders: ["Content-Type"]
};
app.use(cors(corsOptions));

//---- Route: get list of fires ---------------------------------------------
app.get("/api/fires", async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || null;

    let query = "SELECT * FROM fires";
    let params = [];

    if (hours) {
      //only return rows newer than NOW() - hours
      query += " WHERE (acq_date || ' ' || acq_time)::timestamp >= NOW() - ($1 || ' hours')::interval";
      params.push(hours);
    }

    //order newest first
    query += " ORDER BY acq_date DESC, acq_time DESC";

    const { rows } = await pool.query(query, params);

    //cache for 30 minutes in browsers/CDNs
    res.setHeader("Cache-Control", "public, max-age=1800, must-revalidate");
    res.json({ fires: rows });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

//---- Route: trigger update from NASA FIRMS -------------------------------
app.get("/api/update-fires", async (req, res) => {
  try {
    console.log("Updating fire data from NASA FIRMS...");
    if (!fetchFireData) throw new Error("fetchFireData is not defined!");
    
    await fetchFireData(); //pulls fresh data into DB
    res.json({ message: "Fire data updated successfully!" });
  } catch (error) {
    console.error("Error updating fire data:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;










