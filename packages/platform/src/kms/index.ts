// platform/kms — wrap/unwrap per-org data encryption keys (Doc 14 §7,
// Doc 13 §4). Envelope encryption for C4 assets (KYC docs, medical
// payloads, face source images). Implementation lands in Phase 14
// (Medical Vault, schema-only) alongside the first C4 storage paths.

export interface KmsAdapter {
  wrapOrgKey(orgId: string): Promise<{ keyVersion: number; wrappedKey: string }>;
  unwrapOrgKey(orgId: string, keyVersion: number, wrappedKey: string): Promise<Buffer>;
}
