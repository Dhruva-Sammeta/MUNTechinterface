"use client";

import { useState, useEffect, useCallback } from "react";
import type { Session } from "@/lib/database.types";

/**
 * useTimer — Client-reconstructed countdown timer from DB timestamps.
 *
 * Timer is NOT a server cron. All clients compute remaining time locally
 * from the same DB values (timer_started_at, timer_duration_s), achieving
 * perfect sync without any server-side ticking.
 *
 * Elapsed = now() - timer_started_at
 * Remaining = timer_duration_s - elapsed
 */
export function useTimer(session: Session | null) {
  const [remaining, setRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!session) {
      setRemaining(0);
      setIsRunning(false);
      setProgress(0);
      return;
    }

    const totalDuration = session.timer_duration_s;

    if (session.timer_paused || !session.timer_started_at) {
      // Timer is paused — show static remaining
      setRemaining(totalDuration);
      setIsRunning(false);
      setProgress(totalDuration > 0 ? 1 : 0);
      return;
    }

    // Timer is running — compute from started_at
    setIsRunning(true);
    const startedAt = new Date(session.timer_started_at).getTime();

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rem = Math.max(0, totalDuration - elapsed);
      setRemaining(rem);
      setProgress(totalDuration > 0 ? rem / totalDuration : 0);

      if (rem <= 0) {
        setIsRunning(false);
      }
    };

    tick(); // Immediate first tick
    const interval = setInterval(tick, 100); // 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [
    session?.timer_duration_s,
    session?.timer_started_at,
    session?.timer_paused,
    session,
  ]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  return {
    remaining,
    isRunning,
    progress,
    formatted: formatTime(remaining),
    totalDuration: session?.timer_duration_s || 0,
  };
}
