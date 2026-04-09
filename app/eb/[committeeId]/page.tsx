"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useConferenceData } from "@/hooks/useConferenceData";
import { useCommitteeChannel } from "@/hooks/useCommitteeChannel";
import { useSession } from "@/hooks/useSession";
import { useTimer } from "@/hooks/useTimer";
import { encryptChit, decryptChit } from "@/lib/crypto";
import {
  ModeBadge,
  TimerDisplay,
  GlassPanel,
  SectionHeader,
  EmptyState,
  AnnouncementOverlay,
  MobileBottomNav,
} from "@/components/ui/shared";
import {
  LayoutDashboard,
  Mic,
  MessageSquare,
  FileText,
  Vote,
  Users,
  Send,
  Settings,
  Shield,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  Trash2,
  PlusCircle,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
  Loader2,
  WifiOff,
  Wifi,
  GripVertical,
} from "lucide-react";
import { ChatHub } from "@/components/chat/ChatHub";
import type {
  Delegate,
  SessionMode,
  DocumentType,
  VotingRound,
} from "@/lib/database.types";
import { toast } from "sonner";
import { motion, AnimatePresence, Reorder } from "framer-motion";

import { countryFlag } from "@/lib/countryFlag";

type Tab =
  | "dashboard"
  | "attendance"
  | "speakers"
  | "chits"
  | "docs"
  | "voting";

