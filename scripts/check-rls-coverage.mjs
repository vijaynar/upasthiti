#!/usr/bin/env node
// RLS coverage gate (docsV2/13_security_compliance.md §2.1). Fails the
// build if any table in `public` lacks `rowsecurity = true`, or has RLS
// enabled but zero policies — unless explicitly allow-listed below with a
// justification. Run in CI after every migration apply.
//
// Usage: node scripts/check-rls-coverage.mjs  (reads DATABASE_URL)

import pg from 'pg';

const ALLOWLIST = [
  {
    table: 'jobs',
    reason:
      'Service-role-only queue table (Doc 14 §8) — RLS enabled, deliberately zero policies (default-deny for the anon/authenticated API path); only the worker/service-role client ever reads it, and that bypasses RLS by design.',
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[check-rls-coverage] Missing DATABASE_URL.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  const { rows: tables } = await client.query(
    `select c.relname as table_name, c.relrowsecurity as rls_enabled
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`
  );
  const { rows: policyCounts } = await client.query(
    `select tablename, count(*)::int as policy_count from pg_policies where schemaname = 'public' group by tablename`
  );
  const policyCountByTable = Object.fromEntries(policyCounts.map((r) => [r.tablename, r.policy_count]));

  await client.end();

  const allowlisted = new Set(ALLOWLIST.map((a) => a.table));
  const failures = [];

  for (const { table_name: table, rls_enabled: rlsEnabled } of tables) {
    if (allowlisted.has(table)) continue;
    const policyCount = policyCountByTable[table] ?? 0;
    if (!rlsEnabled) {
      failures.push(`${table}: RLS not enabled`);
    } else if (policyCount === 0) {
      failures.push(`${table}: RLS enabled but zero policies`);
    }
  }

  if (failures.length > 0) {
    console.error('[check-rls-coverage] FAILED — tables missing RLS coverage:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('\nEither add policies, or add an allow-list entry with a justification in scripts/check-rls-coverage.mjs.');
    process.exit(1);
  }

  console.log(`[check-rls-coverage] OK — ${tables.length} table(s) checked, ${ALLOWLIST.length} allow-listed.`);
}

main().catch((err) => {
  console.error('[check-rls-coverage] error:', err);
  process.exit(1);
});
