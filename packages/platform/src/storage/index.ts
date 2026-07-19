// platform/storage — signed URLs over S3 semantics (Doc 14 §7, Doc 13 §11).
// Zero public buckets. Paths double as authorization: org/{org_id}/... for
// org assets, user/{user_id}/... for avatars. Implementation lands with the
// first module that needs uploads (coach documents, Phase 5/12).

export type StoragePrefix = `org/${string}` | `user/${string}`;

export interface StorageAdapter {
  signedRead(path: StoragePrefix, expirySeconds?: number): Promise<string>;
  /** Single-use upload slot; caller must own the path prefix (checked by the storage policy). */
  signedUpload(path: StoragePrefix, contentType: string, expirySeconds?: number): Promise<string>;
  remove(path: StoragePrefix): Promise<void>;
}
