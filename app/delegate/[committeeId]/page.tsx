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
import { useSessionCloseOnTabExit } from "@/hooks/useSessionCloseOnTabExit";
import {
  AlertTriangle,
  FileText,
  Hand,
  ListOrdered,
  Menu,
  MessageCircle,
  Radio,
  Scale,
  Vote,
} from "lucide-react";
import { toast } from "sonner";

interface DelegatePageProps {
  params: Promise<{
    committeeId: string;
  }>;
}

type DelegateView = "dashboard" | "voting" | "chat";
type VotingChoice = "for" | "against" | "abstain";

export default function DelegateCommitteePage({ params }: DelegatePageProps) {
  const { committeeId } = use(params);
  const conference = useConferenceData(committeeId);
  const delegate = conference.delegate;
  const session = conference.session;

  useSessionCloseOnTabExit(Boolean(delegate?.id));

  const channel = useCommitteeChannel(committeeId, "delegate", delegate?.id || null);

  const [activeView, setActiveView] = useState<DelegateView>("dashboard");
  const [voteChoice, setVoteChoice] = useState<VotingChoice | null>(null);

  useEffect(() => {
    if (!session?.id || !delegate?.id) return;
    const key = `vote:${session.id}:${delegate.id}`;
    const saved = window.localStorage.getItem(key) as VotingChoice | null;
    setVoteChoice(saved || null);
  }, [delegate?.id, session?.id]);

  const queuePosition = useMemo(() => {
    if (!delegate?.id) return -1;
    return channel.queue.findIndex((entry) => entry.delegate_id === delegate.id);
  }, [channel.queue, delegate?.id]);

  const isCurrentSpeaker = delegate?.id && channel.current?.delegate_id === delegate.id;
  const hasRequestedFloor = isCurrentSpeaker || queuePosition >= 0;

  const topTabs = [
    { id: "dashboard", label: "Dashboard", icon: <Radio size={14} /> },
    { id: "voting", label: "Voting", icon: <Vote size={14} /> },
    { id: "chat", label: "Messages", icon: <MessageCircle size={14} /> },
  ];

  const mobileTabs = [
    { id: "dashboard", label: "Dash", icon: <Radio size={15} /> },
    { id: "voting", label: "Vote", icon: <Vote size={15} /> },
    { id: "chat", label: "Chat", icon: <MessageCircle size={15} /> },
  ];

  const sideMenu = [
    { id: "rollcall", label: "Roll Call", view: "dashboard", icon: <Radio size={14} /> },
    { id: "speakers", label: "Speakers List", view: "dashboard", icon: <ListOrdered size={14} /> },
    { id: "moderated", label: "Moderated", view: "dashboard", icon: <Menu size={14} /> },
    { id: "unmoderated", label: "Unmoderated", view: "dashboard", icon: <Hand size={14} /> },
    { id: "voting", label: "Voting", view: "voting", icon: <Vote size={14} /> },
    { id: "messages", label: "Messages", view: "chat", icon: <MessageCircle size={14} /> },
  ];

  const requestFloor = () => {
    if (!delegate) return;
    if (hasRequestedFloor) {
      toast.info("You are already speaking or queued.");
      return;
    }

    channel.requestFloor({
      delegate_id: delegate.id,
      display_name: delegate.display_name,
      country: delegate.country,
      added_at: Date.now(),
      type: "floor",
    });
    toast.success("Floor request sent to the EB.");
  };

  const castVote = (choice: VotingChoice) => {
    if (!session?.id || !delegate?.id) return;
    const key = `vote:${session.id}:${delegate.id}`;
    window.localStorage.setItem(key, choice);
    setVoteChoice(choice);
    toast.success(`Marked your vote as ${choice.toUpperCase()}.`);
  };

  if (conference.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white">
        <div className="text-center text-white/80">Loading delegate data...</div>
      </div>
    );
  }

  return (
    <div
      data-mode={session?.mode || "normal"}
      className="min-h-screen bg-[radial-gradient(circle_at_top,#122148_0%,#060b1f_45%,#050510_100%)] text-white pb-20 md:pb-6"
    >
      <div className="mx-auto max-w-[1380px] px-3 md:px-6 py-4 md:py-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          <aside className="hidden lg:block">
            <GlassPanel className="p-3 h-full">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/50 mb-3">Command Center</p>
              <div className="space-y-2">
                {sideMenu.map((item) => {
                  const isActive =
                    (item.view === "dashboard" && activeView === "dashboard") ||
                    (item.view === "voting" && activeView === "voting") ||
                    (item.view === "chat" && activeView === "chat");
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveView(item.view as DelegateView)}
                      className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                        isActive
                          ? "bg-sapphire-500/25 border border-sapphire-300/35 text-white"
                          : "bg-white/0 border border-transparent text-white/65 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </GlassPanel>
          </aside>

          <div className="space-y-4">
            <GlassPanel className="p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">Delegate Workspace</p>
                  <h1 className="text-2xl md:text-4xl font-bold leading-tight">
                    {delegate?.display_name || "Delegate"}
                  </h1>
                  <p className="text-xs md:text-sm text-white/65 mt-1">
                    {conference.committee?.name || "Committee"} • {conference.committee?.short_name || committeeId}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ModeBadge mode={(session?.mode || "normal") as any} />
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10">
                    Sync: {conference.connectionStatus}
                  </span>
                </div>
              </div>
            </GlassPanel>

            {conference.error ? (
              <ErrorBanner message={conference.error} onClose={() => {}} />
            ) : null}

            <div className="hidden md:block lg:hidden">
              <Tabs tabs={topTabs} activeTab={activeView} onChange={(id) => setActiveView(id as DelegateView)} />
            </div>

            {activeView === "dashboard" && (
              <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.9fr] gap-4">
                <GlassPanel className="p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={15} className="text-sapphire-300" />
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">Reference Library</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold">General Session Resources</p>
                      <button className="rounded-lg bg-sapphire-500/25 border border-sapphire-300/30 px-3 py-1.5 text-xs font-semibold">
                        Upload Clause
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-[#121e46]/65 p-3">
                        <p className="text-sm font-semibold">Working Paper 1.2</p>
                        <p className="text-xs text-white/55 mt-1">Pre-seeded package for committee debate.</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#121e46]/65 p-3">
                        <p className="text-sm font-semibold">Rules of Procedure</p>
                        <p className="text-xs text-white/55 mt-1">Official handbook for moderated flow.</p>
                      </div>
                    </div>
                    <button className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70">
                      Add New Resource
                    </button>
                  </div>

                  <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3 flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={requestFloor}
                      disabled={!delegate || hasRequestedFloor}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold bg-sapphire-500/25 border border-sapphire-300/30 disabled:opacity-50"
                    >
                      Request Floor
                    </button>
                    <button className="rounded-full px-3 py-1.5 text-xs font-semibold bg-white/5 border border-white/15">
                      <span className="inline-flex items-center gap-1"><Scale size={12} /> Point of Order</span>
                    </button>
                    <button className="rounded-full px-3 py-1.5 text-xs font-semibold bg-red-500/20 border border-red-400/30">
                      <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> Crisis Alert</span>
                    </button>
                  </div>
                </GlassPanel>

                <div className="space-y-4">
                  <GlassPanel className="p-5">
                    <p className="text-[11px] text-white/45 uppercase tracking-[0.18em] mb-2">Current Session</p>
                    <p className="text-xl font-bold mb-2">{session?.mode === "voting" ? "Voting Session" : "General Debate"}</p>
                    <div className="mb-3">
                      <TimerDisplay session={session} size="sm" />
                    </div>
                    <p className="text-[11px] text-white/45 uppercase tracking-[0.18em] mb-1">Agenda</p>
                    <p className="text-sm text-white/85">{session?.agenda_text || "Agenda pending from EB"}</p>
                    <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                      <p className="text-[11px] text-white/45 uppercase tracking-[0.18em] mb-1">Current Speaker</p>
                      <p className="text-sm font-semibold">{channel.current?.country || "Waiting for next speaker"}</p>
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <ListOrdered size={16} className="text-sapphire-300" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">Speakers Queue</h3>
                    </div>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                      {channel.queue.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-5 text-center text-xs text-white/50">
                          Queue is currently empty.
                        </div>
                      ) : (
                        channel.queue.map((entry, index) => (
                          <div key={`${entry.delegate_id}-${index}`} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{entry.country}</p>
                            </div>
                            <span className="text-xs text-white/60">#{index + 1}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </GlassPanel>
                </div>
              </div>
            )}

            {activeView === "voting" && (
              <GlassPanel className="p-5 md:p-7">
                <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">Voting Center</p>
                    <h2 className="text-xl md:text-2xl font-bold mt-1">Resolution Vote Panel</h2>
                  </div>
                  <ModeBadge mode={(session?.mode || "normal") as any} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:p-6 space-y-4">
                  <p className="text-sm text-white/75">
                    Agenda: <span className="font-semibold text-white">{session?.agenda_text || "No agenda set"}</span>
                  </p>

                  {session?.mode !== "voting" ? (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Voting buttons unlock when EB switches the committee to Voting mode.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(["for", "against", "abstain"] as VotingChoice[]).map((choice) => (
                        <button
                          key={choice}
                          onClick={() => castVote(choice)}
                          className={`rounded-xl py-4 text-base md:text-lg font-bold uppercase transition ${voteChoice === choice ? "ring-2 ring-white/60" : "hover:opacity-90"} ${
                            choice === "for"
                              ? "bg-emerald-500 text-black"
                              : choice === "against"
                                ? "bg-red-500 text-white"
                                : "bg-slate-500 text-white"
                          }`}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                    {voteChoice
                      ? `Your current choice: ${voteChoice.toUpperCase()}`
                      : "No vote selected yet."}
                  </div>
                </div>
              </GlassPanel>
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

        <div className="lg:hidden">
          <div className="hidden md:block">
            <Tabs tabs={topTabs} activeTab={activeView} onChange={(id) => setActiveView(id as DelegateView)} />
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <MobileBottomNav
          tabs={mobileTabs}
          activeTab={activeView}
          onChange={(id) => setActiveView(id as DelegateView)}
        />
      </div>
    </div>
  );
}
