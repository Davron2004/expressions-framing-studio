import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPool } from "../src/lib/server/db";

async function main() {
  // Next loads env files for the app, while this standalone script does not.
  // Local values intentionally override only values that were not already supplied.
  try {
    process.loadEnvFile(".env.local");
  } catch (error: unknown) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ))
      throw error;
  }
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env");
    } catch (error: unknown) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
  }
  const directory = join(process.cwd(), "db");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const pool = getPool();
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  for (const file of files) {
    const applied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE name = $1",
      [file],
    );
    if (applied.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(join(directory, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.end();
}
main().catch((error) => {
  console.error(
    "Migration failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
