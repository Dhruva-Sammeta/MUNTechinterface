"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import type {
  Committee,
  Delegate,
  Session,
  SessionMode,
  ChitWithDelegates,
  Document as MUNDocument,
  BlocWithMembers,
  VotingRound,
  Vote as VoteType,
} from "@/lib/database.types";

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

interface ConferenceData {
  committee: Committee | null;
  delegate: Delegate | null;
  session: Session | null;
  delegates: Delegate[];
  chits: ChitWithDelegates[];
  documents: MUNDocument[];
  blocs: BlocWithMembers[];
  activeRound: VotingRound | null;
  voteTally: { for: number; against: number; abstain: number };
  myVote: VoteType | null;
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  error: string | null;
  refetchChits: () => Promise<void>;
  refetchDocuments: () => Promise<void>;
  refetchDelegates: () => Promise<void>;
  refetchVoteTally: (roundId: string) => Promise<void>;
  refetchBlocs: () => Promise<void>;
}

export function useConferenceData(committeeId: string): ConferenceData {
  const supabase = createClient();
  const { setCurrentCommittee, setCurrentDelegate, setCurrentSession, setMode } = useAppStore();

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [delegate, setDelegate] = useState<Delegate | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!isLoading) return;

    const watchdog = window.setTimeout(() => {
      setError((prev) => prev || "Connection timed out. Showing available data.");
      setIsLoading(false);
    }, 9000);

    return () => {
      window.clearTimeout(watchdog);
    };
  }, [isLoading]);

  const refetchDelegates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("delegates")
        .select("*")
        .eq("committee_id", committeeId)
        .order("joined_at", { ascending: false });

      if (error) {
        setError(error.message);
        return;
      }

      if (data) {
        setDelegates(data as Delegate[]);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load delegates.");
    }
  }, [committeeId, supabase]);

  const refetchChits = useCallback(async () => {
    // Canonical schema does not include chits.
  }, []);

  const refetchDocuments = useCallback(async () => {
    // Canonical schema does not include documents.
  }, []);

  const refetchVoteTally = useCallback(async (_roundId: string) => {
    // Canonical schema does not include voting_rounds or votes.
  }, []);

  const refetchBlocs = useCallback(async () => {
    // Canonical schema does not include blocs.
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) {
          return;
        }

        const [committeeRes, delegateRes] = await Promise.all([
          supabase.from("committees").select("*").eq("id", committeeId).maybeSingle(),
          user
            ? supabase.from("delegates").select("*").eq("user_id", user.id).maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
        ]);

        if (cancelled) return;

        if (committeeRes.error) {
          throw new Error(committeeRes.error.message);
        }

        if (delegateRes.error) {
          throw new Error(delegateRes.error.message);
        }

        if (committeeRes.data) {
          const value = committeeRes.data as Committee;
          setCommittee(value);
          setCurrentCommittee(value);
        }

        if (delegateRes.data) {
          const value = delegateRes.data as Delegate;
          setDelegate(value);
          setCurrentDelegate(value);
        } else {
          setDelegate(null);
          setCurrentDelegate(null);
        }

        const today = new Date().toISOString().split("T")[0];
        let { data: todaysSession, error: sessionError } = await supabase
          .from("sessions")
          .select("*")
          .eq("committee_id", committeeId)
          .eq("date", today)
          .maybeSingle();

        if (sessionError) {
          throw new Error(sessionError.message);
        }

        if (
          !todaysSession &&
          delegateRes.data &&
          (delegateRes.data.role === "eb" || delegateRes.data.role === "admin")
        ) {
          const { data: inserted, error: insertError } = await supabase
            .from("sessions")
            .insert({ committee_id: committeeId, date: today })
            .select("*")
            .maybeSingle();

          if (insertError) {
            throw new Error(insertError.message);
          }

          todaysSession = inserted;
        }

        if (todaysSession) {
          const value = todaysSession as Session;
          setSession(value);
          setCurrentSession(value);
          setMode(value.mode as SessionMode);
        }

        await refetchDelegates();
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Unable to load conference data.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [committeeId, refetchDelegates, setCurrentCommittee, setCurrentDelegate, setCurrentSession, setMode, supabase]);

  useEffect(() => {
    const channelName = session?.id
      ? `conference_data:${session.id}`
      : `conference_data_waiting:${committeeId}`;

    const channel = supabase.channel(channelName);

    if (session?.id) {
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `id=eq.${session.id}`,
          },
          (payload) => {
            const updated = payload.new as Session;
            setSession(updated);
            setCurrentSession(updated);
            setMode(updated.mode as SessionMode);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "delegates",
            filter: `committee_id=eq.${committeeId}`,
          },
          () => {
            void refetchDelegates();
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnectionStatus("connected");
          } else if (status === "CHANNEL_ERROR") {
            setConnectionStatus("reconnecting");
          } else if (status === "CLOSED") {
            setConnectionStatus("disconnected");
          }
        });
    } else {
      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "sessions",
            filter: `committee_id=eq.${committeeId}`,
          },
          (payload) => {
            const created = payload.new as Session;
            setSession(created);
            setCurrentSession(created);
            setMode(created.mode as SessionMode);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "delegates",
            filter: `committee_id=eq.${committeeId}`,
          },
          () => {
            void refetchDelegates();
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnectionStatus("connected");
          } else if (status === "CHANNEL_ERROR") {
            setConnectionStatus("reconnecting");
          } else if (status === "CLOSED") {
            setConnectionStatus("disconnected");
          }
        });
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [committeeId, refetchDelegates, session?.id, setCurrentSession, setMode, supabase]);

  useEffect(() => {
    if (!committeeId) return;

    let cancelled = false;
    let inFlight = false;

    const pollSession = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;

      try {
        const activeSessionId = sessionRef.current?.id;

        if (activeSessionId) {
          const { data } = await supabase
            .from("sessions")
            .select("*")
            .eq("id", activeSessionId)
            .maybeSingle();

          if (!cancelled && data) {
            const live = data as Session;
            const current = sessionRef.current;
            const changed =
              !current ||
              current.mode !== live.mode ||
              current.agenda_text !== live.agenda_text ||
              current.timer_duration_s !== live.timer_duration_s ||
              current.timer_started_at !== live.timer_started_at ||
              current.timer_paused !== live.timer_paused;

            if (changed) {
              setSession(live);
              setCurrentSession(live);
              setMode(live.mode as SessionMode);
            }
          }
        } else {
          const today = new Date().toISOString().split("T")[0];
          const { data } = await supabase
            .from("sessions")
            .select("*")
            .eq("committee_id", committeeId)
            .eq("date", today)
            .maybeSingle();

          if (!cancelled && data) {
            const live = data as Session;
            setSession(live);
            setCurrentSession(live);
            setMode(live.mode as SessionMode);
          }
        }
      } finally {
        inFlight = false;
      }
    };

    void pollSession();
    const interval = window.setInterval(() => {
      void pollSession();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [committeeId, setCurrentSession, setMode, supabase]);

  return {
    committee,
    delegate,
    session,
    delegates,
    chits: [],
    documents: [],
    blocs: [],
    activeRound: null,
    voteTally: { for: 0, against: 0, abstain: 0 },
    myVote: null,
    connectionStatus,
    isLoading,
    error,
    refetchChits,
    refetchDocuments,
    refetchDelegates,
    refetchVoteTally,
    refetchBlocs,
  };
}
