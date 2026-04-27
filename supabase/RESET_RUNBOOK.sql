-- RESET RUNBOOK (staging/test only)
--
-- IMPORTANT:
-- - Do NOT use psql "\i" include commands in Supabase SQL editor.
-- - Canonical full reset path is Supabase CLI:
--     npx supabase db reset --local --yes
--   or for linked project:
--     npx supabase db reset --linked --yes
--
-- Optional SQL-only operation below wipes app data while preserving schema.

TRUNCATE TABLE
  public.committee_messages,
  public.passcode_audit,
  public.passcode_attempts,
  public.delegate_passcodes,
  public.sessions,
  public.delegates,
  public.committees
RESTART IDENTITY CASCADE;
