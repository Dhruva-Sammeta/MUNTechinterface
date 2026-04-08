"use client";

/**
 * useCommitteeChannel — React hook for the unified CommitteeChannel.
 *
 * Wraps CommitteeChannel lifecycle into a React hook with stable refs.
 * Returns the full queue state and all EB mutation actions (no-ops for non-EB).
 *
 * SAFE TO CALL FROM ANY ROLE — non-EB actions are silently ignored by the
 * CommitteeChannel class itself.
 *
 * Usage (EB):
 *   const { current, queue, add, promoteNext, dismissCurrent } =
 *     useCommitteeChannel(committeeId, 'eb', userId);
 *
 * Usage (Delegate / Presentation):
 *   const { current, queue } = useCommitteeChannel(committeeId, 'delegate', userId);
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CommitteeChannel,
  type ClientRole,
  type AnnouncePayload,
} from "@/lib/realtime/committeeChannel";
import type {
  SpeakerQueueState,
  SpeakerQueueEntry,
} from "@/lib/database.types";

const INITIAL_STATE: SpeakerQueueState = {
  current: null,
  queue: [],
  speaking_started_at: null,
  speaking_time_s: 90,
};

interface UseCommitteeChannelReturn extends SpeakerQueueState {
  // EB queue mutations (no-op for non-EB)
  add: (entry: SpeakerQueueEntry) => void;
  remove: (delegateId: string) => void;
  promoteNext: () => void;
  dismissCurrent: () => void;
  setSpeakingTime: (seconds: number) => void;
  resetQueue: () => void;
  reorder: (newQueue: SpeakerQueueEntry[]) => void;
  // Delegate floor request (broadcasts to EB)
  requestFloor: (entry: SpeakerQueueEntry) => void;
  // Admin / EB announcement
  broadcastAnnouncement: (content: string) => void;
  // Latest announcement received
  latestAnnouncement: AnnouncePayload | null;
  // Connection status
  isReady: boolean;
}

export function useCommitteeChannel(
  committeeId: string | null,
  role: ClientRole,
  clientId: string | null,
): UseCommitteeChannelReturn {
  const [queueState, setQueueState] =
    useState<SpeakerQueueState>(INITIAL_STATE);
  const [latestAnnouncement, setLatestAnnouncement] =
    useState<AnnouncePayload | null>(null);
  const [isReady, setIsReady] = useState(false);

  const channelRef = useRef<CommitteeChannel | null>(null);

  useEffect(() => {
    if (!committeeId || !clientId) return;

    const supabase = createClient();
    const ch = new CommitteeChannel(supabase, committeeId, role, clientId);

    // Wire state updates
    const unsubQueue = ch.onQueueUpdate(setQueueState);
    const unsubAnnounce = ch.onAnnouncement(setLatestAnnouncement);

    ch.subscribe();
    channelRef.current = ch;
    setIsReady(true);

    return () => {
      unsubQueue();
      unsubAnnounce();
      ch.destroy();
      channelRef.current = null;
      setIsReady(false);
      setQueueState(INITIAL_STATE);
    };
  }, [committeeId, role, clientId]);

  // Stable action callbacks — safe to include in dependency arrays
  const add = useCallback((entry: SpeakerQueueEntry) => {
    channelRef.current?.queue.add(entry);
  }, []);

  const remove = useCallback((delegateId: string) => {
    channelRef.current?.queue.remove(delegateId);
  }, []);

  const promoteNext = useCallback(() => {
    channelRef.current?.queue.promoteNext();
  }, []);

  const dismissCurrent = useCallback(() => {
    channelRef.current?.queue.dismissCurrent();
  }, []);

  const setSpeakingTime = useCallback((seconds: number) => {
    channelRef.current?.queue.setSpeakingTime(seconds);
  }, []);

  const resetQueue = useCallback(() => {
    channelRef.current?.queue.reset();
  }, []);

  const reorder = useCallback((newQueue: SpeakerQueueEntry[]) => {
    channelRef.current?.queue.reorder(newQueue);
  }, []);

  const broadcastAnnouncement = useCallback((content: string) => {
    channelRef.current?.broadcastAnnouncement(content);
  }, []);

  const requestFloor = useCallback((entry: SpeakerQueueEntry) => {
    channelRef.current?.requestFloor(entry);
  }, []);

  return {
    ...queueState,
    add,
    remove,
    promoteNext,
    dismissCurrent,
    setSpeakingTime,
    resetQueue,
    reorder,
    requestFloor,
    broadcastAnnouncement,
    latestAnnouncement,
    isReady,
  };
}
