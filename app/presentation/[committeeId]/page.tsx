"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useCommitteeChannel } from "@/hooks/useCommitteeChannel";
import { useTimer } from "@/hooks/useTimer";
import { Mic, Zap } from "lucide-react";
import type {
  Committee,
  Session,
  SessionMode,
  Delegate,
  VotingRound,
  Vote,
} from "@/lib/database.types";

function countryFlag(name: string): string {
  const MAP: Record<string, string> = {
    france: "🇫🇷",
    "french republic": "🇫🇷",
    germany: "🇩🇪",
    india: "🇮🇳",
    "republic of india": "🇮🇳",
    "united states": "🇺🇸",
    usa: "🇺🇸",
    "united kingdom": "🇬🇧",
    uk: "🇬🇧",
    china: "🇨🇳",
    russia: "🇷🇺",
    "russian federation": "🇷🇺",
    japan: "🇯🇵",
    brazil: "🇧🇷",
    "south africa": "🇿🇦",
    australia: "🇦🇺",
    canada: "🇨🇦",
    mexico: "🇲🇽",
    egypt: "🇪🇬",
    nigeria: "🇳🇬",
    "saudi arabia": "🇸🇦",
    pakistan: "🇵🇰",
    turkey: "🇹🇷",
    indonesia: "🇮🇩",
    "south korea": "🇰🇷",
    italy: "🇮🇹",
    spain: "🇪🇸",
    argentina: "🇦🇷",
    israel: "🇮🇱",
    iran: "🇮🇷",
    secretariat: "🏛️",
    "test nation": "🏳️",
    admin: "🏛️",
  };
  return MAP[name.toLowerCase()] || "🏳️";
}

