/**
 * SAPPHIRE MUN — Realtime Channel Architecture
 *
 * ─── CHANNEL STRUCTURE ────────────────────────────────────────────────────
 *
 *  One channel per committee session:
 *    channel name: `committee:{committeeId}`
 *
 *  This single channel carries ALL event types for a session, scoped to
 *  the committee. This avoids channel fragmentation and ensures all clients
 *  (Delegate, EB, Presentation) on the same channel receive every event.
 *
 *  Presence is used for:
 *    - Tracking who is connected (delegates, EB, presentation clients)
 *    - Triggering state recovery on reconnect (EB re-broadcasts when new
 *      client joins — detected via Presence SYNC event)
 *
 * ─── EVENT FLOW ───────────────────────────────────────────────────────────
 *
 *  EB              →  BROADCAST  →  All clients (Delegate + Presentation)
 *  DB update       →  POSTGRES_CHANGES  →  All clients (via sessions table)
 *
 *  Speaker Queue Events (BROADCAST only — no DB):
 *    speaker:queue_update   — EB mutation: full queue snapshot
 *    speaker:start          — EB action: current speaker started speaking
 *    speaker:done           — EB action: current speaker finished
 *    speaker:reset          — EB action: full queue cleared
 *    speaker:request_state  — non-EB client: "I just connected, send me state"
 *
 *  Session Events (POSTGRES_CHANGES from DB writes):
 *    sessions table UPDATE  — mode, agenda_text, timer_started_at, timer_duration_s
 *
 *  Announcement Events (BROADCAST for instant overlay):
 *    announce:global        — Admin: triggers overlay on all clients
 *
 * ─── RECONNECT PROTOCOL ───────────────────────────────────────────────────
 *
 *  Problem: Client disconnects → loses ephemeral queue state → reconnects.
 *  Solution using Presence:
 *
 *  1. All clients enter Presence with { role, clientId } on subscribe.
 *  2. EB watches channel.on('presence', { event: 'join' }) events.
 *  3. When a non-EB client joins, EB re-broadcasts full speaker queue state.
 *  4. Joining client also sends `speaker:request_state` after SUBSCRIBED
 *     as a fallback (handles case where EB is also in the process of joining).
 *
 * ─── NO RACE CONDITIONS ───────────────────────────────────────────────────
 *
 *  - EB is the single source of truth for queue mutations.
 *  - Every EB mutation broadcasts the FULL queue snapshot (not diffs).
 *  - Clients always replace state from snapshots, never merge patches.
 *  - Timer uses DB timestamps, not ticks, so any client that reads the DB
 *    value will reconstruct the same countdown regardless of when they joined.
 *
 */

export const CHANNEL_NAME = (committeeId: string) => `committee:${committeeId}`;

export const EVENTS = {
  // Speaker Queue — broadcast only
  SPEAKER_QUEUE_UPDATE: "speaker:queue_update",
  SPEAKER_START: "speaker:start",
  SPEAKER_DONE: "speaker:done",
  SPEAKER_RESET: "speaker:reset",
  SPEAKER_REQUEST_STATE: "speaker:request_state",
  SPEAKER_REQUEST_FLOOR: "speaker:request_floor",

  // Announcements — broadcast only
  ANNOUNCE_GLOBAL: "announce:global",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
