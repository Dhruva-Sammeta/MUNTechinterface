-- Private Direct Chat setup for Supabase
-- Run this SQL in the Supabase SQL Editor.

begin;

alter table public.committee_messages
  add column if not exists recipient_id uuid references public.delegates(id) on delete cascade,
  add column if not exists visible_to_eb boolean not null default false;

alter table public.committee_messages
  drop constraint if exists committee_messages_scope_check;

alter table public.committee_messages
  add constraint committee_messages_scope_check
  check (scope in ('public', 'private'));

create index if not exists idx_messages_session_created
  on public.committee_messages(session_id, created_at desc);

create index if not exists idx_messages_recipient_created
  on public.committee_messages(recipient_id, created_at desc)
  where recipient_id is not null;

create index if not exists idx_messages_private_eb_created
  on public.committee_messages(committee_id, visible_to_eb, created_at desc)
  where scope = 'private';

commit;

-- Security (RLS) for private/direct visibility
-- delegates can see their own DMs only
-- EB/Admin can see only DMs marked visible_to_eb = true
-- sender can create messages only as themselves
-- private messages must include a valid recipient in same committee

alter table public.committee_messages enable row level security;

-- Clean old policies for repeat-safe execution.
drop policy if exists committee_messages_select_policy on public.committee_messages;
drop policy if exists committee_messages_insert_policy on public.committee_messages;

create policy committee_messages_select_policy
on public.committee_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.delegates me
    where me.user_id = auth.uid()
      and me.committee_id = committee_messages.committee_id
      and (
        committee_messages.scope = 'public'
        or (
          committee_messages.scope = 'private'
          and (
            committee_messages.sender_id = me.id
            or committee_messages.recipient_id = me.id
          )
        )
        or (
          committee_messages.scope = 'private'
          and committee_messages.visible_to_eb = true
          and me.role in ('eb', 'admin')
        )
      )
  )
);

create policy committee_messages_insert_policy
on public.committee_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.delegates me
    where me.user_id = auth.uid()
      and me.id = committee_messages.sender_id
      and me.committee_id = committee_messages.committee_id
  )
  and (
    (
      committee_messages.scope = 'public'
      and committee_messages.recipient_id is null
      and committee_messages.visible_to_eb = false
    )
    or
    (
      committee_messages.scope = 'private'
      and committee_messages.recipient_id is not null
      and committee_messages.recipient_id <> committee_messages.sender_id
      and exists (
        select 1
        from public.delegates recipient
        where recipient.id = committee_messages.recipient_id
          and recipient.committee_id = committee_messages.committee_id
      )
    )
  )
);

-- Realtime publication check
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'committee_messages'
    ) then
      alter publication supabase_realtime add table public.committee_messages;
    end if;
  end if;
end
$$;

-- Quick verification checklist:
-- 1. Login as Delegate A and Delegate B in same committee.
-- 2. Delegate A sends private message to B with EB toggle off:
--    - B sees it.
--    - EB does not see it in EB review tab.
-- 3. Delegate A sends private message to B with EB toggle on:
--    - B sees it.
--    - EB sees it in EB review tab.
-- 4. No third delegate should see either DM.
