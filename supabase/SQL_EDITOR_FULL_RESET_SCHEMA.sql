-- FULL CLEAN REBUILD (SQL Editor ready)
-- Paste this whole file into Supabase Dashboard -> SQL Editor and run once.
-- WARNING: destructive for app data. Use only in testing/staging.

BEGIN;

-- ------------------------------------------------------------
-- Drop all app tables/types (safe re-run)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.reported_messages CASCADE;
DROP TABLE IF EXISTS public.passcode_audit CASCADE;
DROP TABLE IF EXISTS public.passcode_attempts CASCADE;
DROP TABLE IF EXISTS public.delegate_passcodes CASCADE;
DROP TABLE IF EXISTS public.committee_messages CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.voting_rounds CASCADE;
DROP TABLE IF EXISTS public.chits CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.bloc_members CASCADE;
DROP TABLE IF EXISTS public.blocs CASCADE;
DROP TABLE IF EXISTS public.speaker_list_config CASCADE;
DROP TABLE IF EXISTS public.global_announcements CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.delegates CASCADE;
DROP TABLE IF EXISTS public.committees CASCADE;

DROP TYPE IF EXISTS public.message_scope CASCADE;

-- ------------------------------------------------------------
-- Core tables
-- ------------------------------------------------------------
CREATE TABLE public.committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('general','crisis','press','special','creative','parliamentary')),
  level text NOT NULL DEFAULT 'Intermediate',
  theme text NOT NULL DEFAULT 'default' CHECK (theme IN ('default','pirate','flame')),
  join_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delegates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  country text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'delegate' CHECK (role IN ('delegate','eb','presentation','admin')),
  is_present boolean NOT NULL DEFAULT false,
  has_logged_in boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  mode text NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','crisis','voting','break')),
  agenda_text text NOT NULL DEFAULT '',
  timer_duration_s integer NOT NULL DEFAULT 0,
  timer_started_at timestamptz,
  timer_paused boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(committee_id, date)
);

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegate_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  marked_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid NOT NULL REFERENCES public.delegates(id),
  UNIQUE(delegate_id, session_id)
);

CREATE TABLE public.voting_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resolution_title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.delegates(id)
);

CREATE TABLE public.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_round_id uuid NOT NULL REFERENCES public.voting_rounds(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  delegate_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  position text NOT NULL CHECK (position IN ('for','against','abstain')),
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(voting_round_id, delegate_id)
);

CREATE TABLE public.chits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  from_delegate_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  to_delegate_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 500),
  is_approved boolean,
  sent_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.delegates(id)
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('working_paper','draft_resolution','amendment','press_release')),
  content text,
  file_path text,
  file_name text,
  uploaded_by uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.delegates(id)
);

CREATE TABLE public.blocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#0A84FF',
  created_by uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bloc_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloc_id uuid NOT NULL REFERENCES public.blocs(id) ON DELETE CASCADE,
  delegate_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bloc_id, delegate_id)
);

CREATE UNIQUE INDEX idx_one_bloc_per_delegate ON public.bloc_members(delegate_id);

CREATE TABLE public.speaker_list_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE UNIQUE,
  speaking_time_s integer NOT NULL DEFAULT 90,
  yield_enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.delegates(id)
);

CREATE TABLE public.global_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  created_by uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

-- ------------------------------------------------------------
-- Chat
-- ------------------------------------------------------------
CREATE TYPE public.message_scope AS ENUM ('public', 'private', 'bloc', 'eb');

CREATE TABLE public.committee_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.delegates(id) ON DELETE CASCADE,
  bloc_id uuid REFERENCES public.blocs(id) ON DELETE CASCADE,
  scope public.message_scope NOT NULL DEFAULT 'public',
  content text NOT NULL,
  is_approved boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_message_approval_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope = 'private' THEN
    NEW.is_approved = false;
  ELSE
    NEW.is_approved = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_message_approval ON public.committee_messages;
CREATE TRIGGER trigger_set_message_approval
BEFORE INSERT ON public.committee_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_approval_default();

-- ------------------------------------------------------------
-- Passcodes + moderation reports
-- ------------------------------------------------------------
CREATE TABLE public.delegate_passcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  passcode_hash text NOT NULL,
  passcode_salt text NOT NULL,
  passcode_plain text,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'delegate' CHECK (role IN ('delegate','eb','admin','presentation')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  redeemed boolean NOT NULL DEFAULT false,
  redeemed_by uuid REFERENCES public.delegates(id),
  redeemed_at timestamptz,
  assigned_user_id uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  is_persistent boolean NOT NULL DEFAULT true,
  revoked boolean NOT NULL DEFAULT false
);

