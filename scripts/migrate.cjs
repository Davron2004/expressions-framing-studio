const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
async function migrate() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL before deploying.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      fs.readFileSync(path.join(__dirname, "../db/001_initial.sql"), "utf8"),
    );
    console.log("Database migration complete.");
  } finally {
    await pool.end();
  }
}
migrate().catch(() => {
  console.error(
    "Database migration failed. Check DATABASE_URL and database availability.",
  );
  process.exitCode = 1;
});
