/**
 * lib/realtime/index.ts
 *
 * Public API for the realtime module.
 * Import from here, not from individual files.
 */

export { CommitteeChannel } from "./committeeChannel";
export type {
  ClientRole,
  PresenceState,
  QueueUpdatePayload,
  SpeakerStartPayload,
  SpeakerDonePayload,
  AnnouncePayload,
} from "./committeeChannel";
export { CHANNEL_NAME, EVENTS } from "./architecture";
export type { EventName } from "./architecture";
