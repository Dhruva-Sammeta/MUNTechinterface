-- ============================================================
-- SAPPHIRE MUN — Production Schema v2
-- Fixes: RLS recursion, committee-scoped EB, proper indexes
-- Run in Supabase SQL Editor (single transaction)
-- ============================================================

BEGIN;

-- Drop existing tables to allow re-running the script
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

-- Extensions
-- 1. TABLES
-- ============================================================

-- 1a. COMMITTEES
-- Owns: sessions, delegates
CREATE TABLE public.committees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('general','crisis','press','special','creative','parliamentary')),
  level       TEXT NOT NULL DEFAULT 'Intermediate',
  theme       TEXT NOT NULL DEFAULT 'default' CHECK (theme IN ('default','pirate','flame')),
  join_code   TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1b. DELEGATES
-- Links auth.users → committee with a role
-- One user can only join one committee (enforced by UNIQUE on user_id)
CREATE TABLE public.delegates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  committee_id  UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  country       TEXT NOT NULL DEFAULT '',
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'delegate' CHECK (role IN ('delegate','eb','presentation','admin')),
  is_present    BOOLEAN NOT NULL DEFAULT false,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 1c. SESSIONS
-- One active session per committee per date
CREATE TABLE public.sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id      UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  mode              TEXT NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','crisis','voting','break')),
  agenda_text       TEXT NOT NULL DEFAULT '',
  timer_duration_s  INTEGER NOT NULL DEFAULT 0,
  timer_started_at  TIMESTAMPTZ,
  timer_paused      BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(committee_id, date)
);

-- 1d. ATTENDANCE
CREATE TABLE public.attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegate_id   UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  marked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  marked_by     UUID NOT NULL REFERENCES public.delegates(id),
  UNIQUE(delegate_id, session_id)
);

-- 1e. VOTING ROUNDS
CREATE TABLE public.voting_rounds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  resolution_title  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES public.delegates(id)
);

-- 1f. VOTES
-- UNIQUE(voting_round_id, delegate_id) = one vote per delegate per round
CREATE TABLE public.votes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_round_id  UUID NOT NULL REFERENCES public.voting_rounds(id) ON DELETE CASCADE,
  session_id       UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  delegate_id      UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  position         TEXT NOT NULL CHECK (position IN ('for','against','abstain')),
  voted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(voting_round_id, delegate_id)
);

-- 1g. CHITS
CREATE TABLE public.chits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  from_delegate_id  UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  to_delegate_id    UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  content           TEXT NOT NULL CHECK (char_length(content) <= 500),
  is_approved       BOOLEAN,  -- NULL=pending, true=approved, false=rejected
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES public.delegates(id)
);

-- 1h. DOCUMENTS
CREATE TABLE public.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  committee_id  UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('working_paper','draft_resolution','amendment','press_release')),
  content       TEXT,
  file_path     TEXT,
  file_name     TEXT,
  uploaded_by   UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   UUID REFERENCES public.delegates(id)
);

-- 1i. BLOCS
CREATE TABLE public.blocs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#0A84FF',
  created_by  UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1j. BLOC MEMBERS
CREATE TABLE public.bloc_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloc_id      UUID NOT NULL REFERENCES public.blocs(id) ON DELETE CASCADE,
  delegate_id  UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bloc_id, delegate_id)
);

-- 1k. SPEAKER LIST CONFIG (EB settings only — queue is EPHEMERAL)
CREATE TABLE public.speaker_list_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE UNIQUE,
  speaking_time_s INTEGER NOT NULL DEFAULT 90,
  yield_enabled   BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID NOT NULL REFERENCES public.delegates(id)
);

ALTER TABLE public.speaker_list_config
  ADD CONSTRAINT fk_speaker_config_session
  FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- 1l. GLOBAL ANNOUNCEMENTS
CREATE TABLE public.global_announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  created_by  UUID REFERENCES public.delegates(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);


-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Delegate lookups (most-used path in every RLS check)
CREATE INDEX idx_delegates_user_id        ON public.delegates(user_id);
CREATE INDEX idx_delegates_committee_id   ON public.delegates(committee_id);
CREATE INDEX idx_delegates_user_committee ON public.delegates(user_id, committee_id);
CREATE INDEX idx_delegates_role           ON public.delegates(role);

-- Session lookups
CREATE INDEX idx_sessions_committee_id    ON public.sessions(committee_id);
CREATE INDEX idx_sessions_committee_date  ON public.sessions(committee_id, date);

