import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
