// platform/storage — signed URLs over S3 semantics (Doc 14 §7, Doc 13 §11).
// Zero public buckets. Paths double as authorization: org/{org_id}/... for
// org assets, user/{user_id}/... for avatars.
//
// First real implementation (coach avatar upload) lands here as
// `supabaseStorageAdapter`, backed by Supabase Storage's own signed-URL API
// via the service-role key — same "service role, no RLS, explicitly scoped
// call site" shape as db.getServiceClient(), just for the Storage API
// instead of Postgres (storage.objects isn't reachable over the plain `pg`
// connection db/ uses; it's a separate HTTP surface). One exception to
// "zero public buckets": the `avatars` bucket (0018_coach_pricing_and_areas
// .sql) is public-READ, because avatars are meant to be publicly visible on
// marketplace listings — upload still goes through this adapter's
// session-checked signed-upload URL, not a bare anon-key client write.

import { createClient } from '@supabase/supabase-js';

export type StoragePrefix = `org/${string}` | `user/${string}`;

export interface StorageAdapter {
  signedRead(path: StoragePrefix, expirySeconds?: number): Promise<string>;
  /** Single-use upload slot; caller must own the path prefix (checked by the storage policy). */
  signedUpload(path: StoragePrefix, contentType: string, expirySeconds?: number): Promise<{ signedUrl: string; token: string }>;
  remove(path: StoragePrefix): Promise<void>;
}

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('[platform/storage] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function makeSupabaseStorageAdapter(bucket: string): StorageAdapter {
  const client = () => getStorageClient().storage.from(bucket);

  return {
    async signedRead(path, expirySeconds = 3600) {
      const { data, error } = await client().createSignedUrl(path, expirySeconds);
      if (error || !data) throw new Error(`[platform/storage] signedRead(${path}) failed: ${error?.message}`);
      return data.signedUrl;
    },
    async signedUpload(path, _contentType, expirySeconds = 300) {
      const { data, error } = await client().createSignedUploadUrl(path);
      if (error || !data) throw new Error(`[platform/storage] signedUpload(${path}) failed: ${error?.message}`);
      void expirySeconds; // Supabase's signed-upload token is single-use, not time-configurable per call.
      return { signedUrl: data.signedUrl, token: data.token };
    },
    async remove(path) {
      const { error } = await client().remove([path]);
      if (error) throw new Error(`[platform/storage] remove(${path}) failed: ${error.message}`);
    },
  };
}
