// Config resolution: CLI flags > env vars > .env.<environment>.local > defaults.
// Requirement #19 (configurable execution) + #7 (env-configurable target).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveProfile } from './profiles.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ENV_FILE_BY_ENVIRONMENT = {
  local: '.env.development.local',
  staging: '.env.staging.local',
  production: '.env.production.local',
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.length ? rest.join('=') : true;
  }
  return out;
}

function loadEnvFile(environment) {
  const file = ENV_FILE_BY_ENVIRONMENT[environment];
  if (!file) throw new Error(`Unknown --environment "${environment}" — choose local, staging, or production.`);
  const fullPath = path.join(REPO_ROOT, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing ${file} at repo root — copy .env.example to it first (see .env.example header).`);
  }
  process.loadEnvFile(fullPath);
}

export function resolveConfig(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  const environment = args.environment ?? process.env.SEED_ENVIRONMENT ?? 'local';
  loadEnvFile(environment);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const isLocalSupabase = /127\.0\.0\.1|localhost/.test(supabaseUrl);

  if (environment !== 'local' && isLocalSupabase) {
    throw new Error(
      `--environment=${environment} but ${ENV_FILE_BY_ENVIRONMENT[environment]} points at a local Supabase URL (${supabaseUrl}). Refusing to run — check the env file.`
    );
  }
  if (environment === 'local' && !isLocalSupabase) {
    throw new Error(
      `--environment=local but .env.development.local's NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}) is not local. Refusing to run against a non-local project under --environment=local.`
    );
  }

  const datasetName = args.dataset ?? process.env.SEED_DATASET ?? 'small';
  const dataset = resolveProfile(datasetName);

  const seed = Number(args.seed ?? process.env.SEED_RANDOM_SEED ?? 42);

  const statesArg = args.states ?? process.env.SEED_STATES;
  const states = statesArg
    ? statesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : null; // null = use every state in fakeData.STATE_NAMES

  const attendanceDays = args['attendance-days']
    ? Number(args['attendance-days'])
    : process.env.SEED_ATTENDANCE_DAYS
    ? Number(process.env.SEED_ATTENDANCE_DAYS)
    : dataset.attendanceDays;

  const clean = Boolean(args.clean ?? false);
  const resume = Boolean(args.resume ?? true) && !clean; // --clean always starts a fresh run tag
  const dryRun = Boolean(args['dry-run'] ?? false);

  // Defaults tuned conservatively for `next dev` (single Node process) +
  // the app's own Postgres pool (packages/platform/src/db/pool.ts, max: 10)
  // — 16-way org-pipeline concurrency was observed to overwhelm both and
  // surface as HTTP 500s and delayed-past-timeout magic-link emails once
  // volume ramped up (small-dataset smoke run, 2026-07-27). Raise these for
  // a production build (next start, clustered) or a beefier Postgres pool.
  const authConcurrency = Number(args['auth-concurrency'] ?? process.env.SEED_AUTH_CONCURRENCY ?? 4);
  const writeConcurrency = Number(args['write-concurrency'] ?? process.env.SEED_WRITE_CONCURRENCY ?? 6);

  // Tags every generated email/slug so re-runs (or concurrent small+medium
  // runs against the same DB) never collide — also the resumability
  // manifest's file name (requirement #20).
  const runTag = args['run-tag'] ?? process.env.SEED_RUN_TAG ?? `${datasetName}-${seed}`;

  const mailbox = {
    // Mailpit (labelled [inbucket] in supabase/config.toml, deprecated name)
    // — only used for `local`. staging/production must supply a different
    // AuthProvider (see lib/auth.mjs's provider seam) since there is no
    // catch-all test inbox to poll there.
    url: process.env.SEED_MAILBOX_URL ?? 'http://127.0.0.1:54324',
  };

  return {
    environment,
    appUrl,
    supabaseUrl,
    isLocalSupabase,
    datasetName,
    dataset,
    seed,
    states,
    attendanceDays,
    clean,
    resume,
    dryRun,
    authConcurrency,
    writeConcurrency,
    runTag,
    mailbox,
    repoRoot: REPO_ROOT,
    stateDir: path.join(REPO_ROOT, 'testing', '.state'),
  };
}
