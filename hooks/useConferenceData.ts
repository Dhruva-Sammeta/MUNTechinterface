"use client";

/**
 * useConferenceData — Shared hook for loading + subscribing to all persistent
 * conference data from Supabase. Used by Delegate, EB, and Presentation pages.
 *
 * RULES:
 * - All truth comes from Supabase (postgres_changes realtime)
 * - NO localStorage, NO local DB, NO hallucinated caches
 * - On disconnect: UI shows last-known state + reconnecting indicator
 * - On reconnect: full refetch, state replaced (never merged)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import type {
  Committee,
  Delegate,
  Session,
  SessionMode,
  Chit,
  Document as MUNDocument,
  Bloc,
  BlocMember,
  VotingRound,
  Vote as VoteType,
  ChitWithDelegates,
  BlocWithMembers,
  BlocMemberWithDelegate,
} from "@/lib/database.types";

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

interface ConferenceData {
  // Core entities
  committee: Committee | null;
  delegate: Delegate | null;
  session: Session | null;
  delegates: Delegate[];

  // Sub-data
  chits: ChitWithDelegates[];
  documents: MUNDocument[];
  blocs: BlocWithMembers[];
  activeRound: VotingRound | null;
  voteTally: { for: number; against: number; abstain: number };
  myVote: VoteType | null;

  // Status
  connectionStatus: ConnectionStatus;
  isLoading: boolean;

  // Refetch
  refetchChits: () => Promise<void>;
  refetchDocuments: () => Promise<void>;
  refetchDelegates: () => Promise<void>;
  refetchVoteTally: (roundId: string) => Promise<void>;
  refetchBlocs: () => Promise<void>;
}

export function useConferenceData(committeeId: string): ConferenceData {
  const supabase = createClient();
  const {
    setCurrentCommittee,
    setCurrentDelegate,
    setCurrentSession,
    setMode,
  } = useAppStore();

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [delegate, setDelegate] = useState<Delegate | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [chits, setChits] = useState<ChitWithDelegates[]>([]);
  const [documents, setDocuments] = useState<MUNDocument[]>([]);
  const [blocs, setBlocs] = useState<BlocWithMembers[]>([]);
  const [activeRound, setActiveRound] = useState<VotingRound | null>(null);
  const [voteTally, setVoteTally] = useState({
    for: 0,
    against: 0,
    abstain: 0,
  });
  const [myVote, setMyVote] = useState<VoteType | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [isLoading, setIsLoading] = useState(true);

  const sessionRef = useRef<Session | null>(null);
  const delegateRef = useRef<Delegate | null>(null);

  // Keep refs in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    delegateRef.current = delegate;
  }, [delegate]);

  // ── Fetchers (stable via useCallback) ───────────────────────────────────

  const refetchDelegates = useCallback(async () => {
    const { data } = await supabase
      .from("delegates")
      .select("*")
      .eq("committee_id", committeeId);
    if (data) setDelegates(data as Delegate[]);
  }, [committeeId, supabase]);

  const refetchChits = useCallback(async () => {
    const sess = sessionRef.current;
    const del = delegateRef.current;
    if (!sess?.id || !del?.id) return;

    // EB/admin: see all chits for the session
    // Delegate: see chits they sent or received (approved only for received)
    if (del.role === "eb" || del.role === "admin") {
      const { data } = await supabase
        .from("chits")
        .select(
          "*, from_delegate:from_delegate_id(id,display_name,country), to_delegate:to_delegate_id(id,display_name,country)",
        )
        .eq("session_id", sess.id)
        .order("sent_at", { ascending: false });
      if (data) setChits(data as unknown as ChitWithDelegates[]);
    } else {
      const { data } = await supabase
        .from("chits")
        .select(
          "*, from_delegate:from_delegate_id(id,display_name,country), to_delegate:to_delegate_id(id,display_name,country)",
        )
        .eq("session_id", sess.id)
        .or(
          `from_delegate_id.eq.${del.id},and(to_delegate_id.eq.${del.id},is_approved.eq.true)`,
        )
        .order("sent_at", { ascending: false });
      if (data) setChits(data as unknown as ChitWithDelegates[]);
    }
  }, [committeeId, supabase]);

  const refetchDocuments = useCallback(async () => {
    const sess = sessionRef.current;
    const del = delegateRef.current;
    if (!sess?.id) return;

    if (del?.role === "eb" || del?.role === "admin") {
      // EB sees all docs
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("committee_id", committeeId)
        .order("uploaded_at", { ascending: false });
      if (data) setDocuments(data as MUNDocument[]);
    } else {
      // Delegates see approved docs + their own pending
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("committee_id", committeeId)
        .or(`status.eq.approved,uploaded_by.eq.${del?.id}`)
        .order("uploaded_at", { ascending: false });
      if (data) setDocuments(data as MUNDocument[]);
    }
  }, [committeeId, supabase]);

  const refetchVoteTally = useCallback(
    async (roundId: string) => {
      const { data } = await supabase
        .from("votes")
        .select("position")
        .eq("voting_round_id", roundId);
      if (data) {
        const t = { for: 0, against: 0, abstain: 0 };
        (data as VoteType[]).forEach((v) => {
          t[v.position as keyof typeof t]++;
        });
        setVoteTally(t);
      }
      // Check my vote
      const del = delegateRef.current;
      if (del) {
        const { data: mv } = await supabase
          .from("votes")
          .select("*")
          .eq("voting_round_id", roundId)
          .eq("delegate_id", del.id)
          .maybeSingle();
        setMyVote(mv as VoteType | null);
      }
    },
    [supabase],
  );

  const refetchVotingRounds = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess?.id) return;
    const { data } = await supabase
      .from("voting_rounds")
      .select("*")
      .eq("session_id", sess.id)
      .order("opened_at", { ascending: false });
    if (data) {
      const open = (data as VotingRound[]).find((r) => r.status === "open");
      setActiveRound(open ?? null);
      if (open) refetchVoteTally(open.id);
    }
  }, [supabase, refetchVoteTally]);

  const refetchBlocs = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess?.id) return;
    const { data } = await supabase
      .from("blocs")
      .select(
        "*, members:bloc_members(*, delegate:delegate_id(id,display_name,country))",
      )
      .eq("session_id", sess.id)
      .order("created_at", { ascending: false });
    if (data) setBlocs(data as unknown as BlocWithMembers[]);
  }, [supabase]);

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setIsLoading(false);
        return;
      }

      // Fetch committee + delegate in parallel
      const [cRes, dRes] = await Promise.all([
        supabase.from("committees").select("*").eq("id", committeeId).maybeSingle(),
        supabase.from("delegates").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      if (cRes.data) {
        const c = cRes.data as Committee;
        setCommittee(c);
        setCurrentCommittee(c);
      }
      if (dRes.data) {
        const d = dRes.data as Delegate;
        setDelegate(d);
        setCurrentDelegate(d);
      }

      // Get or create today's session
      const today = new Date().toISOString().split("T")[0];
      let { data: sess } = await supabase
        .from("sessions")
        .select("*")
        .eq("committee_id", committeeId)
        .eq("date", today)
        .maybeSingle();

      // If EB/admin and no session exists, auto-create
      if (
        !sess &&
        dRes.data &&
        (dRes.data.role === "eb" || dRes.data.role === "admin")
      ) {
        const { data: newSess } = await supabase
          .from("sessions")
          .insert({ committee_id: committeeId, date: today })
          .select()
          .maybeSingle();
        sess = newSess;
      }

      if (cancelled) return;

      if (sess) {
        const s = sess as Session;
        setSession(s);
        setCurrentSession(s);
        setMode(s.mode as SessionMode);
      }

      // Load sub-data
      await Promise.all([
        refetchDelegates(),
        refetchChits(),
        refetchDocuments(),
        refetchVotingRounds(),
        refetchBlocs(),
      ]);

      if (!cancelled) setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [committeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    // Always create a channel to avoid showing "Reconnecting..." falsely,
    // and to listen for session creation if one doesn't exist yet!
    const channelName = session?.id 
      ? `conference_data:${session.id}` 
      : `conference_data_waiting:${committeeId}`;

    const channel = supabase.channel(channelName);

    if (session?.id) {
      // 1. We have an active session — subscribe to all session-scoped events
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
            const newSession = payload.new as Session;
            setSession(newSession);
            setCurrentSession(newSession);
            setMode(newSession.mode as SessionMode);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chits",
            filter: `session_id=eq.${session.id}`,
          },
          () => refetchChits(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "documents",
            filter: `committee_id=eq.${committeeId}`,
          },
          () => refetchDocuments(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "voting_rounds",
            filter: `session_id=eq.${session.id}`,
          },
          () => refetchVotingRounds(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "votes",
            filter: `session_id=eq.${session.id}`,
          },
          () => {
            if (activeRound) refetchVoteTally(activeRound.id);
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
          () => refetchDelegates(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "blocs",
            filter: `session_id=eq.${session.id}`,
          },
          () => refetchBlocs(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bloc_members",
          },
          () => refetchBlocs(),
        );

      // Fetch fresh session to snap timer immediately on subscribe
      async function refetchSession() {
        const { data } = await supabase
          .from("sessions")
          .select("*")
          .eq("id", session!.id)
          .maybeSingle();
        if (data) {
          const s = data as Session;
          setSession(s);
          setCurrentSession(s);
          setMode(s.mode as SessionMode);
        }
      }

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
          refetchSession();
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("reconnecting");
        } else if (status === "CLOSED") {
          setConnectionStatus("disconnected");
        }
      });
    } else {
      // 2. No active session yet — listen for one to be created by the EB
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
            const newSession = payload.new as Session;
            setSession(newSession);
            setCurrentSession(newSession);
            setMode(newSession.mode as SessionMode);
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
          () => refetchDelegates(),
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
  }, [session?.id, activeRound?.id, committeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    committee,
    delegate,
    session,
    delegates,
    chits,
    documents,
    blocs,
    activeRound,
    voteTally,
    myVote,
    connectionStatus,
    isLoading,
    refetchChits,
    refetchDocuments,
    refetchDelegates,
    refetchVoteTally,
    refetchBlocs,
  };
}
