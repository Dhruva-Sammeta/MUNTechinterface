/**
 * CommitteeChannel — Unified Realtime Channel Manager
 *
 * HARD CONSTRAINTS:
 *   - Speaker queue is ephemeral — NEVER written to DB
 *   - One channel per committee: `committee:{committeeId}`
 *   - EB is the sole authority for queue mutations
 *   - All clients receive full-state snapshots, never diffs
 *   - Reconnect is handled via Presence join events + request_state fallback
 *
 * USAGE (EB):
 *   const ch = new CommitteeChannel(supabase, committeeId, 'eb', delegateId);
 *   ch.subscribe();
 *   ch.queue.add({ delegate_id, display_name, country });
 *   ch.queue.nextSpeaker();
 *   ch.destroy();
 *
 * USAGE (Delegate / Presentation):
 *   const ch = new CommitteeChannel(supabase, committeeId, 'delegate', delegateId);
 *   ch.onQueueUpdate((state) => setQueueState(state));
 *   ch.subscribe();
 *   ch.destroy();
 */

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type {
  SpeakerQueueState,
  SpeakerQueueEntry,
} from "@/lib/database.types";
import { CHANNEL_NAME, EVENTS } from "./architecture";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type ClientRole = "eb" | "delegate" | "presentation" | "admin";

export interface PresenceState {
  clientId: string;
  role: ClientRole;
  joinedAt: number;
}

export interface QueueUpdatePayload {
  state: SpeakerQueueState;
}

export interface SpeakerStartPayload {
  delegate: SpeakerQueueEntry;
  startedAt: number;
  durationMs: number;
}

export interface SpeakerDonePayload {
  delegateId: string;
}

export interface AnnouncePayload {
  content: string;
  createdAt: number;
}

type QueueListener = (state: SpeakerQueueState) => void;
type AnnounceListener = (payload: AnnouncePayload) => void;

/* ─── Initial State ──────────────────────────────────────────────────────── */

const INITIAL_QUEUE: SpeakerQueueState = {
  current: null,
  queue: [],
  speaking_started_at: null,
  speaking_time_s: 90,
};

/* ─── CommitteeChannel ───────────────────────────────────────────────────── */

export class CommitteeChannel {
  private supabase: SupabaseClient;
  private committeeId: string;
  private role: ClientRole;
  private clientId: string;

  private channel: RealtimeChannel | null = null;
  private queueState: SpeakerQueueState = { ...INITIAL_QUEUE };

  private queueListeners = new Set<QueueListener>();
  private announceListeners = new Set<AnnounceListener>();

  constructor(
    supabase: SupabaseClient,
    committeeId: string,
    role: ClientRole,
    clientId: string,
  ) {
    this.supabase = supabase;
    this.committeeId = committeeId;
    this.role = role;
    this.clientId = clientId;
  }

  /* ── Core ─────────────────────────────────────────────────────────────── */

