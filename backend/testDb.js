require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const res = await pool.query("SELECT NOW();");
        console.log("✅ Connected to Supabase! Current time:", res.rows[0].now);
        process.exit(0);
    } catch (error) {
        console.error("🚨 Database Connection Error:", error);
        process.exit(1);
    }
})();