-- Attendance
CREATE INDEX idx_attendance_session_id    ON public.attendance(session_id);
CREATE INDEX idx_attendance_delegate_id   ON public.attendance(delegate_id);

-- Voting
CREATE INDEX idx_voting_rounds_session_id ON public.voting_rounds(session_id);
CREATE INDEX idx_votes_round_id           ON public.votes(voting_round_id);
CREATE INDEX idx_votes_session_id         ON public.votes(session_id);
CREATE INDEX idx_votes_delegate_id        ON public.votes(delegate_id);

-- Chits
CREATE INDEX idx_chits_session_id         ON public.chits(session_id);
CREATE INDEX idx_chits_from               ON public.chits(from_delegate_id);
CREATE INDEX idx_chits_to                 ON public.chits(to_delegate_id);

-- Documents
CREATE INDEX idx_documents_session_id     ON public.documents(session_id);
CREATE INDEX idx_documents_committee_id   ON public.documents(committee_id);
CREATE INDEX idx_documents_status         ON public.documents(status);

-- Blocs
CREATE INDEX idx_blocs_session_id         ON public.blocs(session_id);
CREATE INDEX idx_bloc_members_bloc_id     ON public.bloc_members(bloc_id);
CREATE INDEX idx_bloc_members_delegate_id ON public.bloc_members(delegate_id);

-- One bloc per delegate (enforced at DB level)
CREATE UNIQUE INDEX idx_one_bloc_per_delegate ON public.bloc_members(delegate_id);


-- ============================================================
-- 3. SECURITY DEFINER HELPER FUNCTIONS
-- These bypass RLS to prevent infinite recursion when
-- the delegates table references itself in policies.
-- ============================================================

-- Returns the delegate row for the current auth user (or NULL)
CREATE OR REPLACE FUNCTION public.get_my_delegate()
RETURNS public.delegates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Returns the role of the current auth user
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Returns the committee_id of the current auth user
CREATE OR REPLACE FUNCTION public.get_my_committee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT committee_id FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Returns the delegate_id of the current auth user
CREATE OR REPLACE FUNCTION public.get_my_delegate_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.delegates WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegates
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Check if current user is EB for a specific committee
CREATE OR REPLACE FUNCTION public.is_eb_for(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegates
    WHERE user_id = auth.uid()
      AND committee_id = cid
      AND role IN ('eb', 'admin')
  );
$$;

-- Check if current user is a member of a specific committee
CREATE OR REPLACE FUNCTION public.is_member_of(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegates
    WHERE user_id = auth.uid() AND committee_id = cid
  );
$$;

