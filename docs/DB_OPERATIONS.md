# Database Operations

## Why DB behavior drifted

These are the core failure modes that made agenda/chat/login behavior inconsistent:

1. Multiple schema "truths" existed at different times (early base migrations + a later full rebuild migration).
2. A malformed migration filename made operational guidance ambiguous and brittle.
3. Manual SQL-editor workflows were mixed with migration-based workflows, causing environment drift.
4. Some API code paths claimed service-role behavior but were using anon credentials, which can fail under RLS.

## Canonical schema rule (must follow)

1. Current schema source of truth is `supabase/migrations/20260414235900_canonical_schema.sql`.
2. `supabase/SQL_EDITOR_FULL_RESET_SCHEMA.sql` must always mirror that migration exactly.
3. Never run ad-hoc production SQL without also creating a migration file.
4. Keep service-role usage server-only in API routes.

## Private Direct Chat Rollout

1. Schema migration path: `supabase/migrations/20260416093000_private_direct_chat.sql`.
2. SQL Editor path: run `supabase/private_direct_chat_setup.sql` in Supabase UI.
3. Setup guide: `docs/PRIVATE_CHAT_SUPABASE_SETUP.md`.
4. Keep all three files aligned whenever private chat policy/scope rules change.

## Wipe and start over (local)

Run from repository root.

```bash
npx supabase db reset --local --yes
```

Equivalent npm script:

```bash
npm run db:reset
```

## Wipe and start over (linked project / remote)

Use only for staging/test environments.

```bash
npx supabase db reset --linked --yes
```

If you reset via direct DB URL:

```bash
npx supabase db reset --db-url "$SUPABASE_DB_URL" --yes
```

## Mandatory post-reset verification

1. Rebuild app once: `npm run check:build`.
2. Verify realtime publication with `supabase/queries/verify_realtime_publication.sql`.
3. Run smoke suite in `docs/SMOKE_TESTS.md`.
4. Confirm agenda updates, chat insert/select, and delegate visibility (`has_logged_in`) in UI.

## Guardrails

1. Deleting a delegate must only delete that delegate row.
2. Last admin deletion must stay blocked.
3. Passcode assignment must be persistent (`assigned_user_id`, `assigned_at`).
4. Canonical tables are only: `committees`, `delegates`, `sessions`, `delegate_passcodes`, `passcode_attempts`, `passcode_audit`, `committee_messages`.
