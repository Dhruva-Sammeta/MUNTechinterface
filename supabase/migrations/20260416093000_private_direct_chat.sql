BEGIN;

ALTER TABLE public.committee_messages
  ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.delegates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visible_to_eb boolean NOT NULL DEFAULT false;

ALTER TABLE public.committee_messages
  DROP CONSTRAINT IF EXISTS committee_messages_scope_check;

ALTER TABLE public.committee_messages
  ADD CONSTRAINT committee_messages_scope_check
  CHECK (scope IN ('public', 'private'));

CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON public.committee_messages(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_created
  ON public.committee_messages(recipient_id, created_at DESC)
  WHERE recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_private_eb_created
  ON public.committee_messages(committee_id, visible_to_eb, created_at DESC)
  WHERE scope = 'private';

ALTER TABLE public.committee_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS committee_messages_select_policy ON public.committee_messages;
DROP POLICY IF EXISTS committee_messages_insert_policy ON public.committee_messages;

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

COMMIT;