export default function PresentationPage() {
  const params = useParams();
  const committeeId = params.committeeId as string;
  const supabase = createClient();

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [activeRound, setActiveRound] = useState<VotingRound | null>(null);
  const [tally, setTally] = useState({ for: 0, against: 0, abstain: 0 });
  const [tickerItems, setTickerItems] = useState<string[]>([]);

  // Use useCommitteeChannel for speaker queue (presentation role = read-only)
  const channel = useCommitteeChannel(
    committeeId,
    "presentation",
    "presentation-screen",
  );

  const { session } = useSession(sessionData?.id || null);
  const timer = useTimer(session);

  const mode = (session?.mode || "normal") as SessionMode;

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: c } = await supabase
        .from("committees")
        .select("*")
        .eq("id", committeeId)
        .single();
      if (c) setCommittee(c as Committee);

      const today = new Date().toISOString().split("T")[0];
      const { data: s } = await supabase
        .from("sessions")
        .select("*")
        .eq("committee_id", committeeId)
        .eq("date", today)
        .single();
      if (s) setSessionData(s as Session);

      const { data: dels } = await supabase
        .from("delegates")
        .select("*")
        .eq("committee_id", committeeId);
      if (dels) setDelegates(dels as Delegate[]);
    }
    load();
  }, [committeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voting + delegate realtime ──────────────────────────────────────────
  useEffect(() => {
    if (!sessionData?.id) return;
    const ch = supabase
      .channel(`pres:${sessionData.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voting_rounds",
          filter: `session_id=eq.${sessionData.id}`,
        },
        (payload) => {
          const r = payload.new as VotingRound;
          if (r?.status === "open") {
            setActiveRound(r);
            addTickerItem(`🟢 Voting opened: ${r.resolution_title}`);
          } else {
            setActiveRound(null);
            addTickerItem(`Vote closed`);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `session_id=eq.${sessionData.id}`,
        },
        () => {
          if (activeRound) loadTally(activeRound.id);
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
        async () => {
          const { data } = await supabase
            .from("delegates")
            .select("*")
            .eq("committee_id", committeeId);
          if (data) setDelegates(data as Delegate[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionData?.id, activeRound?.id, committeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Announcement listener ───────────────────────────────────────────────
  useEffect(() => {
    if (channel.latestAnnouncement) {
      addTickerItem(`📢 ${channel.latestAnnouncement.content}`);
    }
  }, [channel.latestAnnouncement]);

  async function loadTally(roundId: string) {
    const { data } = await supabase
      .from("votes")
      .select("position")
      .eq("voting_round_id", roundId);
    if (data) {
      const t = { for: 0, against: 0, abstain: 0 };
      (data as Vote[]).forEach((v) => {
        t[v.position as keyof typeof t]++;
      });
      setTally(t);
    }
  }

  function addTickerItem(text: string) {
    setTickerItems((prev) => [text, ...prev].slice(0, 10));
  }

  // ── Theme colors ────────────────────────────────────────────────────────
  const themeColor =
    committee?.theme === "pirate"
      ? "#FFD700"
      : committee?.theme === "flame"
        ? "#FF4500"
        : "#0A84FF";
  const modeColor =
    mode === "crisis"
      ? "#FF3B30"
      : mode === "voting"
        ? "#30D158"
        : mode === "break"
          ? "#8E8E93"
          : themeColor;

  // Timer ring
  const ringSize = 320;
  const strokeWidth = 8;
  const radius = (ringSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - timer.progress);

  const presentCount = delegates.filter(
    (d) => d.is_present && d.role === "delegate",
  ).length;
  const totalDelegates = delegates.filter((d) => d.role === "delegate").length;

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "#020208" }}
      data-theme={committee?.theme || "default"}
    >
      {/* ── Background effects ──────────────────────────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(${modeColor}40 1px, transparent 1px), linear-gradient(90deg, ${modeColor}40 1px, transparent 1px)`,
          backgroundSize: "100px 100px",
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1400px] h-[1400px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${modeColor}08 0%, transparent 55%)`,
        }}
      />

      {mode === "crisis" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            animation: "crisis-pulse 2s ease-in-out infinite",
            background:
              "radial-gradient(circle, rgba(255,59,48,0.06) 0%, transparent 70%)",
          }}
        />
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-6 relative z-10">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Sapphire MUN"
            className="w-10 h-10 object-contain opacity-80"
          />
          <span
            className="text-lg font-bold tracking-widest text-[#a8d8f0]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            SAPPHIRE <span className="text-white">MUN</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`mode-badge mode-badge--${mode} text-sm px-6 py-2.5 shadow-lg backdrop-blur-md bg-black/40`}
          >
            <span
              className="w-3 h-3 rounded-full inline-block animate-pulse-dot"
              style={{ background: modeColor }}
            />
            {mode.charAt(0).toUpperCase() + mode.slice(1)} Session
          </span>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative z-10 -mt-10">
        {mode === "voting" && activeRound ? (
          /* ═══ VOTING DISPLAY ═══ */
          <div className="text-center w-full max-w-6xl px-8 mt-12 animate-fade-in-up">
            <p
              className="text-base uppercase tracking-[0.4em] mb-6 font-bold"
              style={{ color: "#30D158" }}
            >
              Voting in Progress
            </p>
            <h1
              className="text-5xl md:text-7xl font-bold mb-20 leading-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {activeRound.resolution_title}
            </h1>
            <div className="flex items-end justify-center gap-24">
              {[
                {
                  label: "For",
                  count: tally.for,
                  color: "#30D158",
                  bg: "rgba(48,209,88,0.08)",
                },
                {
                  label: "Against",
                  count: tally.against,
                  color: "#FF3B30",
                  bg: "rgba(255,59,48,0.08)",
                },
                {
                  label: "Abstain",
                  count: tally.abstain,
                  color: "#8E8E93",
                  bg: "rgba(142,142,147,0.08)",
                },
              ].map((v) => (
                <div key={v.label} className="text-center w-48 relative">
                  <div
                    className="absolute inset-x-0 bottom-full h-48 mb-8 rounded-t-2xl flex items-end justify-center pb-6"
                    style={{
                      background: `linear-gradient(to top, ${v.color}20, transparent)`,
                    }}
                  >
                    <p
                      className="text-[120px] leading-none font-bold tabular-nums"
                      style={{
                        color: v.color,
                        fontFamily: "var(--font-heading)",
                        textShadow: `0 0 40px ${v.color}40`,
                      }}
                    >
                      {v.count}
                    </p>
                  </div>
                  <div
                    className="pt-4 border-t-2"
                    style={{ borderColor: `${v.color}40` }}
                  >
                    <p
                      className="text-lg uppercase tracking-widest font-bold"
                      style={{ color: v.color }}
                    >
                      {v.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-20 text-lg opacity-50 font-medium">
              <span className="text-white">
                {tally.for + tally.against + tally.abstain}
              </span>{" "}
              votes cast / <span className="text-white">{presentCount}</span>{" "}
              quorum
            </p>
          </div>
        ) : (
          /* ═══ NORMAL / CRISIS / BREAK DISPLAY ═══ */
          <div className="flex items-center justify-between w-full max-w-[90%] px-8">
            {/* Left: Speaker queue */}
            <div
              className="w-80 flex-shrink-0 animate-slide-in-right"
              style={{ animationDirection: "reverse" }}
            >
              <p className="text-xs uppercase tracking-[0.3em] mb-6 opacity-50 font-bold">
                Speakers Queue
              </p>
              {channel.queue.length > 0 ? (
                <div className="space-y-3">
                  {channel.queue.slice(0, 8).map((entry, i) => (
                    <div
                      key={entry.delegate_id}
                      className="flex items-center gap-4 py-3 px-4 rounded-2xl border"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        borderColor: "rgba(255,255,255,0.05)",
                        backdropFilter: "blur(10px)",
                      }}
                    >
                      <span className="text-xs font-mono opacity-30 w-4 text-center">
                        {i + 1}
                      </span>
                      <span className="text-2xl">
                        {countryFlag(entry.country)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold truncate">
                          {entry.display_name}
                        </p>
                        <p className="text-[11px] opacity-50 uppercase tracking-wider">
                          {entry.country}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="py-12 border border-dashed rounded-2xl text-center"
                  style={{ borderColor: "rgba(255,255,255,0.1)" }}
                >
                  <p className="text-base opacity-40">Queue empty</p>
                </div>
              )}
            </div>

            {/* Center: Timer + Current Speaker */}
            <div className="flex-1 text-center flex flex-col items-center justify-center animate-scale-in">
              {/* Current speaking label */}
              <p className="text-xs uppercase tracking-[0.4em] mb-4 opacity-50 font-bold text-cyan-200">
                {channel.current
                  ? "Currently Speaking"
                  : committee?.name || "Loading…"}
              </p>

              {/* Current speaker name */}
              {channel.current && (
                <div className="mb-12 relative">
                  <div className="absolute inset-0 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <span className="text-6xl filter drop-shadow-lg">
                        {countryFlag(channel.current.country)}
                      </span>
                    </div>
                    <h1
                      className="text-5xl md:text-7xl font-bold uppercase tracking-wider"
                      style={{
                        fontFamily: "var(--font-heading)",
                        textShadow: "0 4px 20px rgba(0,0,0,0.5)",
                      }}
                    >
                      {channel.current.country}
                    </h1>
                    <p className="text-xl mt-3 opacity-60">
                      {channel.current.display_name}
                    </p>
                  </div>
                </div>
              )}

              {/* Timer */}
              <div className="flex justify-center mb-10 relative">
                {/* Internal glow for running timer */}
                {timer.isRunning && (
                  <div className="absolute inset-0 bg-blue-500/20 blur-[80px] rounded-full pointer-events-none animate-pulse" />
                )}
                <div className="relative inline-flex items-center justify-center">
                  <svg
                    width={ringSize}
                    height={ringSize}
                    className="transform -rotate-90"
                  >
                    <circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      r={radius}
                      fill="none"
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={strokeWidth}
                    />
                    <circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      r={radius}
                      fill="none"
                      stroke={modeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      className="timer-ring filter drop-shadow-md"
                    />
                  </svg>
                  <span
                    className="absolute text-8xl md:text-9xl font-bold tabular-nums"
                    style={{
                      fontFamily: "var(--font-heading)",
                      color: timer.isRunning
                        ? "#ffffff"
                        : "rgba(255,255,255,0.3)",
                      textShadow: timer.isRunning
                        ? `0 0 30px ${modeColor}80`
                        : "none",
                    }}
                  >
                    {timer.formatted}
                  </span>
                </div>
              </div>

              {/* Agenda */}
              {session?.agenda_text && (
                <div className="flex items-center justify-center gap-3 opacity-60 bg-white/5 py-3 px-6 rounded-full border border-white/10 backdrop-blur-md">
                  <Zap size={18} className="text-amber-400" />
                  <p className="text-lg font-medium">
                    Topic:{" "}
                    <span className="text-white">{session.agenda_text}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Right: Stats */}
            <div className="w-64 flex-shrink-0 text-right space-y-12 animate-slide-in-right">
              <div>
                <p
                  className="text-6xl font-bold"
                  style={{
                    fontFamily: "var(--font-heading)",
                    color: modeColor,
                    textShadow: `0 0 20px ${modeColor}40`,
                  }}
                >
                  {channel.queue.length + (channel.current ? 1 : 0)}
                </p>
                <p className="text-xs uppercase tracking-[0.3em] opacity-40 mt-2 font-bold">
                  Speakers Remaining
                </p>
              </div>
              <div>
                <p
                  className="text-6xl font-bold"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {presentCount}
                  <span className="text-3xl opacity-30 text-white font-light tabular-nums">
                    /{totalDelegates}
                  </span>
                </p>
                <p className="text-xs uppercase tracking-[0.3em] opacity-40 mt-2 font-bold">
                  Quorum
                </p>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p
                  className="text-2xl font-bold uppercase tracking-wider"
                  style={{
                    color:
                      presentCount >= Math.ceil(totalDelegates / 2)
                        ? "#30D158"
                        : "#FF3B30",
                  }}
                >
                  {presentCount >= Math.ceil(totalDelegates / 2)
                    ? "Quorum Met"
                    : "No Quorum"}
                </p>
                <p className="text-xs uppercase tracking-[0.3em] opacity-40 mt-2 font-bold">
                  Status
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom ticker ───────────────────────────────────────────────── */}
      <footer
        className="relative z-10 border-t bg-black/40 backdrop-blur-xl"
        style={{ borderColor: "rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center h-16 px-8 overflow-hidden">
          <div className="flex items-center gap-3 mr-8 flex-shrink-0 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse-dot"
              style={{ background: modeColor }}
            />
            <span
              className="text-sm font-bold tracking-widest"
              style={{ color: modeColor }}
            >
              LIVE FEED
            </span>
          </div>
          <div
            className="flex-1 overflow-hidden relative"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
            }}
          >
            <div
              className="flex gap-16 whitespace-nowrap animate-[ticker_40s_linear_infinite]"
              style={{ width: "max-content" }}
            >
              {/* Duplicate array for seamless scrolling */}
              {[
                ...(tickerItems.length > 0
                  ? tickerItems
                  : ["Session active — waiting for updates…"]),
                ...(tickerItems.length > 0
                  ? tickerItems
                  : ["Session active — waiting for updates…"]),
              ].map((item, i) => (
                <span
                  key={i}
                  className="text-sm font-medium text-white/50 tracking-wide uppercase"
                >
                  <span className="text-cyan-500 mr-4 font-bold">/</span> {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Branding watermark */}
        <div className="absolute bottom-20 right-8 flex items-center gap-3 opacity-20 pointer-events-none">
          <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
          <span
            className="text-xs tracking-[0.3em] font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            SAPPHIRE MUN
          </span>
        </div>
      </footer>
    </div>
  );
}
