-- Migration: Add delegate_passcodes table
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.delegate_passcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid REFERENCES public.committees(id) ON DELETE CASCADE,
  passcode_hash text NOT NULL,
  passcode_salt text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'delegate',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  redeemed boolean NOT NULL DEFAULT false,
  redeemed_by uuid REFERENCES public.delegates(id),
  redeemed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_delegate_passcodes_comm_id ON public.delegate_passcodes(committee_id);
