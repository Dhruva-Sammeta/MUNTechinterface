-- Migration: Add passcode_attempts and passcode_audit tables; add revoked flag
-- Run in Supabase SQL editor

-- Attempts table to record verification attempts for rate limiting and analysis
CREATE TABLE IF NOT EXISTS public.passcode_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text,
  committee_id uuid REFERENCES public.committees(id) ON DELETE SET NULL,
  passcode_id uuid REFERENCES public.delegate_passcodes(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passcode_attempts_ip_time ON public.passcode_attempts(ip, created_at);

-- Audit table to track admin actions and passcode claims
CREATE TABLE IF NOT EXISTS public.passcode_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delegate_id uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  passcode_id uuid REFERENCES public.delegate_passcodes(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add revoked flag to delegate_passcodes
ALTER TABLE IF EXISTS public.delegate_passcodes
  ADD COLUMN IF NOT EXISTS revoked boolean NOT NULL DEFAULT false;
