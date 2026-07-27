-- Historical backdating capability (2026-07-26 decision) — added specifically
-- so the API-driven test-data seeding framework (testing/) can produce
-- realistic historical activity (attendance history, revenue/review trends)
-- WITHOUT ever writing to the database directly. Real production write APIs
-- never accepted a backdated timestamp before this migration; the app-layer
-- functions this backs (packages/modules/scheduling's backfillBatchSessions,
-- attendance's recordAttendance/overrideAttendance, marketplace's
-- createReview, finance's recordManualPayment) all gate this behind BOTH:
--   1. the org's `historical_backdating` feature flag (off by default,
--      platform/org staff opt in per-org via the existing feature-flags
--      console — migration 0007_platform_admin's mechanism, not new schema),
--   2. the caller's own real permission for that action (or, for the new
--      session-backfill capability specifically, the new
--      `schedule.batch.backfill` key below — narrower than the base
--      `schedule.calendar.manage` key so Coach/Branch Admin can create
--      sessions normally but only Owner/Org Admin can backfill history).
-- Every backdated write still runs through real validation/RLS/business
-- logic (ledger balance trigger, append-only attendance chain, etc.) — only
-- the timestamp column's value is caller-supplied instead of defaulting to
-- now(). See IMPLEMENTATION_STATUS.md's "Historical backdating" section for
-- the full rationale and the real-world misuse scenarios considered.

insert into permissions (key) values ('schedule.batch.backfill')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, 'schedule.batch.backfill'
from roles r
where r.key in ('owner', 'org_admin') and r.organization_id is null
on conflict do nothing;

insert into feature_flags (key, default_on, description) values
  ('historical_backdating', false,
   'When enabled for an organization, staff holding the relevant permission may backfill past class_sessions and backdate the created/recorded timestamp on attendance records, reviews, and manual payments. Off by default — intended for seeding realistic historical demo/test data, not routine use.')
on conflict (key) do nothing;

-- post_ledger_entries() gains an optional occurred_at so a backdated payment
-- (recordManualPayment) can post a ledger entry group dated to match, instead
-- of every ledger leg being stamped "now" regardless of the payment's own
-- backdated created_at. Default preserves every existing 1-argument call site
-- unchanged (drop+recreate rather than a second overload, so there's exactly
-- one live definition of this function).
drop function if exists post_ledger_entries(jsonb);

create function post_ledger_entries(p_entries jsonb, p_occurred_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  grp uuid := gen_random_uuid();
  total bigint;
  leg jsonb;
begin
  select coalesce(sum((e->>'amountMinor')::bigint), 0) into total from jsonb_array_elements(p_entries) e;
  if total <> 0 then
    raise exception 'ledger_entry_group_unbalanced: legs sum to %, expected 0', total;
  end if;

  for leg in select * from jsonb_array_elements(p_entries) loop
    insert into ledger_entries (entry_group, account_id, organization_id, amount_minor, currency, ref_type, ref_id, occurred_at)
    values (
      grp,
      (leg->>'accountId')::uuid,
      (select organization_id from ledger_accounts where id = (leg->>'accountId')::uuid),
      (leg->>'amountMinor')::bigint,
      leg->>'currency',
      leg->>'refType',
      (leg->>'refId')::uuid,
      p_occurred_at
    );
  end loop;

  return grp;
end;
$$;