CREATE TABLE public.passcode_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text,
  committee_id uuid REFERENCES public.committees(id) ON DELETE SET NULL,
  passcode_id uuid REFERENCES public.delegate_passcodes(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.passcode_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delegate_id uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  passcode_id uuid REFERENCES public.delegate_passcodes(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reported_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.committee_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL,
  reporter_delegate_id uuid REFERENCES public.delegates(id) ON DELETE SET NULL,
  reporter_ip text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Helper functions used by RLS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_delegate()
RETURNS public.delegates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.get_my_committee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT committee_id FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_delegate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegates WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_eb_for(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegates
    WHERE user_id = auth.uid()
      AND committee_id = cid
      AND role IN ('eb','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_member_of(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegates WHERE user_id = auth.uid() AND committee_id = cid
  );
$$;

CREATE OR REPLACE FUNCTION public.session_committee(sid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT committee_id FROM public.sessions WHERE id = sid LIMIT 1;
$$;

-- ------------------------------------------------------------
-- RLS + policies (minimal + stable)
-- ------------------------------------------------------------
ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delegates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloc_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_list_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delegate_passcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passcode_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passcode_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reported_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY committees_select_public ON public.committees FOR SELECT USING (true);
CREATE POLICY committees_admin_write ON public.committees FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY delegates_select ON public.delegates FOR SELECT USING (
  user_id = auth.uid() OR committee_id = public.get_my_committee_id() OR public.is_admin()
);
CREATE POLICY delegates_insert_self ON public.delegates FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY delegates_update_self_or_admin ON public.delegates FOR UPDATE USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY delegates_delete_admin ON public.delegates FOR DELETE USING (public.is_admin());

CREATE POLICY sessions_select ON public.sessions FOR SELECT USING (public.is_member_of(committee_id) OR public.is_admin());
CREATE POLICY sessions_write_eb ON public.sessions FOR ALL USING (public.is_eb_for(committee_id)) WITH CHECK (public.is_eb_for(committee_id));

CREATE POLICY attendance_select ON public.attendance FOR SELECT USING (public.is_member_of(public.session_committee(session_id)) OR public.is_admin());
CREATE POLICY attendance_write_eb ON public.attendance FOR ALL USING (public.is_eb_for(public.session_committee(session_id))) WITH CHECK (public.is_eb_for(public.session_committee(session_id)));

CREATE POLICY voting_rounds_select ON public.voting_rounds FOR SELECT USING (public.is_member_of(public.session_committee(session_id)) OR public.is_admin());
CREATE POLICY voting_rounds_write_eb ON public.voting_rounds FOR ALL USING (public.is_eb_for(public.session_committee(session_id))) WITH CHECK (public.is_eb_for(public.session_committee(session_id)));

CREATE POLICY votes_select ON public.votes FOR SELECT USING (public.is_member_of(public.session_committee(session_id)) OR public.is_admin());
CREATE POLICY votes_insert_self ON public.votes FOR INSERT WITH CHECK (delegate_id = public.get_my_delegate_id());
CREATE POLICY votes_delete_admin ON public.votes FOR DELETE USING (public.is_admin());

CREATE POLICY chits_select ON public.chits FOR SELECT USING (
  from_delegate_id = public.get_my_delegate_id()
  OR (to_delegate_id = public.get_my_delegate_id() AND is_approved = true)
  OR public.is_eb_for(public.session_committee(session_id))
);
CREATE POLICY chits_insert ON public.chits FOR INSERT WITH CHECK (
  from_delegate_id = public.get_my_delegate_id()
  AND public.is_member_of(public.session_committee(session_id))
);
CREATE POLICY chits_update_eb ON public.chits FOR UPDATE USING (public.is_eb_for(public.session_committee(session_id))) WITH CHECK (public.is_eb_for(public.session_committee(session_id)));
CREATE POLICY chits_delete_eb ON public.chits FOR DELETE USING (public.is_eb_for(public.session_committee(session_id)));

CREATE POLICY documents_select ON public.documents FOR SELECT USING (
  uploaded_by = public.get_my_delegate_id()
  OR (status = 'approved' AND public.is_member_of(committee_id))
  OR public.is_eb_for(committee_id)
);
CREATE POLICY documents_insert ON public.documents FOR INSERT WITH CHECK (uploaded_by = public.get_my_delegate_id() AND public.is_member_of(committee_id));
CREATE POLICY documents_update_eb ON public.documents FOR UPDATE USING (public.is_eb_for(committee_id)) WITH CHECK (public.is_eb_for(committee_id));
CREATE POLICY documents_delete_eb ON public.documents FOR DELETE USING (public.is_eb_for(committee_id));

CREATE POLICY blocs_select ON public.blocs FOR SELECT USING (public.is_member_of(public.session_committee(session_id)) OR public.is_admin());
CREATE POLICY blocs_insert ON public.blocs FOR INSERT WITH CHECK (created_by = public.get_my_delegate_id() AND public.is_member_of(public.session_committee(session_id)));
CREATE POLICY blocs_update_eb_or_owner ON public.blocs FOR UPDATE USING (created_by = public.get_my_delegate_id() OR public.is_eb_for(public.session_committee(session_id))) WITH CHECK (created_by = public.get_my_delegate_id() OR public.is_eb_for(public.session_committee(session_id)));
CREATE POLICY blocs_delete_eb ON public.blocs FOR DELETE USING (public.is_eb_for(public.session_committee(session_id)));

CREATE POLICY bloc_members_select ON public.bloc_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.blocs b WHERE b.id = bloc_members.bloc_id AND public.is_member_of(public.session_committee(b.session_id))
  ) OR public.is_admin()
);
CREATE POLICY bloc_members_insert_self ON public.bloc_members FOR INSERT WITH CHECK (delegate_id = public.get_my_delegate_id());
CREATE POLICY bloc_members_delete_self_or_eb ON public.bloc_members FOR DELETE USING (
  delegate_id = public.get_my_delegate_id()
  OR EXISTS (
    SELECT 1 FROM public.blocs b WHERE b.id = bloc_members.bloc_id AND public.is_eb_for(public.session_committee(b.session_id))
  )
);

CREATE POLICY speaker_cfg_select ON public.speaker_list_config FOR SELECT USING (public.is_member_of(public.session_committee(session_id)) OR public.is_admin());
CREATE POLICY speaker_cfg_write_eb ON public.speaker_list_config FOR ALL USING (public.is_eb_for(public.session_committee(session_id))) WITH CHECK (public.is_eb_for(public.session_committee(session_id)));

CREATE POLICY announcements_select ON public.global_announcements FOR SELECT USING (true);
CREATE POLICY announcements_insert_admin ON public.global_announcements FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY announcements_delete_admin ON public.global_announcements FOR DELETE USING (public.is_admin());

CREATE POLICY messages_insert ON public.committee_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND sender_id = public.get_my_delegate_id());
CREATE POLICY messages_select ON public.committee_messages FOR SELECT USING (
  public.is_eb_for(committee_id)
  OR (scope = 'public' AND is_approved = true AND committee_id = public.get_my_committee_id())
  OR (scope = 'private' AND (sender_id = public.get_my_delegate_id() OR recipient_id = public.get_my_delegate_id()) AND (is_approved = true OR sender_id = public.get_my_delegate_id()))
  OR (scope = 'bloc' AND bloc_id IN (SELECT bm.bloc_id FROM public.bloc_members bm WHERE bm.delegate_id = public.get_my_delegate_id()))
  OR (scope = 'eb' AND public.is_eb_for(committee_id))
);
CREATE POLICY messages_update_eb ON public.committee_messages FOR UPDATE USING (public.is_eb_for(committee_id)) WITH CHECK (public.is_eb_for(committee_id));

CREATE POLICY reported_messages_insert_self ON public.reported_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND reporter_user_id = auth.uid());
CREATE POLICY reported_messages_select_admin_eb_or_reporter ON public.reported_messages FOR SELECT USING (public.is_admin() OR public.get_my_role() = 'eb' OR reporter_user_id = auth.uid());
CREATE POLICY reported_messages_update_admin_eb ON public.reported_messages FOR UPDATE USING (public.is_admin() OR public.get_my_role() = 'eb') WITH CHECK (public.is_admin() OR public.get_my_role() = 'eb');

CREATE POLICY delegate_passcodes_admin_all ON public.delegate_passcodes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY passcode_attempts_admin_all ON public.passcode_attempts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY passcode_audit_admin_all ON public.passcode_audit FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- Realtime publication
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sessions','delegates','attendance','votes','voting_rounds','chits',
    'documents','blocs','bloc_members','global_announcements','committee_messages',
    'reported_messages','delegate_passcodes'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Seed committees
-- ------------------------------------------------------------
INSERT INTO public.committees (name, short_name, type, level, theme, join_code) VALUES
('The Sapphire Special Committee','DHURANDHAR','crisis','Criminally Advanced','flame','DHUR1'),
('Disarmament and International Security Committee','DISEC','general','Intermediate','default','DISEC1'),
('United Nations Human Rights Council','UNHRC','general','Intermediate','default','UNHRC1'),
('The House of the People','LOK SABHA','parliamentary','Advanced','default','LOK1'),
('Indian Film Industry','IFI','creative','Fun','default','IFI1'),
('International Press','IP','press','All Levels','default','IP1'),
('The Grand Line Fleet','ONE PIECE','special','Classified','pirate','OP1');

COMMIT;
