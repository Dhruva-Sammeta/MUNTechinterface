"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ChatHub } from "@/components/chat/ChatHub";
import {
  ErrorBanner,
  GlassPanel,
  MobileBottomNav,
  ModeBadge,
  Tabs,
  TimerDisplay,
} from "@/components/ui/shared";
import { useConferenceData } from "@/hooks/useConferenceData";
import { useCommitteeChannel } from "@/hooks/useCommitteeChannel";
import { useSession } from "@/hooks/useSession";
import { useSessionCloseOnTabExit } from "@/hooks/useSessionCloseOnTabExit";
import type { SessionMode } from "@/lib/database.types";
import {
  AlarmClock,
  Flag,
  ListChecks,
  MessageCircle,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface EbPageProps {
  params: Promise<{
    committeeId: string;
  }>;
}

type EbView = "command" | "queue" | "chat";

export default function EbCommitteePage({ params }: EbPageProps) {
  const { committeeId } = use(params);
  const conference = useConferenceData(committeeId);
  const delegate = conference.delegate;

  useSessionCloseOnTabExit(Boolean(delegate?.id));

  const sessionController = useSession(conference.session?.id || null);
  const session = sessionController.session || conference.session;

  const channel = useCommitteeChannel(
    committeeId,
    "eb",
    delegate?.id || `eb-${committeeId}`,
  );

  const [activeView, setActiveView] = useState<EbView>("command");
  const [agendaDraft, setAgendaDraft] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(2);
  const [queueSearch, setQueueSearch] = useState("");

  useEffect(() => {
    setAgendaDraft(session?.agenda_text || "");
  }, [session?.agenda_text]);

  const isAuthorized = delegate?.role === "eb" || delegate?.role === "admin";

  const delegatesForQueue = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return conference.delegates
      .filter((d) => d.role === "delegate")
      .filter((d) => {
        if (!q) return true;
        return (
          d.display_name.toLowerCase().includes(q) ||
          d.country.toLowerCase().includes(q)
        );
      });
  }, [conference.delegates, queueSearch]);

  const modes: SessionMode[] = ["normal", "voting", "crisis", "break"];

  const changeMode = async (mode: SessionMode) => {
    if (!session?.id) return;
    await sessionController.changeMode(mode);
    toast.success(`Mode changed to ${mode}`);
  };

  const saveAgenda = async () => {
    await sessionController.setAgenda(agendaDraft.trim());
    toast.success("Agenda updated for all screens.");
  };

  const startTimer = async () => {
    const seconds = Math.max(1, Math.floor(timerMinutes * 60));
    await sessionController.startTimer(seconds);
  };

  const mobileTabs = [
    { id: "command", label: "Core", icon: <Flag size={15} /> },
    { id: "queue", label: "Queue", icon: <ListChecks size={15} /> },
    { id: "chat", label: "Chat", icon: <MessageCircle size={15} /> },
  ];

  const topTabs = [
    { id: "command", label: "Command", icon: <Flag size={14} /> },
    { id: "queue", label: "Speakers", icon: <ListChecks size={14} /> },
    { id: "chat", label: "Messages", icon: <MessageCircle size={14} /> },
  ];

  if (conference.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white">
        <div className="text-center text-white/80">Loading EB data…</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#040818] text-white p-6 flex items-center justify-center">
        <GlassPanel className="max-w-lg p-8 text-center">
          <h1 className="text-2xl font-bold">EB Access Required</h1>
          <p className="text-sm text-white/65 mt-2">
            This screen requires EB or Admin role for {conference.committee?.short_name || committeeId}.
          </p>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div
      data-mode={session?.mode || "normal"}
      className="min-h-screen bg-[radial-gradient(circle_at_top,#151e45_0%,#060b1f_45%,#050510_100%)] text-white"
    >
      <header className="fixed top-0 left-0 right-0 z-40 h-16 px-4 md:px-8 bg-slate-900/60 backdrop-blur-xl border-b border-white/10 shadow-[0_20px_40px_rgba(5,10,42,0.4)] flex items-center justify-between">
        <div className="flex items-center gap-5">
          <span className="text-lg md:text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-blue-200 to-blue-500">
            SAPPHIRE MUN
          </span>
          <span className="hidden md:inline text-xs uppercase tracking-[0.2em] text-white/45">EB Command</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10">
            Live: {conference.connectionStatus}
          </span>
          <ModeBadge mode={(session?.mode || "normal") as any} size="lg" />
        </div>
      </header>

      <aside className="hidden lg:flex fixed left-0 top-16 h-[calc(100vh-64px)] w-64 flex-col py-6 bg-slate-950/40 backdrop-blur-2xl border-r border-white/10 z-30">
        <div className="px-6 mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-sapphire-300 font-bold">Master Overwatch</p>
          <p className="mt-1 text-sm font-semibold text-white/75">{conference.committee?.short_name || committeeId}</p>
        </div>
        <div className="px-3 space-y-1">
          {topTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as EbView)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                activeView === tab.id
                  ? "bg-gradient-to-r from-blue-500/20 to-transparent text-blue-300 border-l-4 border-blue-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="relative z-10 lg:pl-64 pt-16 pb-20 md:pb-6">
        <div className="mx-auto max-w-7xl px-3 md:px-6 py-4 md:py-6 space-y-4">
        <GlassPanel className="p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">EB Command Center</p>
              <h1 className="text-2xl md:text-4xl font-bold leading-tight">
                {conference.committee?.name || "Committee Core"}
              </h1>
              <p className="text-xs md:text-sm text-white/65 mt-1">
                Chair: {delegate?.display_name || "EB"} • Live sync: {conference.connectionStatus}
              </p>
            </div>
            <ModeBadge mode={(session?.mode || "normal") as any} size="lg" />
          </div>
        </GlassPanel>

        {conference.error ? <ErrorBanner message={conference.error} /> : null}

        <div className="hidden md:block lg:hidden">
          <Tabs tabs={topTabs} activeTab={activeView} onChange={(id) => setActiveView(id as EbView)} />
        </div>

        {activeView === "command" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <GlassPanel className="xl:col-span-2 p-5 md:p-7 space-y-5">
              <div className="flex flex-wrap gap-2">
                {modes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => changeMode(mode)}
                    className={`px-3 py-2 rounded-xl text-xs md:text-sm font-semibold uppercase tracking-[0.08em] border transition ${session?.mode === mode ? "bg-white text-black border-white" : "bg-black/30 border-white/15 hover:border-white/35"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-5 flex flex-col items-center justify-center gap-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/45">Session Timer</p>
                  <TimerDisplay session={session} size="md" />
                  <div className="flex items-center gap-2 w-full max-w-xs">
                    <input
                      type="number"
                      min={1}
                      value={timerMinutes}
                      onChange={(e) => setTimerMinutes(Number(e.target.value) || 1)}
                      className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm"
                    />
                    <button onClick={startTimer} className="px-3 py-2 rounded-lg bg-sapphire-500 hover:bg-sapphire-400"><Play size={16} /></button>
                    <button onClick={sessionController.pauseTimer} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"><Timer size={16} /></button>
                    <button onClick={sessionController.resumeTimer} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"><SkipForward size={16} /></button>
                    <button onClick={sessionController.resetTimer} className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/35"><RotateCcw size={16} /></button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlarmClock size={15} className="text-sapphire-300" />
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">Universal Agenda</p>
                  </div>
                  <textarea
                    value={agendaDraft}
                    onChange={(e) => setAgendaDraft(e.target.value)}
                    rows={5}
                    placeholder="Set agenda for all delegate + presentation screens"
                    className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm resize-none"
                  />
                  <button onClick={saveAgenda} className="w-full rounded-xl py-2.5 bg-sapphire-500 hover:bg-sapphire-400 font-semibold">
                    Save Agenda
                  </button>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <ListChecks size={16} className="text-sapphire-300" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">Active Speaker</h3>
              </div>
              <div className="rounded-xl border border-sapphire-400/25 bg-sapphire-500/10 px-4 py-3 mb-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-sapphire-200/75">Now speaking</p>
                <p className="text-base font-semibold mt-1">{channel.current?.country || "No active speaker"}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={channel.promoteNext} className="rounded-lg py-2 bg-emerald-500/20 hover:bg-emerald-500/35 text-sm">Promote</button>
                <button onClick={channel.dismissCurrent} className="rounded-lg py-2 bg-red-500/20 hover:bg-red-500/35 text-sm">Dismiss</button>
              </div>
            </GlassPanel>
          </div>
        )}

        {activeView === "queue" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GlassPanel className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">Queue Management</h3>
                <button onClick={channel.resetQueue} className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35 text-xs">Reset Queue</button>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
                {channel.queue.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-5 text-center text-xs text-white/50">
                    Queue is empty. Add delegates or wait for floor requests.
                  </div>
                ) : (
                  channel.queue.map((entry, index) => (
                    <div key={`${entry.delegate_id}-${index}`} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{entry.country}</p>
                        <p className="text-[11px] text-white/45">{entry.display_name}</p>
                      </div>
                      <button onClick={() => channel.remove(entry.delegate_id)} className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35">
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </GlassPanel>

            <GlassPanel className="p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">Add Delegates</h3>
                <input
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  placeholder="Search"
                  className="w-40 rounded-lg border border-white/15 bg-black/35 px-3 py-1.5 text-xs"
                />
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
                {delegatesForQueue.map((d) => (
                  <div key={d.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{d.country}</p>
                      <p className="text-[11px] text-white/45">{d.display_name}</p>
                    </div>
                    <button
                      onClick={() => channel.add({
                        delegate_id: d.id,
                        country: d.country,
                        display_name: d.display_name,
                        added_at: Date.now(),
                        type: "floor",
                      })}
                      className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        )}

        {activeView === "chat" && (
          <GlassPanel className="p-3 md:p-4">
            {session?.id && delegate?.id ? (
              <ChatHub
                committeeId={committeeId}
                sessionId={session.id}
                delegateId={delegate.id}
                delegateRole={delegate.role}
                delegates={conference.delegates}
              />
            ) : (
              <div className="h-[360px] flex items-center justify-center text-sm text-white/55">
                Chat will activate once session and delegate context are ready.
              </div>
            )}
          </GlassPanel>
        )}
      </div>
      </div>

      <div className="md:hidden">
        <MobileBottomNav
          tabs={mobileTabs}
          activeTab={activeView}
          onChange={(id) => setActiveView(id as EbView)}
        />
      </div>
    </div>
  );
}
