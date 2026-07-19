import { Pool, type PoolClient } from 'pg';

// One pool per process, sized for pgBouncer transaction mode (Doc 15 §9).
// `platform/db` is the only module allowed to construct this — everything
// else in the app goes through withRequestContext()/getServiceClient() below.
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[platform/db] Missing DATABASE_URL environment variable.');
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export type { PoolClient };
