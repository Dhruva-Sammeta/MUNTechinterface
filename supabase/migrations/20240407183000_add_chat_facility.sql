-- 1. Create message scope enum
DO $$ BEGIN
    CREATE TYPE message_scope AS ENUM ('public', 'private', 'bloc', 'eb');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create committee_messages table
CREATE TABLE IF NOT EXISTS public.committee_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id      UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES public.delegates(id) ON DELETE CASCADE, 
  recipient_id      UUID REFERENCES public.delegates(id) ON DELETE CASCADE, 
  bloc_id           UUID REFERENCES public.blocs(id) ON DELETE CASCADE,
  scope             message_scope NOT NULL DEFAULT 'public',
  content           TEXT NOT NULL, -- Encrypted base64 (iv:ciphertext)
  is_approved       BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: In MUN, private chits start as unapproved.
ALTER TABLE public.committee_messages 
  ALTER COLUMN is_approved SET DEFAULT true;

-- Specific logic for private messages: they need approval
CREATE OR REPLACE FUNCTION public.set_message_approval_default()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.scope = 'private' THEN
        NEW.is_approved = false;
    ELSE
        NEW.is_approved = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_message_approval ON public.committee_messages;
CREATE TRIGGER trigger_set_message_approval
BEFORE INSERT ON public.committee_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_approval_default();

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_messages_committee_id ON public.committee_messages(committee_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id   ON public.committee_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id    ON public.committee_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON public.committee_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_bloc_id      ON public.committee_messages(bloc_id);
CREATE INDEX IF NOT EXISTS idx_messages_scope        ON public.committee_messages(scope);

-- 4. RLS Policies

ALTER TABLE public.committee_messages ENABLE ROW LEVEL SECURITY;

-- 4a. INSERT: Any authenticated user can send a message
DROP POLICY IF EXISTS "messages_insert" ON public.committee_messages;
CREATE POLICY "messages_insert"
  ON public.committee_messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND sender_id = public.get_my_delegate_id()
  );

-- 4b. SELECT: Scoped visibility
DROP POLICY IF EXISTS "messages_select" ON public.committee_messages;
CREATE POLICY "messages_select"
  ON public.committee_messages FOR SELECT
  USING (
    -- EB/Admin can see EVERYTHING for audit/moderation
    public.is_eb_for(committee_id)
    OR (
        -- Public messages are visible to everyone in the committee
        scope = 'public' 
        AND is_approved = true
        AND committee_id = public.get_my_committee_id()
    )
    OR (
        -- Private messages visible to sender and recipient
        scope = 'private'
        AND (sender_id = public.get_my_delegate_id() OR recipient_id = public.get_my_delegate_id())
        AND (is_approved = true OR sender_id = public.get_my_delegate_id()) -- sender sees their pending message
    )
    OR (
        -- Bloc messages visible to bloc members
        scope = 'bloc'
        AND bloc_id IN (SELECT b.bloc_id FROM public.bloc_members b WHERE b.delegate_id = public.get_my_delegate_id())
    )
    OR (
        -- EB messages visible to EB members
        scope = 'eb'
        AND public.is_eb_for(committee_id)
    )
  );

-- 4c. UPDATE: Only EB can approve/reject
DROP POLICY IF EXISTS "messages_update_eb" ON public.committee_messages;
CREATE POLICY "messages_update_eb"
  ON public.committee_messages FOR UPDATE
  USING (public.is_eb_for(committee_id))
  WITH CHECK (public.is_eb_for(committee_id));

-- 5. Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.committee_messages;
