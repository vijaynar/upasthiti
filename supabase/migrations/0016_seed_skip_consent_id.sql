-- Seeds the SkipConsentID feature flag and relaxes the face_enrollments
-- consent requirement to be conditional on it.
--
-- On by default: face enrollment does NOT require a guardian/self
-- biometric_face consentId out of the box. Turning this off for an org
-- restores the original hardcoded behavior (consentId required, DB-enforced
-- by face_enrollments_enforce_consent, migration 0004).

insert into feature_flags (key, default_on, description) values
  ('SkipConsentID', true,
   'When ON (the default), face enrollment (face_enrollments) does not require a guardian/self biometric_face consentId for this org — the field is optional and, if omitted, the consent check is skipped entirely. Turn OFF for an org to require an active biometric_face consentId again.')
on conflict (key) do nothing;

alter table face_enrollments alter column consent_id drop not null;

create or replace function enforce_face_enrollment_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  subject_id uuid;
  consent_skippable boolean;
begin
  select coalesce(off.enabled, ff.default_on, false) into consent_skippable
  from feature_flags ff
  left join org_feature_flags off on off.organization_id = new.organization_id and off.flag_key = ff.key
  where ff.key = 'SkipConsentID';

  if coalesce(consent_skippable, false) then
    return new;
  end if;

  if new.enrollment_id is not null then
    select student_user_id into subject_id from enrollments where id = new.enrollment_id;
  else
    select user_id into subject_id from memberships where id = new.membership_id;
  end if;

  if new.consent_id is null or not exists (
    select 1 from consents
    where id = new.consent_id
      and kind = 'biometric_face'
      and subject_user_id = subject_id
      and withdrawn_at is null
  ) then
    raise exception 'face_enrollment requires an active biometric_face consent for the same subject';
  end if;

  return new;
end;
$$;
