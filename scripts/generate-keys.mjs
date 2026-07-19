#!/usr/bin/env node
// Generates the local RS256 keypair used to sign OUR session JWTs
// (docsV2/05_authentication_architecture.md §6) — Supabase's own tokens
// are discarded inside the auth adapter; this is what actually signs the
// access tokens the app issues. Writes JWT_PRIVATE_KEY/JWT_PUBLIC_KEY
// (base64-encoded PEM, single-line for .env storage) into
// .env.development.local.
//
// Usage: npm run keys:generate [-- --force]

import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.env.development.local');
const FORCE = process.argv.includes('--force');

function main() {
  if (!existsSync(ENV_FILE)) {
    console.error(
      `[keys:generate] ${ENV_FILE} does not exist. Run \`cp .env.example .env.development.local\` first (Doc 17 step 2).`
    );
    process.exit(1);
  }

  let contents = readFileSync(ENV_FILE, 'utf8');

  if (!FORCE && /^JWT_PRIVATE_KEY=.+$/m.test(contents)) {
    console.log('[keys:generate] JWT_PRIVATE_KEY already set — skipping (pass --force to rotate and invalidate all local sessions).');
    return;
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const privateB64 = Buffer.from(privateKey).toString('base64');
  const publicB64 = Buffer.from(publicKey).toString('base64');

  contents = setEnvVar(contents, 'JWT_PRIVATE_KEY', privateB64);
  contents = setEnvVar(contents, 'JWT_PUBLIC_KEY', publicB64);

  writeFileSync(ENV_FILE, contents);
  console.log(`[keys:generate] Wrote a new RS256 keypair into ${ENV_FILE}.`);
}

function setEnvVar(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(contents) ? contents.replace(pattern, line) : `${contents}\n${line}\n`;
}

main();
