-- Abhyas V2 — auth_methods.verified_identifier (Phase 3 bugfix).
--
-- `auth_methods.provider_uid` for 'email_otp' holds Supabase's
-- `auth.users.id` (a UUID), not the email address itself — the actual
-- verified email was never persisted in OUR OWN schema anywhere
-- (migration 0003's resolveOrCreateIdentity only used it transiently to
-- derive a display name). Phase 3's invitation-acceptance flow needs to
-- match an invitation's `email` against the accepting user's verified
-- login, and per IMPLEMENTATION_STATUS's own stated principle
-- ("`auth_methods` table is ours, not Supabase's", Doc 02 §11 portability)
-- that match must not reach into `auth.users` directly — it belongs in a
-- column we own.
--
-- The backfill covers existing rows (local/staging data only, this is a
-- pre-cutover rebuild branch); going forward, identity-auth's
-- resolveOrCreateIdentity populates this at insert time.

alter table auth_methods add column verified_identifier text;

update auth_methods am
set verified_identifier = au.email
from auth.users au
where am.provider = 'email_otp' and au.id::text = am.provider_uid and au.email is not null;
