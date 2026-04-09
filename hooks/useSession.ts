"use client";

import { useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import type { Session, SessionMode } from "@/lib/database.types";

/**
 * useSession — Subscribes to session changes via Postgres Changes realtime.
 * Uses DB as single source of truth for mode, agenda, timer.
 */
export function useSession(sessionId: string | null) {
  const { currentSession, setCurrentSession, setMode } = useAppStore();

  // Initial fetch
  useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();

    async function fetchSession() {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (data) {
        setCurrentSession(data as Session);
        setMode(data.mode as SessionMode);
      }
    }

    fetchSession();

    // Subscribe to changes
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newSession = payload.new as Session;
          setCurrentSession(newSession);
          setMode(newSession.mode as SessionMode);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, setCurrentSession, setMode]);

  // EB Actions
  const updateSession = useCallback(
    async (
      updates: Partial<
        Pick<
          Session,
          | "mode"
          | "agenda_text"
          | "timer_duration_s"
          | "timer_started_at"
          | "timer_paused"
        >
      >,
    ) => {
      if (!sessionId) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("sessions")
        .update(updates)
        .eq("id", sessionId);
      if (error) console.error("Session update error:", error);
    },
    [sessionId],
  );

  const changeMode = useCallback(
    (mode: SessionMode) => updateSession({ mode }),
    [updateSession],
  );

  const setAgenda = useCallback(
    (text: string) => updateSession({ agenda_text: text }),
    [updateSession],
  );

  const startTimer = useCallback(
    (durationSeconds: number) =>
      updateSession({
        timer_duration_s: durationSeconds,
        timer_started_at: new Date().toISOString(),
        timer_paused: false,
      }),
    [updateSession],
  );

  const pauseTimer = useCallback(() => {
    if (!currentSession) return;
    // Calculate remaining time and store it
    const started = currentSession.timer_started_at
      ? new Date(currentSession.timer_started_at).getTime()
      : null;
    const elapsed = started ? (Date.now() - started) / 1000 : 0;
    const remaining = Math.max(0, currentSession.timer_duration_s - elapsed);
    updateSession({
      timer_duration_s: Math.round(remaining),
      timer_started_at: null,
      timer_paused: true,
    });
  }, [currentSession, updateSession]);

  const resumeTimer = useCallback(
    () =>
      updateSession({
        timer_started_at: new Date().toISOString(),
        timer_paused: false,
      }),
    [updateSession],
  );

  const resetTimer = useCallback(
    () =>
      updateSession({
        timer_duration_s: 0,
        timer_started_at: null,
        timer_paused: true,
      }),
    [updateSession],
  );

  return {
    session: currentSession,
    changeMode,
    setAgenda,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    updateSession,
  };
}