  subscribe(): this {
    const channelName = CHANNEL_NAME(this.committeeId);

    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { self: true }, // EB receives its own broadcasts for consistency
        presence: { key: this.clientId },
      },
    });

    this._attachBroadcastListeners();
    this._attachPresenceListeners();

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // 1. Announce presence — triggers EB to re-broadcast queue state
        this.channel!.track({
          clientId: this.clientId,
          role: this.role,
          joinedAt: Date.now(),
        } satisfies PresenceState);

        // 2. Request state fallback — handles race where EB hasn't processed
        //    the presence join event yet (e.g. both connecting simultaneously)
        if (this.role !== "eb" && this.role !== "admin") {
          setTimeout(() => {
            this.channel?.send({
              type: "broadcast",
              event: EVENTS.SPEAKER_REQUEST_STATE,
              payload: { clientId: this.clientId },
            });
          }, 1000); // 1 second delay to ensure EB is ready
        }
      }
    });

    return this;
  }

  destroy(): void {
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.queueListeners.clear();
    this.announceListeners.clear();
  }

  /* ── Broadcast Listeners ─────────────────────────────────────────────── */

  private _attachBroadcastListeners(): void {
    const ch = this.channel!;

    // Full queue snapshot — replace state entirely (never merge)
    ch.on(
      "broadcast",
      { event: EVENTS.SPEAKER_QUEUE_UPDATE },
      ({ payload }) => {
        const { state } = payload as QueueUpdatePayload;
        this.queueState = state;
        this._notifyQueue();
      },
    );

    // SPEAKER_START — EB started the current speaker's timer
    ch.on("broadcast", { event: EVENTS.SPEAKER_START }, ({ payload }) => {
      const { delegate, startedAt } = payload as SpeakerStartPayload;
      this.queueState = {
        ...this.queueState,
        current: delegate,
        speaking_started_at: startedAt,
      };
      this._notifyQueue();
    });

    // SPEAKER_DONE — EB dismissed current speaker, advance queue
    ch.on("broadcast", { event: EVENTS.SPEAKER_DONE }, ({ payload }) => {
      const { delegateId } = payload as SpeakerDonePayload;
      if (this.queueState.current?.delegate_id === delegateId) {
        const [next, ...rest] = this.queueState.queue;
        this.queueState = {
          ...this.queueState,
          current: next ?? null,
          queue: rest,
          speaking_started_at: next ? Date.now() : null,
        };
        this._notifyQueue();
      }
    });

    // SPEAKER_RESET — wipe the queue
    ch.on("broadcast", { event: EVENTS.SPEAKER_RESET }, () => {
      this.queueState = { ...INITIAL_QUEUE };
      this._notifyQueue();
    });

    // REQUEST_STATE — only EB responds
    ch.on("broadcast", { event: EVENTS.SPEAKER_REQUEST_STATE }, () => {
      if (this.role === "eb" || this.role === "admin") {
        this._broadcastQueueSnapshot();
      }
    });

    // REQUEST_FLOOR — delegate wants to speak; EB/admin auto-adds them
    ch.on(
      "broadcast",
      { event: EVENTS.SPEAKER_REQUEST_FLOOR },
      ({ payload }) => {
        if (this.role !== "eb" && this.role !== "admin") return;
        const entry = payload as SpeakerQueueEntry;
        // De-duplicate
        const alreadyQueued =
          this.queueState.current?.delegate_id === entry.delegate_id ||
          this.queueState.queue.some(
            (e) => e.delegate_id === entry.delegate_id,
          );
        if (alreadyQueued) return;
        this.queueState = {
          ...this.queueState,
          queue: [...this.queueState.queue, entry],
        };
        this._broadcastQueueSnapshot();
        this._notifyQueue();
      },
    );

    // Global announcement
    ch.on("broadcast", { event: EVENTS.ANNOUNCE_GLOBAL }, ({ payload }) => {
      const announce = payload as AnnouncePayload;
      this.announceListeners.forEach((l) => l(announce));
    });

    // Persisted global announcement (Admin tab inserts DB row).
    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "global_announcements",
      },
      (payload) => {
        const row = payload.new as { content?: string; created_at?: string };
        if (!row?.content) return;
        const announce: AnnouncePayload = {
          content: row.content,
          createdAt: row.created_at
            ? new Date(row.created_at).getTime()
            : Date.now(),
        };
        this.announceListeners.forEach((l) => l(announce));
      },
    );
  }

  /* ── Presence Listeners ──────────────────────────────────────────────── */

  private _attachPresenceListeners(): void {
    if (!this.channel) return;

    // When a new client joins, EB re-broadcasts current queue state.
    // This is the primary reconnect recovery mechanism.
    this.channel.on("presence", { event: "join" }, ({ newPresences }) => {
      if (this.role !== "eb" && this.role !== "admin") return;
      const hasNonEB = newPresences.some(
        (p) => (p as unknown as PresenceState).role !== "eb",
      );
      if (hasNonEB) {
        // Small debounce in case multiple clients join at once
        setTimeout(() => this._broadcastQueueSnapshot(), 150);
      }
    });
  }

  /* ── Internal Helpers ────────────────────────────────────────────────── */

  private _broadcastQueueSnapshot(): void {
    this.channel?.send({
      type: "broadcast",
      event: EVENTS.SPEAKER_QUEUE_UPDATE,
      payload: { state: this.queueState } satisfies QueueUpdatePayload,
    });
  }

  private _notifyQueue(): void {
    const snapshot = { ...this.queueState };
    this.queueListeners.forEach((l) => l(snapshot));
  }

  /* ── Subscriptions (read-only for non-EB) ────────────────────────────── */

  /** Subscribe to queue state changes. Immediately fires with current state. */
  onQueueUpdate(listener: QueueListener): () => void {
    this.queueListeners.add(listener);
    listener({ ...this.queueState }); // Immediate value for new subscribers
    return () => this.queueListeners.delete(listener);
  }

  /** Subscribe to global announcements. */
  onAnnouncement(listener: AnnounceListener): () => void {
    this.announceListeners.add(listener);
    return () => this.announceListeners.delete(listener);
  }

  /** Read current queue state (synchronous snapshot). */
  getQueue(): SpeakerQueueState {
    return { ...this.queueState };
  }

  /* ── EB-only Mutations ───────────────────────────────────────────────── */

  /** The `queue` namespace exposes all EB mutation actions. */
  readonly queue = {
    /** Add a delegate to the speaker queue. No-op if already present. */
    add: (entry: SpeakerQueueEntry): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      const alreadyQueued =
        this.queueState.current?.delegate_id === entry.delegate_id ||
        this.queueState.queue.some((e) => e.delegate_id === entry.delegate_id);
      if (alreadyQueued) return;

      this.queueState = {
        ...this.queueState,
        queue: [...this.queueState.queue, entry],
      };
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },

    /** Remove a delegate from the queue (not the current speaker). */
    remove: (delegateId: string): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      this.queueState = {
        ...this.queueState,
        queue: this.queueState.queue.filter(
          (e) => e.delegate_id !== delegateId,
        ),
      };
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },

    /** Reorder the entire queue explicitly */
    reorder: (newQueue: SpeakerQueueEntry[]): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      this.queueState = {
        ...this.queueState,
        queue: newQueue,
      };
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },

    /** Promote the first person in the queue to current speaker. */
    promoteNext: (): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      const [next, ...rest] = this.queueState.queue;
      if (!next) return;
      const now = Date.now();
      this.queueState = {
        ...this.queueState,
        current: next,
        queue: rest,
        speaking_started_at: now,
      };
      // Use SPEAKER_START for downstream clients to sync timer
      this.channel?.send({
        type: "broadcast",
        event: EVENTS.SPEAKER_START,
        payload: {
          delegate: next,
          startedAt: now,
          durationMs: this.queueState.speaking_time_s * 1000,
        } satisfies SpeakerStartPayload,
      });
      // Always broadcast full snapshot after queue change to ensure consistency
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },

    /** Dismiss the current speaker, advance to next in queue. */
    dismissCurrent: (): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      if (!this.queueState.current) return;
      const dismissedId = this.queueState.current.delegate_id;
      const [next, ...rest] = this.queueState.queue;
      this.queueState = {
        ...this.queueState,
        current: next ?? null,
        queue: rest,
        speaking_started_at: next ? Date.now() : null,
      };
      this.channel?.send({
        type: "broadcast",
        event: EVENTS.SPEAKER_DONE,
        payload: { delegateId: dismissedId } satisfies SpeakerDonePayload,
      });
      // Always broadcast full snapshot to keep all clients in sync
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },

    /** Update speaking time (seconds). Broadcasts new full snapshot. */
    setSpeakingTime: (seconds: number): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      this.queueState = { ...this.queueState, speaking_time_s: seconds };
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },

    /** Wipe everything. */
    reset: (): void => {
      if (this.role !== "eb" && this.role !== "admin") return;
      this.queueState = { ...INITIAL_QUEUE };
      this.channel?.send({
        type: "broadcast",
        event: EVENTS.SPEAKER_RESET,
        payload: {},
      });
      this._broadcastQueueSnapshot();
      this._notifyQueue();
    },
  };

  /* ── Admin-only Broadcast ────────────────────────────────────────────── */

  /** Broadcast a global announcement overlay to all connected clients. */
  broadcastAnnouncement(content: string): void {
    if (this.role !== "admin" && this.role !== "eb") return;
    this.channel?.send({
      type: "broadcast",
      event: EVENTS.ANNOUNCE_GLOBAL,
      payload: { content, createdAt: Date.now() } satisfies AnnouncePayload,
    });
  }

  /* ── Delegate Floor Request ──────────────────────────────────────────── */

  /**
   * Any role can call this to request the floor.
   * Broadcasts a SPEAKER_REQUEST_FLOOR event.
   * The EB/admin channel instance will auto-add the delegate to the queue.
   */
  requestFloor(entry: SpeakerQueueEntry): void {
    this.channel?.send({
      type: "broadcast",
      event: EVENTS.SPEAKER_REQUEST_FLOOR,
      payload: entry,
    });
  }
}
