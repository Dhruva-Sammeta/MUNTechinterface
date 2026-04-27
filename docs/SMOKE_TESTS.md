# Smoke Tests

Run after each reset/deploy.

## Identity and Admin

1. Open `/`.
2. Enter `86303` without selecting committee.
3. Confirm redirect to `/admin`.
4. Confirm user has admin access features.

## Passcodes

1. Create passcode in admin panel.
2. Confirm it appears in admin passcode list immediately.
3. Claim passcode from join flow.
4. Confirm delegate row exists with expected role and `has_logged_in = true`.

## Realtime sync

Use 2 browser windows (EB + Delegate):

1. EB updates timer start/pause/resume/reset.
2. Delegate reflects timer changes instantly.
3. EB changes agenda text.
4. Delegate sees agenda change without refresh.
5. Delegate presence updates without refresh.

## Chat

1. Send public message; verify recipient view updates.
2. Verify messages persist in `committee_messages` with `scope = 'public'`.

## Admin safety

1. Try deleting an admin when only one admin exists.
2. Confirm API blocks deletion.
3. Add second admin and delete first.
4. Confirm only target delegate removed; no mass data deletion occurs.

## Admin sync API

1. Call `/api/admin/sync` with valid `x-admin-secret` and event `mode_change`.
2. Confirm today's `sessions.mode` changes in DB and propagates in UI.
3. Confirm endpoint returns success without touching dropped tables.
