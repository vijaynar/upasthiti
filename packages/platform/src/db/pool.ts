import { Pool, type PoolClient } from 'pg';
import { types as pgTypes } from 'pg';

// node-postgres's default `date` (OID 1082) parser returns a JS Date
// constructed from the string, which later gets JSON-serialized with a
// timezone shift (a `date` column has no time-of-day or zone — e.g. IST
// midnight on a `dob` column round-trips as the previous day's evening UTC).
// Every `date` column in this schema (users.dob, enrollments.started_on,
// etc.) is business data meant to stay a plain YYYY-MM-DD string end to
// end — overriding the parser once here, platform-wide, beats each module
// remembering to `::text`-cast every date column it selects.
pgTypes.setTypeParser(pgTypes.builtins.DATE, (value: string) => value);

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
