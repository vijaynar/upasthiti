-- Abhyas V2 — Personal info fields for the coach onboarding "About you" step
-- (docsV2/Wireframes - Coach Onboarding.dc.html #2b, and V1's
-- CoachOnboardingWizard layout). Gender/address/state/city/area have no
-- other home in the schema, so they land on users directly, same tier as
-- dob/avatar_path (0003_identity.sql). `phone` is a plain contact field, NOT
-- an auth method — same split V1 had (users.phone vs. a real phone-OTP
-- login, which stays schema-only per auth_methods' check constraint).

alter table users
  add column gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  add column phone text,
  add column address_line text,
  add column state text,
  add column city text,
  add column area text;
