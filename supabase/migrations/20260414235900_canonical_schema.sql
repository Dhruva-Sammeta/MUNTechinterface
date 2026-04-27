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
  recipient_id uuid REFERENCES public.delegates(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'public' CHECK (scope IN ('public', 'private')),
  content text NOT NULL,
  is_approved boolean NOT NULL DEFAULT true,
  visible_to_eb boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delegates_committee ON public.delegates(committee_id);
CREATE INDEX idx_delegates_user ON public.delegates(user_id);
CREATE INDEX idx_sessions_committee_date ON public.sessions(committee_id, date);
CREATE INDEX idx_passcodes_committee ON public.delegate_passcodes(committee_id);
CREATE INDEX idx_passcodes_created ON public.delegate_passcodes(created_at DESC);
CREATE INDEX idx_messages_committee_created ON public.committee_messages(committee_id, created_at DESC);
CREATE INDEX idx_messages_recipient_created ON public.committee_messages(recipient_id, created_at DESC) WHERE recipient_id IS NOT NULL;
CREATE INDEX idx_messages_private_eb_created ON public.committee_messages(committee_id, visible_to_eb, created_at DESC) WHERE scope = 'private';
CREATE INDEX idx_passcode_audit_passcode ON public.passcode_audit(passcode_id, created_at DESC);

ALTER TABLE public.committee_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY committee_messages_select_policy
ON public.committee_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.delegates me
    WHERE me.user_id = auth.uid()
      AND me.committee_id = committee_messages.committee_id
      AND (
        committee_messages.scope = 'public'
        OR (
          committee_messages.scope = 'private'
          AND (
            committee_messages.sender_id = me.id
            OR committee_messages.recipient_id = me.id
          )
        )
        OR (
          committee_messages.scope = 'private'
          AND committee_messages.visible_to_eb = true
          AND me.role IN ('eb', 'admin')
        )
      )
  )
);

CREATE POLICY committee_messages_insert_policy
ON public.committee_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.delegates me
    WHERE me.user_id = auth.uid()
      AND me.id = committee_messages.sender_id
      AND me.committee_id = committee_messages.committee_id
  )
  AND (
    (
      committee_messages.scope = 'public'
      AND committee_messages.recipient_id IS NULL
      AND committee_messages.visible_to_eb = false
    )
    OR
    (
      committee_messages.scope = 'private'
      AND committee_messages.recipient_id IS NOT NULL
      AND committee_messages.recipient_id <> committee_messages.sender_id
      AND EXISTS (
        SELECT 1
        FROM public.delegates recipient
        WHERE recipient.id = committee_messages.recipient_id
          AND recipient.committee_id = committee_messages.committee_id
      )
    )
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'committee_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.committee_messages;
    END IF;
  END IF;
END
$$;

INSERT INTO public.committees (name, short_name, join_code) VALUES
  ('Disarmament and International Security Committee', 'DISEC', 'DISEC'),
  ('United Nations Human Rights Council', 'UNHRC', 'UNHRC'),
  ('Lok Sabha', 'LOK_SABHA', 'LOK'),
  ('International Press', 'IP', 'IP'),
  ('Sapphire Crisis Committee', 'CRISIS', 'CRISIS');

COMMIT;