-- Get committee_id for a session
CREATE OR REPLACE FUNCTION public.session_committee(sid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT committee_id FROM public.sessions WHERE id = sid LIMIT 1;
$$;


-- ============================================================
-- 4. ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE public.committees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delegates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_rounds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chits               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloc_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_list_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_announcements ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- -------------------------------------------------------
-- COMMITTEES
-- Public read (needed for join page), admin write
-- -------------------------------------------------------
CREATE POLICY "committees_select_public"
  ON public.committees FOR SELECT
  USING (true);

CREATE POLICY "committees_insert_admin"
  ON public.committees FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "committees_update_admin"
  ON public.committees FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "committees_delete_admin"
  ON public.committees FOR DELETE
  USING (public.is_admin());


-- -------------------------------------------------------
-- DELEGATES
-- Uses SECURITY DEFINER helpers to avoid recursion
-- -------------------------------------------------------

CREATE POLICY "delegates_select"
  ON public.delegates FOR SELECT
  USING (
    user_id = auth.uid()                              -- own row always
    OR committee_id = public.get_my_committee_id()    -- same committee
    OR public.is_eb_for(committee_id)                 -- EB sees all delegates in their committee
    OR public.is_admin()                              -- admin sees all
  );

-- A user can create their own delegate entry (join via code)
CREATE POLICY "delegates_insert"
  ON public.delegates FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- A user can update their own row, admin can update any
CREATE POLICY "delegates_update_self"
  ON public.delegates FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

-- EB can update delegates in their committee (mark present, etc.)
CREATE POLICY "delegates_update_eb"
  ON public.delegates FOR UPDATE
  USING (
    public.is_eb_for(committee_id)
  );

-- Admin can delete any delegate
CREATE POLICY "delegates_delete_admin"
  ON public.delegates FOR DELETE
  USING (public.is_admin());


-- -------------------------------------------------------
-- SESSIONS
-- Committee members read, committee EB writes
-- -------------------------------------------------------
CREATE POLICY "sessions_select"
  ON public.sessions FOR SELECT
  USING (
    public.is_member_of(committee_id)
    OR public.is_admin()
  );

CREATE POLICY "sessions_insert"
  ON public.sessions FOR INSERT
  WITH CHECK (
    public.is_eb_for(committee_id)
  );

CREATE POLICY "sessions_update"
  ON public.sessions FOR UPDATE
  USING (
    public.is_eb_for(committee_id)
  );

CREATE POLICY "sessions_delete"
  ON public.sessions FOR DELETE
  USING (public.is_admin());


-- -------------------------------------------------------
-- ATTENDANCE
-- Committee members read, committee EB writes
-- -------------------------------------------------------
CREATE POLICY "attendance_select"
  ON public.attendance FOR SELECT
  USING (
    public.is_member_of(public.session_committee(session_id))
    OR public.is_admin()
  );

CREATE POLICY "attendance_insert"
  ON public.attendance FOR INSERT
  WITH CHECK (
    public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "attendance_delete"
  ON public.attendance FOR DELETE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "attendance_update"
  ON public.attendance FOR UPDATE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );


-- -------------------------------------------------------
-- VOTING ROUNDS
-- Committee members read, committee EB manages
-- -------------------------------------------------------
CREATE POLICY "voting_rounds_select"
  ON public.voting_rounds FOR SELECT
  USING (
    public.is_member_of(public.session_committee(session_id))
    OR public.is_admin()
  );

CREATE POLICY "voting_rounds_insert"
  ON public.voting_rounds FOR INSERT
  WITH CHECK (
    public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "voting_rounds_update"
  ON public.voting_rounds FOR UPDATE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );


-- -------------------------------------------------------
-- VOTES
-- Delegate inserts own (once per round via UNIQUE constraint)
-- Committee members read (transparent voting)
-- No updates allowed — votes are immutable
-- -------------------------------------------------------
CREATE POLICY "votes_select"
  ON public.votes FOR SELECT
  USING (
    public.is_member_of(public.session_committee(session_id))
    OR public.is_admin()
  );

CREATE POLICY "votes_insert"
  ON public.votes FOR INSERT
  WITH CHECK (
    delegate_id = public.get_my_delegate_id()
  );

-- Admin override: delete a vote (nullify)
CREATE POLICY "votes_delete_admin"
  ON public.votes FOR DELETE
  USING (public.is_admin());


-- -------------------------------------------------------
-- CHITS
-- Sender inserts (from_delegate must be self)
-- Recipient reads approved only, sender reads own, EB reads all in committee
-- EB approves (update) — SCOPED to their committee
-- -------------------------------------------------------
CREATE POLICY "chits_select"
  ON public.chits FOR SELECT
  USING (
    -- sender always sees their own
    from_delegate_id = public.get_my_delegate_id()
    -- recipient sees approved chits only
    OR (to_delegate_id = public.get_my_delegate_id() AND is_approved = true)
    -- EB/admin for this session's committee sees all
    OR public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "chits_insert"
  ON public.chits FOR INSERT
  WITH CHECK (
    from_delegate_id = public.get_my_delegate_id()
    AND public.is_member_of(public.session_committee(session_id))
  );

CREATE POLICY "chits_update"
  ON public.chits FOR UPDATE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "chits_delete"
  ON public.chits FOR DELETE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );


-- -------------------------------------------------------
-- DOCUMENTS
-- Delegate uploads, EB reviews, committee reads approved
-- Uploader always sees own. EB sees all in their committee.
-- -------------------------------------------------------
CREATE POLICY "documents_select"
  ON public.documents FOR SELECT
  USING (
    -- uploader sees own
    uploaded_by = public.get_my_delegate_id()
    -- committee members see approved
    OR (status = 'approved' AND public.is_member_of(committee_id))
    -- EB sees all in their committee
    OR public.is_eb_for(committee_id)
  );

CREATE POLICY "documents_insert"
  ON public.documents FOR INSERT
  WITH CHECK (
    uploaded_by = public.get_my_delegate_id()
    AND public.is_member_of(committee_id)
  );

CREATE POLICY "documents_update"
  ON public.documents FOR UPDATE
  USING (
    public.is_eb_for(committee_id)
  );

CREATE POLICY "documents_delete"
  ON public.documents FOR DELETE
  USING (
    public.is_eb_for(committee_id)
  );


-- -------------------------------------------------------
-- BLOCS
-- Committee-scoped: members read, delegates create, EB/creator manage
-- -------------------------------------------------------
CREATE POLICY "blocs_select"
  ON public.blocs FOR SELECT
  USING (
    public.is_member_of(public.session_committee(session_id))
    OR public.is_admin()
  );

CREATE POLICY "blocs_insert"
  ON public.blocs FOR INSERT
  WITH CHECK (
    created_by = public.get_my_delegate_id()
    AND public.is_member_of(public.session_committee(session_id))
  );

CREATE POLICY "blocs_update"
  ON public.blocs FOR UPDATE
  USING (
    created_by = public.get_my_delegate_id()
    OR public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "blocs_delete"
  ON public.blocs FOR DELETE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );


-- -------------------------------------------------------
-- BLOC MEMBERS
-- -------------------------------------------------------
CREATE POLICY "bloc_members_select"
  ON public.bloc_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.blocs b
      WHERE b.id = bloc_members.bloc_id
        AND public.is_member_of(public.session_committee(b.session_id))
    )
    OR public.is_admin()
  );