export default function EBPage() {
  const params = useParams();
  const committeeId = params.committeeId as string;
  const supabase = createClient();

  const data = useConferenceData(committeeId);
  const {
    session: liveSession,
    changeMode,
    setAgenda,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
  } = useSession(data.session?.id || null);
  const timer = useTimer(liveSession);
  const channel = useCommitteeChannel(
    committeeId,
    "eb",
    data.delegate?.id || null,
  );

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [showSettings, setShowSettings] = useState(false);
  const [timerInput, setTimerInput] = useState("1m 30s");
  const [agendaInput, setAgendaInput] = useState("");
  const [resolutionTitle, setResolutionTitle] = useState("");
  const [votingClosing, setVotingClosing] = useState(false);
  const [attendanceMarking, setAttendanceMarking] = useState<string | null>(
    null,
  );

  const {
    committee,
    delegate,
    session,
    delegates,
    chits,
    documents,
    activeRound,
    voteTally,
  } = data;
  const mode = (liveSession?.mode || session?.mode || "normal") as SessionMode;
  const themeColor =
    mode === "crisis"
      ? "#FF3B30"
      : mode === "voting"
        ? "#30D158"
        : mode === "break"
          ? "#8E8E93"
          : committee?.theme === "pirate"
            ? "#FFD700"
            : committee?.theme === "flame"
              ? "#FF4500"
              : "#0A84FF";

  // Protect route
  useEffect(() => {
    if (delegate && delegate.role !== "eb" && delegate.role !== "admin") {
      window.location.href = `/delegate/${committeeId}`;
    }
  }, [delegate, committeeId]);

  // Sync inputs
  useEffect(() => {
    if (liveSession?.agenda_text && liveSession.agenda_text !== agendaInput) {
      setAgendaInput(liveSession.agenda_text);
    }
  }, [liveSession?.agenda_text]); // eslint-disable-line react-hooks/exhaustive-deps

  function parseTimerInput(input: string): number {
    const parts = input.toLowerCase().split(" ");
    let s = 0;
    for (const p of parts) {
      if (p.includes("m")) s += parseInt(p) * 60;
      else if (p.includes("s")) s += parseInt(p);
    }
    return s || 90;
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  async function toggleAttendance(d: Delegate) {
    if (!liveSession?.id || !delegate?.id) return;
    setAttendanceMarking(d.id);
    const newVal = !d.is_present;
    await supabase
      .from("delegates")
      .update({ is_present: newVal })
      .eq("id", d.id);
    if (newVal) {
      await supabase.from("attendance").insert({
        delegate_id: d.id,
        session_id: liveSession.id,
        marked_by: delegate.id,
      });
      // Auto-add to queue if they just arrived and are late
      if (
        channel.queue.length > 0 &&
        !channel.queue.some((q) => q.delegate_id === d.id)
      ) {
        // ADDED BUG FIX: changed channel.addToQueue(d) to channel.add(entry)
        channel.add({
          delegate_id: d.id,
          display_name: d.display_name,
          country: d.country,
          added_at: Date.now(),
        });
        toast.success(`Marked present and added to queue`);
      } else {
        toast.success(`Marked present`);
      }
    } else {
      channel.remove(d.id);
      toast.info(`Marked absent (removed from queue)`);
    }
    setAttendanceMarking(null);
  }

  async function markAllPresent() {
    const promises = delegates.map((d) =>
      supabase.from("delegates").update({ is_present: true }).eq("id", d.id),
    );
    await Promise.all(promises);
    toast.success("All delegates marked present");
  }

  async function reviewChit(chitId: string, approved: boolean) {
    if (!delegate?.id) return;
    const { error } = await supabase
      .from("chits")
      .update({
        is_approved: approved,
        approved_at: new Date().toISOString(),
        approved_by: delegate.id,
      })
      .eq("id", chitId);
    if (error) toast.error(error.message);
    else toast.success(approved ? "Chit approved & sent" : "Chit rejected");
  }

  async function reviewDoc(docId: string, status: "approved" | "rejected") {
    if (!delegate?.id) return;
    const { error } = await supabase
      .from("documents")
      .update({ status, reviewed_by: delegate.id })
      .eq("id", docId);
    if (error) toast.error(error.message);
    else toast.success(`Document ${status}`);
  }

  async function startVotingRound() {
    if (!resolutionTitle.trim() || !liveSession?.id || !delegate?.id) return;
    const { error } = await supabase.from("voting_rounds").insert({
      session_id: liveSession.id,
      resolution_title: resolutionTitle.trim(),
      status: "open",
      created_by: delegate.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Voting opened");
      setResolutionTitle("");
      changeMode("voting");
    }
  }

  async function closeVotingRound() {
    if (!activeRound) return;
    setVotingClosing(true);
    const { error } = await supabase
      .from("voting_rounds")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", activeRound.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Voting closed");
      changeMode("normal");
    }
    setVotingClosing(false);
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (data.isLoading || !committee || !delegate) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--color-bg-primary)" }}
      >
        <Loader2
          size={32}
          className="animate-spin"
          style={{ color: themeColor }}
        />
      </div>
    );
  }

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: "dashboard", label: "Monitor", icon: <LayoutDashboard size={18} /> },
    { id: "attendance", label: "Roll Call", icon: <CheckCircle2 size={18} /> },
    { id: "speakers", label: "Queue", icon: <Mic size={18} /> },
    {
      id: "chits",
      label: "Chits",
      icon: <MessageSquare size={18} />,
      badge: chits.filter((c) => c.is_approved === null).length,
    },
    {
      id: "docs",
      label: "Docs",
      icon: <FileText size={18} />,
      badge: documents.filter((d) => d.status === "pending").length,
    },
    { id: "voting", label: "Voting", icon: <Vote size={18} /> },
  ];

  const presentCount = delegates.filter(
    (d) => d.is_present && d.role === "delegate",
  ).length;
  const totalDelegates = delegates.filter((d) => d.role === "delegate").length;

  return (
    <div
      className="min-h-screen flex transition-colors duration-500"
      style={{ background: "var(--color-bg-primary)" }}
      data-theme={committee.theme}
      data-mode={mode}
    >
      {/* ── Left sidebar (desktop only) ─────────────────────────────────── */}
      <aside className="app-sidebar">
        <div
          className="px-4 py-4 flex items-center gap-2 border-b sidebar-expanded"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <img
            src="/logo.png"
            alt="Sapphire MUN"
            className="w-7 h-7 object-contain"
          />
          <span
            className="text-sm font-bold tracking-wider sidebar-label"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            SAPPHIRE EB
          </span>
        </div>

        <div
          className="px-4 py-3 border-b sidebar-expanded"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <p
            className="text-[10px] uppercase tracking-widest sidebar-label"
            style={{ color: "var(--color-sapphire-500)" }}
          >
            EXECUTIVE BOARD
          </p>
          <p className="text-sm font-semibold mt-0.5 text-white sidebar-label">
            {delegate.display_name}
          </p>
          <p
            className="text-[11px] mt-0.5 sidebar-label"
            style={{ color: "var(--color-text-muted)" }}
          >
            {committee.name}
          </p>
        </div>

        <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative"
              style={{
                background:
                  activeTab === tab.id ? `${themeColor}15` : "transparent",
                color:
                  activeTab === tab.id
                    ? themeColor
                    : "var(--color-text-secondary)",
              }}
            >
              <span className="sidebar-icon-only">{tab.icon}</span>
              <span className="sidebar-label">{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span
                  className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full sidebar-label"
                  style={{ background: "#FF3B30", color: "#fff" }}
                >
                  {tab.badge}
                </span>
              ) : null}
              {activeTab === tab.id && (
                <span
                  className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                  style={{ background: themeColor }}
                />
              )}
            </button>
          ))}
        </nav>

        <div
          className="p-3 space-y-2 border-t sidebar-expanded"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Settings size={16} />{" "}
            <span className="sidebar-label">Committee Settings</span>
          </button>
          <div className="credits-section opacity-30 mt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest">
              Credits: Dhruva Sammeta
            </p>
            <p className="text-[9px] uppercase tracking-[0.2em]">
              All rights reserved, Sapphire MUN
            </p>
          </div>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ──────────────────────────────────────────── */}
      <MobileBottomNav
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
        accentColor={themeColor}
      />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 app-main-content">
        <header
          className="flex items-center justify-between px-6 py-3 border-b app-header"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-secondary)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt=""
              className="w-6 h-6 object-contain md:hidden flex-shrink-0"
            />
            <span
              className="text-xs font-bold tracking-widest px-2 py-0.5 rounded uppercase hidden md:inline-block"
              style={{
                background: "rgba(10,132,255,0.15)",
                color: "var(--color-sapphire-400)",
                border: "1px solid rgba(10,132,255,0.3)",
              }}
            >
              EB MODE
            </span>
            <h1
              className="text-base md:text-lg font-bold truncate"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {committee.short_name} Controls
            </h1>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* DIAGNOSTIC SYSTEM */}
            {data.connectionStatus === "connected" ? (
              <span className="text-[10px] flex items-center gap-1 text-emerald-400 font-mono tracking-widest border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded cursor-help" title="Connected: Realtime sync active">
                <Wifi size={10} /> Connected
              </span>
            ) : data.connectionStatus === "reconnecting" ? (
              <span className="text-[10px] flex items-center gap-1 text-amber-400 font-mono tracking-widest border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 rounded cursor-help" title="ERR1: Realtime Link Reconnecting">
                <WifiOff size={10} /> ERR1
              </span>
            ) : (
              <span className="text-[10px] flex items-center gap-1 text-red-500 font-mono tracking-widest border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 rounded cursor-help" title="ERR3: Database Disconnected">
                <AlertCircle size={10} /> ERR3
              </span>
            )}
            <ModeBadge mode={mode} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 app-content-area">
          {/* ═══ DASHBOARD / SESSION CONTROLS ═══ */}
          {activeTab === "dashboard" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl animate-fade-in">
              {/* Left Column: Timer & Mode */}
              <div className="space-y-4">
                <GlassPanel>
                  <SectionHeader
                    title="Master Timer"
                    subtitle="Syncs to all delegate & presentation screens instantly"
                  />
                  <div className="flex flex-col items-center justify-center py-6">
                    <TimerDisplay session={liveSession} size="lg" />

                    <div className="flex items-center gap-2 mt-8">
                      <input
                        type="text"
                        value={timerInput}
                        onChange={(e) => setTimerInput(e.target.value)}
                        className="w-24 text-center rounded-xl px-2 py-2 text-sm outline-none bg-black/40 border border-white/10"
                        placeholder="1m 30s"
                      />
                      <button
                        onClick={() => startTimer(parseTimerInput(timerInput))}
                        className="p-2.5 rounded-xl text-white transition-all hover:scale-105 active:scale-95"
                        style={{ background: "var(--color-sapphire-500)" }}
                      >
                        <Play size={18} fill="currentColor" />
                      </button>
                      {timer.isRunning ? (
                        <button
                          onClick={pauseTimer}
                          className="p-2.5 rounded-xl transition-all hover:bg-white/5 active:scale-95"
                          style={{
                            border: "1px solid var(--color-border-default)",
                          }}
                        >
                          <Pause size={18} fill="currentColor" />
                        </button>
                      ) : (
                        <button
                          onClick={resumeTimer}
                          disabled={timer.remaining === 0}
                          className="p-2.5 rounded-xl transition-all hover:bg-white/5 active:scale-95 disabled:opacity-30"
                          style={{
                            border: "1px solid var(--color-border-default)",
                          }}
                        >
                          <Play size={18} fill="currentColor" />
                        </button>
                      )}
                      <button
                        onClick={resetTimer}
                        className="p-2.5 rounded-xl transition-all hover:bg-white/5 active:scale-95 text-red-400"
                        style={{
                          border: "1px solid var(--color-border-default)",
                        }}
                      >
                        <RotateCcw size={18} />
                      </button>
                    </div>
                  </div>
                </GlassPanel>

                <GlassPanel>
                  <SectionHeader
                    title="Session Mode"
                    subtitle="Changes UI colors & available actions for all delegates"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      ["normal", "crisis", "voting", "break"] as SessionMode[]
                    ).map((m) => (
                      <button
                        key={m}
                        onClick={() => changeMode(m)}
                        className="px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all active:scale-[0.97]"
                        style={{
                          background:
                            mode === m
                              ? m === "normal"
                                ? "rgba(10,132,255,0.2)"
                                : m === "crisis"
                                  ? "rgba(255,59,48,0.2)"
                                  : m === "voting"
                                    ? "rgba(48,209,88,0.2)"
                                    : "rgba(142,142,147,0.2)"
                              : "var(--color-bg-elevated)",
                          color:
                            mode === m
                              ? m === "normal"
                                ? "#0A84FF"
                                : m === "crisis"
                                  ? "#FF3B30"
                                  : m === "voting"
                                    ? "#30D158"
                                    : "#8E8E93"
                              : "var(--color-text-secondary)",
                          border:
                            mode === m
                              ? `1px solid ${m === "normal" ? "#0A84FF" : m === "crisis" ? "#FF3B30" : m === "voting" ? "#30D158" : "#8E8E93"}`
                              : "1px solid var(--color-border-default)",
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </GlassPanel>
              </div>

              {/* Right Column: Speaker & Agenda */}
              <div className="space-y-4">
                <GlassPanel>
                  <SectionHeader title="Currently Speaking" />
                  {channel.current ? (
                    <div
                      className="text-center py-6 animate-speaking-glow"
                      style={
                        {
                          background: `${themeColor}05`,
                          borderRadius: "var(--radius-card)",
                          border: `1px solid ${themeColor}20`,
                          "--glow-color": `${themeColor}40`,
                        } as React.CSSProperties
                      }
                    >
                      <span className="text-5xl">
                        {countryFlag(channel.current.country)}
                      </span>
                      <h2
                        className="text-2xl font-bold mt-2"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {channel.current.country}
                      </h2>
                      <p
                        className="text-sm"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {channel.current.display_name}
                      </p>

                      <div className="flex justify-center gap-2 mt-6">
                        <button
                          onClick={channel.dismissCurrent}
                          className="btn-secondary text-xs"
                        >
                          Dismiss Speaker
                        </button>
                        <button
                          onClick={channel.promoteNext}
                          className="btn-primary text-xs bg-green-600 hover:bg-green-500"
                        >
                          Next in Queue <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <EmptyState icon={Mic} message="Floor is open" />
                      {channel.queue.length > 0 && (
                        <button
                          onClick={channel.promoteNext}
                          className="mt-4 btn-primary animate-scale-in"
                        >
                          Call Next Speaker
                        </button>
                      )}
                    </div>
                  )}
                </GlassPanel>

                <GlassPanel>
                  <SectionHeader title="Live Agenda" />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={agendaInput}
                      onChange={(e) => setAgendaInput(e.target.value)}
                      placeholder="e.g. Setting the agenda for..."
                      className="flex-1 rounded-xl px-3 py-2 text-sm outline-none bg-black/40 border border-white/10"
                    />
                    <button
                      onClick={() => setAgenda(agendaInput)}
                      className="btn-secondary px-3"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </GlassPanel>
              </div>
            </div>
          )}

          {/* ═══ ROLL CALL / ATTENDANCE ═══ */}
          {activeTab === "attendance" && (
            <div className="max-w-4xl space-y-4 animate-fade-in">
              <GlassPanel>
                <SectionHeader
                  title="Roll Call"
                  subtitle={`${presentCount}/${totalDelegates} Present for Quorum`}
                  action={
                    <button
                      onClick={markAllPresent}
                      className="btn-secondary text-xs"
                    >
                      Mark All Present
                    </button>
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                  {delegates
                    .filter((d) => d.role === "delegate")
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => toggleAttendance(d)}
                        disabled={attendanceMarking === d.id}
                        className="flex items-center justify-between p-3 rounded-xl border text-left transition-all active:scale-[0.98]"
                        style={{
                          background: d.is_present
                            ? "rgba(48,209,88,0.1)"
                            : "var(--color-bg-elevated)",
                          borderColor: d.is_present
                            ? "rgba(48,209,88,0.3)"
                            : "var(--color-border-default)",
                          opacity: attendanceMarking === d.id ? 0.5 : 1,
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg flex-shrink-0">
                            {countryFlag(d.country)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-bold truncate ${d.is_present ? "text-green-400" : "text-white"}`}
                            >
                              {d.country}
                            </p>
                            <p className="text-[10px] text-white/40 truncate">
                              {d.display_name}
                            </p>
                          </div>
                        </div>
                        {d.is_present && (
                          <CheckCircle2
                            size={16}
                            className="text-green-500 flex-shrink-0"
                          />
                        )}
                      </button>
                    ))}
                </div>
              </GlassPanel>
            </div>
          )}

          {/* ═══ QUEUE MODERATION ═══ */}
          {activeTab === "speakers" && (
            <div className="max-w-3xl space-y-4 animate-fade-in">
              <GlassPanel>
                <SectionHeader
                  title="Speaker Queue Management"
                  subtitle={`${channel.queue.length} in queue. Click 'X' to remove skip.`}
                  action={
                    <div className="flex gap-2">
                      <button
                        onClick={channel.resetQueue}
                        className="btn-danger text-xs px-3"
                      >
                        <Trash2 size={14} className="mr-1" /> Clear All
                      </button>
                    </div>
                  }
                />

                {channel.queue.length > 0 ? (
                  <Reorder.Group 
                    axis="y" 
                    values={channel.queue} 
                    onReorder={channel.reorder}
                    className="space-y-2 mt-4"
                  >
                    {channel.queue.map((entry, i) => (
                      <Reorder.Item
                        key={entry.delegate_id}
                        value={entry}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5 relative group cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex flex-col items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity">
                          <GripVertical size={16} />
                        </div>
                        <span className="text-xs font-mono text-white/30 w-4">
                          {i + 1}
                        </span>
                        <span className="text-xl">
                          {countryFlag(entry.country)}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-bold flex items-center gap-2">
                            {entry.country}
                            {entry.type && entry.type !== "floor" && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-widest ${
                                entry.type === "order" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                entry.type === "privilege" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                                "bg-green-500/20 text-green-400 border border-green-500/30"
                              }`}>
                                Point of {entry.type}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-white/50">
                            {entry.display_name}
                          </p>
                        </div>
                        <button
                          onClick={() => channel.remove(entry.delegate_id)}
                          className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                ) : (
                  <EmptyState
                    icon={Mic}
                    message="Queue is empty. Delegates can request floor from their devices."
                  />
                )}
              </GlassPanel>
            </div>
          )}

          {/* ═══ MESSAGING (CHAT HUB) ═══ */}
          {activeTab === "chits" && (
            <div className="h-[calc(100vh-280px)] min-h-[500px] animate-fade-in">
              <ChatHub
                committeeId={committee.id}
                sessionId={session?.id || ""}
                delegateId={delegate.id}
                delegateRole={delegate.role}
                accentColor={themeColor}
                delegates={delegates}
              />
            </div>
          )}

          {/* ═══ DOC REVIEW ═══ */}
          {activeTab === "docs" && (
            <div className="max-w-4xl space-y-4 animate-fade-in">
              <GlassPanel>
                <SectionHeader title="Pending Documents" />
                <div className="space-y-3 mt-4">
                  {documents
                    .filter((d) => d.status === "pending")
                    .map((d, i) => (
                      <motion.div
                        key={d.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="p-4 rounded-xl border border-white/10 bg-white/5"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-bold text-lg">{d.title}</h3>
                            <p className="text-xs text-sapphire-400">
                              {d.type.replace(/_/g, " ").toUpperCase()}
                            </p>
                          </div>
                          <span className="text-xs text-white/40">
                            {new Date(d.uploaded_at).toLocaleTimeString()}
                          </span>
                        </div>
                        {d.content && (
                          <p className="text-sm bg-black/40 p-3 rounded-lg mt-2 mb-4 border border-white/5">
                            {d.content}
                          </p>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => reviewDoc(d.id, "rejected")}
                            className="btn-danger text-xs px-4"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => reviewDoc(d.id, "approved")}
                            className="btn-success text-xs px-4"
                          >
                            Publish to Committee
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  {documents.filter((d) => d.status === "pending").length ===
                    0 && (
                    <EmptyState
                      icon={FileText}
                      message="No documents pending review"
                    />
                  )}
                </div>
              </GlassPanel>
            </div>
          )}

          {/* ═══ VOTING ═══ */}
          {activeTab === "voting" && (
            <div className="max-w-2xl space-y-4 animate-fade-in">
              {activeRound ? (
                <GlassPanel>
                  <SectionHeader
                    title="Live Voting Control"
                    subtitle={`Resolution: ${activeRound.resolution_title}`}
                  />
                  <div className="grid grid-cols-3 gap-4 text-center py-6 border-b border-white/5 mb-4">
                    <div className="p-4 rounded-xl bg-green-500/10">
                      <p className="text-3xl font-bold text-green-400">
                        {voteTally.for}
                      </p>
                      <p className="text-xs text-white/50">For</p>
                    </div>
                    <div className="p-4 rounded-xl bg-red-500/10">
                      <p className="text-3xl font-bold text-red-400">
                        {voteTally.against}
                      </p>
                      <p className="text-xs text-white/50">Against</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5">
                      <p className="text-3xl font-bold text-white/60">
                        {voteTally.abstain}
                      </p>
                      <p className="text-xs text-white/50">Abstain</p>
                    </div>
                  </div>
                  <p className="text-xs text-center text-white/40 mb-6">
                    {voteTally.for + voteTally.against + voteTally.abstain} out
                    of {presentCount} present delegates voted
                  </p>
                  <button
                    onClick={closeVotingRound}
                    disabled={votingClosing}
                    className="w-full btn-danger py-4 font-bold tracking-widest uppercase"
                  >
                    {votingClosing ? "Closing…" : "Close Voting & Tally"}
                  </button>
                </GlassPanel>
              ) : (
                <GlassPanel>
                  <SectionHeader
                    title="Start Voting Procedure"
                    subtitle="Will lock UI for delegates until voting closes"
                  />
                  <div className="space-y-4 mt-4">
                    <input
                      type="text"
                      value={resolutionTitle}
                      onChange={(e) => setResolutionTitle(e.target.value)}
                      placeholder="e.g. Draft Resolution 1.1"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500/50 outline-none"
                    />
                    <button
                      onClick={startVotingRound}
                      disabled={!resolutionTitle.trim()}
                      className="w-full btn-success py-3 font-bold tracking-wide"
                    >
                      Initialize Voting Round
                    </button>
                  </div>
                </GlassPanel>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-80 rounded-2xl p-6 shadow-2xl border bg-[#13132A] border-white/10 relative"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <button
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 text-white/40 hover:text-white"
              >
                <X size={16} />
              </button>
              <h3
                className="text-sm font-bold tracking-widest uppercase mb-6"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                EB Controls
              </h3>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    const content = window.prompt("Enter global announcement:");
                    if (content) channel.broadcastAnnouncement(content);
                  }}
                  className="w-full btn-secondary text-sm"
                >
                  Send Screen Alert
                </button>

                <div className="my-4 border-t border-white/10" />

                <button
                  className="w-full btn-danger text-sm"
                  onClick={() => (window.location.href = "/login")}
                >
                  Logout EB Session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Announcements */}
      {channel.latestAnnouncement && (
        <AnnouncementOverlay
          content={channel.latestAnnouncement.content}
          onDismiss={() => {}}
        />
      )}
    </main>
  );
}

function ChitContentDecrypted({
  content,
  sessionId,
}: {
  content: string;
  sessionId: string;
}) {
  const [decrypted, setDecrypted] = useState<string>("");

  // FIXED: using useEffect instead of useState for decryption async side-effect
  useEffect(() => {
    decryptChit(content, sessionId).then(setDecrypted);
  }, [content, sessionId]);

  return <span>{decrypted || content}</span>;
}
