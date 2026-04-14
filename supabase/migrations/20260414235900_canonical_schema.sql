-- Canonical Sapphire MUN schema (single source of truth)
-- Destructive rebuild by design.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS public.committee_messages CASCADE;
DROP TABLE IF EXISTS public.passcode_attempts CASCADE;
DROP TABLE IF EXISTS public.passcode_audit CASCADE;
DROP TABLE IF EXISTS public.delegate_passcodes CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.delegates CASCADE;
DROP TABLE IF EXISTS public.committees CASCADE;

CREATE TABLE public.committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text NOT NULL UNIQUE,
  join_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delegates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  country text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('delegate', 'eb', 'admin')),
  is_present boolean NOT NULL DEFAULT false,
  has_logged_in boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  mode text NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal', 'crisis', 'voting', 'break')),
  agenda_text text NOT NULL DEFAULT '',
  timer_duration_s integer NOT NULL DEFAULT 0,
  timer_started_at timestamptz,
  timer_paused boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(committee_id, date)
);

CREATE TABLE public.delegate_passcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  passcode_plain text,
  passcode_hash text NOT NULL,
  passcode_salt text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('delegate', 'eb', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  assigned_user_id uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  is_persistent boolean NOT NULL DEFAULT true
);

CREATE TABLE public.passcode_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid REFERENCES public.committees(id) ON DELETE SET NULL,
  passcode_id uuid REFERENCES public.delegate_passcodes(id) ON DELETE SET NULL,
  ip text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.passcode_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delegate_id uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  passcode_id uuid REFERENCES public.delegate_passcodes(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.committee_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'public' CHECK (scope IN ('public')),
  content text NOT NULL,
  is_approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delegates_committee ON public.delegates(committee_id);
CREATE INDEX idx_delegates_user ON public.delegates(user_id);
CREATE INDEX idx_sessions_committee_date ON public.sessions(committee_id, date);
CREATE INDEX idx_passcodes_committee ON public.delegate_passcodes(committee_id);
CREATE INDEX idx_passcodes_created ON public.delegate_passcodes(created_at DESC);
CREATE INDEX idx_messages_committee_created ON public.committee_messages(committee_id, created_at DESC);
CREATE INDEX idx_passcode_audit_passcode ON public.passcode_audit(passcode_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_my_delegate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_committee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT committee_id FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delegates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delegate_passcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passcode_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passcode_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY committees_select_public ON public.committees
  FOR SELECT USING (true);

CREATE POLICY delegates_select_same_committee ON public.delegates
  FOR SELECT USING (
    user_id = auth.uid()
    OR committee_id = public.get_my_committee_id()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY delegates_insert_self_or_admin ON public.delegates
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY delegates_update_self_or_admin ON public.delegates
  FOR UPDATE USING (user_id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY sessions_select_same_committee ON public.sessions
  FOR SELECT USING (committee_id = public.get_my_committee_id() OR public.get_my_role() = 'admin');

CREATE POLICY sessions_write_eb_admin ON public.sessions
  FOR ALL USING (
    (committee_id = public.get_my_committee_id() AND public.get_my_role() = 'eb')
    OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    (committee_id = public.get_my_committee_id() AND public.get_my_role() = 'eb')
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY messages_select_committee ON public.committee_messages
  FOR SELECT USING (committee_id = public.get_my_committee_id() OR public.get_my_role() = 'admin');

CREATE POLICY messages_insert_self ON public.committee_messages
  FOR INSERT WITH CHECK (sender_id = public.get_my_delegate_id());

CREATE POLICY passcodes_admin_all ON public.delegate_passcodes
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY passcode_attempts_admin_all ON public.passcode_attempts
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY passcode_audit_admin_all ON public.passcode_audit
  FOR ALL USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

INSERT INTO public.committees (name, short_name, join_code) VALUES
  ('Disarmament and International Security Committee', 'DISEC', 'DISEC'),
  ('United Nations Human Rights Council', 'UNHRC', 'UNHRC'),
  ('Lok Sabha', 'LOK_SABHA', 'LOK'),
  ('International Press', 'IP', 'IP'),
  ('Sapphire Crisis Committee', 'CRISIS', 'CRISIS');

COMMIT;
