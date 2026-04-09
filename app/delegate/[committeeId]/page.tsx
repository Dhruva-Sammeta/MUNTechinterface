"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Hand,
  AlertTriangle,
  X,
  ChevronRight,
  Clock,
  Inbox,
  PlusCircle,
  LogOut,
  Upload,
  Check,
  Loader2,
  WifiOff,
  Wifi,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { ChatHub } from "@/components/chat/ChatHub";
import type {
  Delegate,
  SessionMode,
  VotePosition,
  DocumentType,
  SpeakerQueueEntry,
  SpeakerRequestType,
} from "@/lib/database.types";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import { countryFlag } from "@/lib/countryFlag";

type Tab = "dashboard" | "speakers" | "chits" | "docs" | "voting" | "blocs";

export default function DelegatePage() {
  const params = useParams();
  const committeeId = params.committeeId as string;
  const supabase = createClient();

  // ── Data ────────────────────────────────────────────────────────────────
  const data = useConferenceData(committeeId);
  const { session: liveSession, changeMode } = useSession(
    data.session?.id || null,
  );
  const timer = useTimer(liveSession);

  // Speaker queue — delegate role (read-only, can request floor)
  const channel = useCommitteeChannel(
    committeeId,
    data.delegate?.role === "eb" || data.delegate?.role === "admin"
      ? "eb"
      : "delegate",
    data.delegate?.id || null,
  );

  // ── Local state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [showSettings, setShowSettings] = useState(false);
  const [chitTo, setChitTo] = useState("");
  const [chitContent, setChitContent] = useState("");
  const [chitSending, setChitSending] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<DocumentType>("working_paper");
  const [docContent, setDocContent] = useState("");
  const [blocName, setBlocName] = useState("");
  const [voteCasting, setVoteCasting] = useState(false);
  const [floorRequested, setFloorRequested] = useState(false);

  const {
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
  } = data;
  const mode = (liveSession?.mode || session?.mode || "normal") as SessionMode;

  // ── Theme ───────────────────────────────────────────────────────────────
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

  // ── Actions ─────────────────────────────────────────────────────────────

  async function sendChit() {
    if (!chitTo || !chitContent.trim() || !session?.id || !delegate?.id) return;
    setChitSending(true);
    const encrypted = await encryptChit(chitContent.trim(), session.id);
    const { error } = await supabase.from("chits").insert({
      session_id: session.id,
      from_delegate_id: delegate.id,
      to_delegate_id: chitTo,
      content: encrypted,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Chit sent — pending EB review");
      setChitContent("");
      setChitTo("");
    }
    setChitSending(false);
  }

  async function castVote(position: VotePosition) {
    if (!activeRound || !session?.id || !delegate?.id || myVote) return;
    setVoteCasting(true);
    const { error } = await supabase.from("votes").insert({
      voting_round_id: activeRound.id,
      session_id: session.id,
      delegate_id: delegate.id,
      position,
    });
    if (error) toast.error(error.message);
    else toast.success(`Voted: ${position}`);
    setVoteCasting(false);
  }

  async function submitDocument() {
    if (!docTitle.trim() || !session?.id || !delegate?.id) return;
    const { error } = await supabase.from("documents").insert({
      session_id: session.id,
      committee_id: committeeId,
      title: docTitle.trim(),
      type: docType,
      content: docContent.trim() || null,
      uploaded_by: delegate.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Document submitted — pending review");
      setDocTitle("");
      setDocContent("");
    }
  }

  async function createBloc() {
    if (!blocName.trim() || !session?.id || !delegate?.id) return;
    const { data: bloc, error } = await supabase
      .from("blocs")
      .insert({
        session_id: session.id,
        name: blocName.trim(),
        created_by: delegate.id,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (bloc) {
      await supabase
        .from("bloc_members")
        .insert({ bloc_id: bloc.id, delegate_id: delegate.id });
      toast.success("Bloc created");
      setBlocName("");
    }
  }

  async function joinBloc(blocId: string) {
    if (!delegate?.id) return;
    const { error } = await supabase
      .from("bloc_members")
      .insert({ bloc_id: blocId, delegate_id: delegate.id });
    if (error) toast.error(error.message);
    else toast.success("Joined bloc");
  }

  function requestFloor(type: SpeakerRequestType = "floor") {
    if (!delegate) return;
    if (type === "floor" && floorRequested) return;

    // De-duplicate: check if already in queue
    if (type === "floor") {
      const alreadyInQueue = channel.queue.some(
        (e) => e.delegate_id === delegate.id && e.type === "floor",
      );
      const isCurrentSpeaker = channel.current?.delegate_id === delegate.id;
      if (alreadyInQueue || isCurrentSpeaker) {
        toast.error("You are already in the queue");
        return;
      }
    }

    // Broadcast floor request — EB/admin channel will auto-add to queue
    channel.requestFloor({
      delegate_id: delegate.id,
      display_name: delegate.display_name,
      country: delegate.country,
      added_at: Date.now(),
      type,
    });
    
    if (type === "floor") {
      setFloorRequested(true);
      toast.success("Floor requested — waiting for EB");
      // Reset after 10s to allow re-requesting
      setTimeout(() => setFloorRequested(false), 10000);
    } else {
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} Point raised`);
    }
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

  // ── Sidebar tabs ────────────────────────────────────────────────────────
  const tabs: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    { id: "speakers", label: "Speakers", icon: <Mic size={18} /> },
    {
      id: "chits",
      label: "Messages",
      icon: <MessageSquare size={18} />,
      badge: chits.filter(
        (c) => c.to_delegate_id === delegate.id && c.is_approved === null,
      ).length,
    },
    { id: "docs", label: "Docs", icon: <FileText size={18} /> },
    { id: "voting", label: "Voting", icon: <Vote size={18} /> },
    { id: "blocs", label: "Blocs", icon: <Users size={18} /> },
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
        {/* Logo */}
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
            SAPPHIRE MUN
          </span>
        </div>

        {/* Delegate info */}
        <div
          className="px-4 py-3 border-b sidebar-expanded"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <p
            className="text-[10px] uppercase tracking-widest sidebar-label"
            style={{ color: "var(--color-text-muted)" }}
          >
            {committee.short_name} DELEGATE
          </p>
          <p className="text-sm font-semibold mt-0.5 flex items-center gap-2 sidebar-label">
            <span>{countryFlag(delegate.country)}</span>
            {delegate.display_name}
          </p>
          <p
            className="text-[11px] mt-0.5 sidebar-label"
            style={{ color: "var(--color-text-muted)" }}
          >
            {delegate.country}
          </p>
        </div>

        {/* Nav */}
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
                  style={{ background: themeColor, color: "#fff" }}
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

        {/* Bottom */}
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
            <span className="sidebar-label">Settings</span>
          </button>
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
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-6 py-3 border-b app-header"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-secondary)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile logo */}
            <img
              src="/logo.png"
              alt=""
              className="w-6 h-6 object-contain md:hidden flex-shrink-0"
            />
            <h1
              className="text-base md:text-lg font-bold truncate"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {committee.short_name}
            </h1>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
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
            <div
              className="hidden sm:flex items-center gap-1 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: delegate.is_present
                    ? "var(--color-mode-voting)"
                    : "var(--color-mode-crisis)",
                }}
              />
              {delegate.is_present ? "Present" : "Absent"}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 app-content-area">
          {/* ═══ DASHBOARD ═══ */}
          {activeTab === "dashboard" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl animate-fade-in">
              {/* Session info */}
              <GlassPanel className="lg:col-span-2">
                <SectionHeader
                  title="Current Session"
                  subtitle={liveSession?.agenda_text || "No agenda set"}
                />
                <div className="flex items-center justify-center py-6">
                  <TimerDisplay session={liveSession} size="lg" />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div
                    className="text-center p-3 rounded-xl"
                    style={{ background: "var(--color-bg-elevated)" }}
                  >
                    <p
                      className="text-xl font-bold"
                      style={{
                        fontFamily: "var(--font-heading)",
                        color: themeColor,
                      }}
                    >
                      {presentCount}/{totalDelegates}
                    </p>
                    <p
                      className="text-[10px] uppercase tracking-wider mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Quorum
                    </p>
                  </div>
                  <div
                    className="text-center p-3 rounded-xl"
                    style={{ background: "var(--color-bg-elevated)" }}
                  >
                    <p
                      className="text-xl font-bold"
                      style={{
                        fontFamily: "var(--font-heading)",
                        color: themeColor,
                      }}
                    >
                      {channel.queue.length}
                    </p>
                    <p
                      className="text-[10px] uppercase tracking-wider mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Speakers
                    </p>
                  </div>
                  <div
                    className="text-center p-3 rounded-xl"
                    style={{ background: "var(--color-bg-elevated)" }}
                  >
                    <p
                      className="text-xl font-bold"
                      style={{
                        fontFamily: "var(--font-heading)",
                        color: themeColor,
                      }}
                    >
                      {documents.filter((d) => d.status === "approved").length}
                    </p>
                    <p
                      className="text-[10px] uppercase tracking-wider mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Documents
                    </p>
                  </div>
                </div>
              </GlassPanel>

              {/* Current speaker */}
              <GlassPanel>
                <SectionHeader title="On the Floor" />
                {channel.current ? (
                  <div className="text-center py-4">
                    <p className="text-3xl mb-2">
                      {countryFlag(channel.current.country)}
                    </p>
                    <p className="text-sm font-bold">
                      {channel.current.display_name}
                    </p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {channel.current.country}
                    </p>
                    <Mic
                      size={16}
                      className="mx-auto mt-3 animate-pulse"
                      style={{ color: themeColor }}
                    />
                  </div>
                ) : (
                  <EmptyState icon={Mic} message="No one is speaking" />
                )}

                {activeRound && (
                  <div
                    className="mt-4 p-3 rounded-xl"
                    style={{
                      background: "rgba(48,209,88,0.1)",
                      border: "1px solid rgba(48,209,88,0.2)",
                    }}
                  >
                    <p className="text-xs font-bold text-green-400 mb-1">
                      VOTING IN PROGRESS
                    </p>
                    <p className="text-sm">{activeRound.resolution_title}</p>
                  </div>
                )}
              </GlassPanel>
            </div>
          )}

          {/* ═══ SPEAKERS LIST ═══ */}
          {activeTab === "speakers" && (
            <div className="max-w-2xl space-y-4 animate-fade-in">
              {/* Request Floor button (always visible, critical for mobile) */}
              <button
                onClick={() => requestFloor("floor")}
                disabled={floorRequested}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: `${themeColor}20`,
                  color: themeColor,
                  border: `1px solid ${themeColor}30`,
                }}
              >
                <Hand size={16} />
                {floorRequested ? "Floor Requested…" : "Raise Hand (Request Floor)"}
              </button>

              <GlassPanel>
                <SectionHeader title="Current Speaker" />
                {channel.current ? (
                  <div
                    className="flex items-center gap-4 p-4 rounded-xl animate-speaking-glow"
                    style={
                      {
                        background: `${themeColor}10`,
                        border: `1px solid ${themeColor}30`,
                        "--glow-color": `${themeColor}40`,
                      } as React.CSSProperties
                    }
                  >
                    <span className="text-3xl">
                      {countryFlag(channel.current.country)}
                    </span>
                    <div>
                      <p className="font-bold">
                        {channel.current.display_name}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {channel.current.country}
                      </p>
                    </div>
                    <div className="ml-auto">
                      <Mic
                        size={20}
                        className="animate-pulse"
                        style={{ color: themeColor }}
                      />
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={Mic}
                    message="No one is currently speaking"
                  />
                )}
              </GlassPanel>
              <GlassPanel>
                <SectionHeader
                  title="Queue"
                  subtitle={`${channel.queue.length} speakers waiting`}
                />
                {channel.queue.length > 0 ? (
                  <div className="space-y-2">
                    {channel.queue.map((entry, i) => (
                      <motion.div
                        key={entry.delegate_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 py-2 px-3 rounded-xl"
                        style={{ background: "var(--color-bg-elevated)" }}
                      >
                        <span
                          className="text-xs font-mono w-6 text-center"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-lg">
                          {countryFlag(entry.country)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.display_name}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {entry.country}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Users} message="Queue is empty" />
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
                blocId={blocs.find(b => b.members.some(m => m.delegate.id === delegate.id))?.id || null}
                accentColor={themeColor}
                delegates={delegates}
              />
            </div>
          )}

          {/* ═══ DOCUMENTS ═══ */}
          {activeTab === "docs" && (
            <div className="max-w-2xl space-y-4 animate-fade-in">
              {/* Submit document */}
              <GlassPanel>
                <SectionHeader
                  title="Submit Document"
                  subtitle="Will be reviewed by EB before publishing"
                />
                <div className="space-y-3">
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Document title"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <option value="working_paper">Working Paper</option>
                    <option value="draft_resolution">Draft Resolution</option>
                    <option value="amendment">Amendment</option>
                    <option value="press_release">Press Release</option>
                  </select>
                  <textarea
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="Document content (optional — you can also upload a file via EB)"
                    rows={4}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none transition-all"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <button
                    onClick={submitDocument}
                    disabled={!docTitle.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 active:scale-[0.97]"
                    style={{ background: themeColor, color: "#fff" }}
                  >
                    <Upload size={14} /> Submit
                  </button>
                </div>
              </GlassPanel>

              {/* Document library */}
              <GlassPanel>
                <SectionHeader
                  title="Reference Library"
                  subtitle={`${documents.filter((d) => d.status === "approved").length} approved`}
                />
                {documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 rounded-xl flex items-start gap-3"
                        style={{ background: "var(--color-bg-elevated)" }}
                      >
                        <FileText
                          size={16}
                          style={{
                            color: themeColor,
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p
                            className="text-[11px] mt-0.5"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {doc.type.replace(/_/g, " ")} ·{" "}
                            {new Date(doc.uploaded_at).toLocaleTimeString()}
                          </p>
                          {doc.content && (
                            <p
                              className="text-xs mt-1 line-clamp-2"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              {doc.content}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            background:
                              doc.status === "approved"
                                ? "rgba(48,209,88,0.15)"
                                : doc.status === "rejected"
                                  ? "rgba(255,59,48,0.15)"
                                  : "rgba(255,204,0,0.15)",
                            color:
                              doc.status === "approved"
                                ? "#30D158"
                                : doc.status === "rejected"
                                  ? "#FF3B30"
                                  : "#FFCC00",
                          }}
                        >
                          {doc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={FileText} message="No documents yet" />
                )}
              </GlassPanel>
            </div>
          )}

          {/* ═══ VOTING ═══ */}
          {activeTab === "voting" && (
            <div className="max-w-2xl space-y-4 animate-fade-in">
              {activeRound ? (
                <GlassPanel>
                  <SectionHeader
                    title={activeRound.resolution_title}
                    subtitle="Voting in progress"
                  />
                  {/* Tally */}
                  <div className="grid grid-cols-3 gap-3 md:gap-4 text-center py-6">
                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(48,209,88,0.1)" }}
                    >
                      <p
                        className="text-2xl md:text-3xl font-bold"
                        style={{
                          color: "#30D158",
                          fontFamily: "var(--font-heading)",
                        }}
                      >
                        {voteTally.for}
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        For
                      </p>
                    </div>
                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(255,59,48,0.1)" }}
                    >
                      <p
                        className="text-2xl md:text-3xl font-bold"
                        style={{
                          color: "#FF3B30",
                          fontFamily: "var(--font-heading)",
                        }}
                      >
                        {voteTally.against}
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Against
                      </p>
                    </div>
                    <div
                      className="p-4 rounded-xl"
                      style={{ background: "rgba(142,142,147,0.1)" }}
                    >
                      <p
                        className="text-2xl md:text-3xl font-bold"
                        style={{
                          color: "#8E8E93",
                          fontFamily: "var(--font-heading)",
                        }}
                      >
                        {voteTally.abstain}
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Abstain
                      </p>
                    </div>
                  </div>
                  {/* Cast vote */}
                  {myVote ? (
                    <div
                      className="text-center py-3 rounded-xl"
                      style={{ background: "var(--color-bg-elevated)" }}
                    >
                      <Check
                        size={20}
                        className="mx-auto mb-1"
                        style={{ color: "#30D158" }}
                      />
                      <p className="text-sm font-medium">
                        You voted:{" "}
                        <strong
                          style={{
                            color:
                              myVote.position === "for"
                                ? "#30D158"
                                : myVote.position === "against"
                                  ? "#FF3B30"
                                  : "#8E8E93",
                          }}
                        >
                          {myVote.position}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-3 justify-center">
                      {(["for", "against", "abstain"] as VotePosition[]).map(
                        (pos) => (
                          <button
                            key={pos}
                            onClick={() => castVote(pos)}
                            disabled={voteCasting}
                            className="px-5 md:px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                            style={{
                              background:
                                pos === "for"
                                  ? "rgba(48,209,88,0.2)"
                                  : pos === "against"
                                    ? "rgba(255,59,48,0.2)"
                                    : "rgba(142,142,147,0.2)",
                              color:
                                pos === "for"
                                  ? "#30D158"
                                  : pos === "against"
                                    ? "#FF3B30"
                                    : "#8E8E93",
                              border: `1px solid ${pos === "for" ? "rgba(48,209,88,0.3)" : pos === "against" ? "rgba(255,59,48,0.3)" : "rgba(142,142,147,0.3)"}`,
                            }}
                          >
                            {pos.charAt(0).toUpperCase() + pos.slice(1)}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </GlassPanel>
              ) : (
                <GlassPanel>
                  <EmptyState icon={Vote} message="No active voting round" />
                </GlassPanel>
              )}
            </div>
          )}

          {/* ═══ BLOCS ═══ */}
          {activeTab === "blocs" && (
            <div className="max-w-2xl space-y-4 animate-fade-in">
              <GlassPanel>
                <SectionHeader title="Create Bloc" />
                <div className="flex gap-2">
                  <input
                    value={blocName}
                    onChange={(e) => setBlocName(e.target.value)}
                    placeholder="Bloc name…"
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border-default)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <button
                    onClick={createBloc}
                    disabled={!blocName.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 active:scale-[0.97]"
                    style={{ background: themeColor, color: "#fff" }}
                  >
                    Create
                  </button>
                </div>
              </GlassPanel>

              {blocs.map((bloc) => (
                <GlassPanel key={bloc.id}>
                  <SectionHeader
                    title={bloc.name}
                    subtitle={`${bloc.members?.length || 0} members`}
                    action={
                      !bloc.members?.some(
                        (m) => m.delegate_id === delegate.id,
                      ) ? (
                        <button
                          onClick={() => joinBloc(bloc.id)}
                          className="text-xs px-3 py-1 rounded-xl font-semibold active:scale-[0.97]"
                          style={{
                            background: `${themeColor}20`,
                            color: themeColor,
                          }}
                        >
                          Join
                        </button>
                      ) : (
                        <span className="text-[10px] text-green-400 font-semibold">
                          Joined
                        </span>
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    {bloc.members?.map((m) => (
                      <span
                        key={m.id}
                        className="text-xs px-2 py-1 rounded-full"
                        style={{
                          background: "var(--color-bg-elevated)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {countryFlag(m.delegate?.country || "")}{" "}
                        {m.delegate?.display_name}
                      </span>
                    ))}
                  </div>
                </GlassPanel>
              ))}

              {blocs.length === 0 && (
                <GlassPanel>
                  <EmptyState
                    icon={Users}
                    message="No blocs formed yet — create one above"
                  />
                </GlassPanel>
              )}
            </div>
          )}
        </main>

        {/* ── Bottom bar (desktop only) ────────────────────────────────────── */}
        <footer
          className="flex items-center justify-between px-4 md:px-6 py-3 border-t app-footer-bar"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-secondary)",
          }}
        >
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 max-w-full">
            <button
              onClick={() => requestFloor("floor")}
              disabled={floorRequested}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
              style={{
                background: `${themeColor}20`,
                color: themeColor,
                border: `1px solid ${themeColor}30`,
              }}
            >
              <Hand size={14} />{" "}
              {floorRequested ? "Requested…" : "Raise Hand"}
            </button>
            <button
              onClick={() => requestFloor("order")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
              style={{
                background: "rgba(255,59,48,0.1)",
                color: "#ff8c82",
                border: "1px solid rgba(255,59,48,0.2)",
              }}
            >
              <AlertTriangle size={14} /> Point of Order
            </button>
            <button
              onClick={() => requestFloor("privilege")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
              style={{
                background: "rgba(255,184,0,0.1)",
                color: "#ffc83d",
                border: "1px solid rgba(255,184,0,0.2)",
              }}
            >
              <AlertCircle size={14} /> Point of Privilege
            </button>
            <button
              onClick={() => requestFloor("inquiry")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
              style={{
                background: "rgba(48,209,88,0.1)",
                color: "#6ce48e",
                border: "1px solid rgba(48,209,88,0.2)",
              }}
            >
              <HelpCircle size={14} /> Parliamentary Inquiry
            </button>
          </div>
          <div
            className="text-right hidden sm:block text-[9px] uppercase tracking-[0.2em] opacity-20"
            style={{ color: "var(--color-text-muted)" }}
          >
            {presentCount}/{totalDelegates} present · SAPPHIRE MUN
          </div>
        </footer>
      </div>

      {/* ── Settings / Escalation Modal ────────────────────────────────────── */}
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
              className="w-80 rounded-2xl p-6 shadow-2xl border flex flex-col items-center relative"
              style={{
                background: "var(--color-bg-elevated)",
                borderColor: "var(--color-border-hover)",
              }}
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
                className="text-sm font-bold tracking-widest uppercase mb-4 text-cyan-200"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Access Control
              </h3>
              <p className="text-xs text-center text-cyan-100/50 mb-4">
                Enter an authorized passcode to change your role (e.g. EB,
                Admin, or Screen).
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const code = (e.target as any).passcode.value.toUpperCase();
                  let newRole = "";
                  let dest = "";

                  if (code === "12345") {
                    newRole = "admin";
                    dest = "/admin";
                  } else if (code.startsWith("EB")) {
                    newRole = "eb";
                    dest = `/eb/${committeeId}`;
                  } else if (code.startsWith("PR")) {
                    newRole = "presentation";
                    dest = `/presentation/${committeeId}`;
                  } else return alert("Invalid escalation code.");

                  const sb = createClient();
                  await sb
                    .from("delegates")
                    .update({ role: newRole })
                    .eq("user_id", (await sb.auth.getUser()).data.user?.id);
                  window.location.href = dest;
                }}
                className="w-full space-y-3"
              >
                <input
                  name="passcode"
                  type="text"
                  placeholder="Passcode..."
                  autoFocus
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-center font-mono tracking-widest text-sm outline-none focus:border-cyan-500/50 focus:shadow-[0_0_0_3px_rgba(15,200,255,0.1)] transition-all"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all bg-white/5 hover:bg-white/10 active:scale-[0.97]"
                  style={{ color: themeColor }}
                >
                  Switch Role
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Announcement overlay ─────────────────────────────────────────── */}
      {channel.latestAnnouncement && (
        <AnnouncementOverlay
          content={channel.latestAnnouncement.content}
          onDismiss={() => {}}
        />
      )}
    </div>
  );
}

// ── Chit content decryptor component ──────────────────────────────────────
function ChitContent({
  content,
  sessionId,
}: {
  content: string;
  sessionId: string;
}) {
  const [decrypted, setDecrypted] = useState<string>("");

  // FIXED: was using useState as useEffect — now properly uses useEffect
  useEffect(() => {
    decryptChit(content, sessionId).then(setDecrypted);
  }, [content, sessionId]);

  return <p className="text-sm">{decrypted || content}</p>;
}
