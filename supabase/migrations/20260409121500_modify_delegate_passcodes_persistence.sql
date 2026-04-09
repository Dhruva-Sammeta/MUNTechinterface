-- Migration: Make delegate passcodes persistent and linkable to delegates
-- Run in Supabase SQL editor

ALTER TABLE IF EXISTS public.delegate_passcodes
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.delegates(id),
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_persistent boolean NOT NULL DEFAULT true;

-- Optional: keep existing columns (redeemed/expires_at) for compatibility but
-- passcode usage is now represented by assigned_user_id/assigned_at.
