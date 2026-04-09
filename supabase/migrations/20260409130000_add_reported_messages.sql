-- Add reported_messages table for moderation reports
CREATE TABLE IF NOT EXISTS public.reported_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.committee_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL,
  reporter_delegate_id uuid NULL,
  reporter_ip text NULL,
  reason text NULL,
  details jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'open',
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reported_messages_message_id ON public.reported_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_reported_messages_reporter_delegate_id ON public.reported_messages(reporter_delegate_id);
CREATE INDEX IF NOT EXISTS idx_reported_messages_status ON public.reported_messages(status);
