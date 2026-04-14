# Canonical Rebuild Steps

This project has been rebuilt around a single passcode/auth flow and one canonical schema.

## 1) Wipe and recreate schema in Supabase UI

Use SQL Editor and run:

- `supabase/SQL_EDITOR_CANONICAL_RESET.sql`

This drops legacy tables and recreates the canonical schema.

## 2) Verify required env vars

Server:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSCODE` (optional, defaults to `86303`)
- `ADMIN_BOOTSTRAP_EMAIL` (optional)

Client:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3) Start app

- `npm run dev`

## 4) Canonical flow

- `/` handles committee and admin passcode login.
- `/admin` creates and manages delegate/EB passcodes.
- Generated passcodes are verified and claimed through one backend flow.
- `/delegate/[committeeId]` and `/eb/[committeeId]` use canonical committee state and chat routes.

## 5) Migration source of truth

Only migration to keep using:

- `supabase/migrations/20260414235900_canonical_schema.sql`
