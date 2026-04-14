-- Add plaintext passcode visibility column for admin operations.
-- This enables listing/copying passcodes in admin UI after creation.
ALTER TABLE IF EXISTS public.delegate_passcodes
  ADD COLUMN IF NOT EXISTS passcode_plain text;

CREATE INDEX IF NOT EXISTS idx_delegate_passcodes_passcode_plain
  ON public.delegate_passcodes(passcode_plain);