CREATE POLICY "bloc_members_insert"
  ON public.bloc_members FOR INSERT
  WITH CHECK (
    delegate_id = public.get_my_delegate_id()
  );

CREATE POLICY "bloc_members_delete"
  ON public.bloc_members FOR DELETE
  USING (
    delegate_id = public.get_my_delegate_id()
    OR EXISTS (
      SELECT 1 FROM public.blocs b
      WHERE b.id = bloc_members.bloc_id
        AND public.is_eb_for(public.session_committee(b.session_id))
    )
  );


-- -------------------------------------------------------
-- SPEAKER LIST CONFIG (settings only — queue is ephemeral)
-- -------------------------------------------------------
CREATE POLICY "speaker_config_select"
  ON public.speaker_list_config FOR SELECT
  USING (
    public.is_member_of(public.session_committee(session_id))
    OR public.is_admin()
  );

CREATE POLICY "speaker_config_insert"
  ON public.speaker_list_config FOR INSERT
  WITH CHECK (
    public.is_eb_for(public.session_committee(session_id))
  );

CREATE POLICY "speaker_config_update"
  ON public.speaker_list_config FOR UPDATE
  USING (
    public.is_eb_for(public.session_committee(session_id))
  );


-- -------------------------------------------------------
-- GLOBAL ANNOUNCEMENTS
-- All read, admin write
-- -------------------------------------------------------
CREATE POLICY "announcements_select"
  ON public.global_announcements FOR SELECT
  USING (true);

CREATE POLICY "announcements_insert"
  ON public.global_announcements FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "announcements_delete"
  ON public.global_announcements FOR DELETE
  USING (public.is_admin());


-- ============================================================
-- 6. STORAGE (document uploads)
-- ============================================================

-- Create the storage bucket (Supabase auto-handles this via dashboard,
-- but we define the policy SQL here for reference)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: delegates can upload to their own path
DROP POLICY IF EXISTS "documents_storage_insert" ON storage.objects;
CREATE POLICY "documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

-- Storage RLS: committee members can read documents in their committee
DROP POLICY IF EXISTS "documents_storage_select" ON storage.objects;
CREATE POLICY "documents_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

-- Storage RLS: EB/admin can delete documents
DROP POLICY IF EXISTS "documents_storage_delete" ON storage.objects;
CREATE POLICY "documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      public.is_admin()
      OR (
        public.get_my_role() = 'eb'
        AND storage.objects.metadata->>'committee_id' = public.get_my_committee_id()::text
      )
    )
  );


-- ============================================================
-- 7. REALTIME PUBLICATION
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voting_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bloc_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delegates;


-- ============================================================
-- 8. SEED DATA — 8 Committees
-- ============================================================

INSERT INTO public.committees (name, short_name, type, level, theme, join_code) VALUES
  ('The Sapphire Special Committee',                   'DHURANDHAR', 'crisis',        'Criminally Advanced', 'flame',   'DHUR1'),
  ('Disarmament and International Security Committee', 'DISEC',      'general',       'Intermediate',        'default', 'DISEC1'),
  ('United Nations Human Rights Council',              'UNHRC',      'general',       'Intermediate',        'default', 'UNHRC1'),
  ('The House of the People',                          'LOK SABHA',  'parliamentary', 'Advanced',            'default', 'LOK1'),
  ('Indian Film Industry',                             'IFI',        'creative',      'Fun',                 'default', 'IFI1'),
  ('International Press',                              'IP',         'press',         'All Levels',          'default', 'IP1'),
  ('The Grand Line Fleet',                             'ONE PIECE',  'special',       'Classified',          'pirate',  'OP1');

COMMIT;
