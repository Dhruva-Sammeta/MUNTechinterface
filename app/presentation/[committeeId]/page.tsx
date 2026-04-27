"use client";

import { use, useEffect, useState } from "react";
import {
  AnnouncementOverlay,
  ErrorBanner,
  GlassPanel,
  ModeBadge,
  TimerDisplay,
} from "@/components/ui/shared";
import { useCommitteeChannel } from "@/hooks/useCommitteeChannel";
import { useConferenceData } from "@/hooks/useConferenceData";

interface PresentationPageProps {
  params: Promise<{
    committeeId: string;
  }>;
}

export default function PresentationCommitteePage({ params }: PresentationPageProps) {
  const { committeeId } = use(params);
  const conference = useConferenceData(committeeId);

  const session = conference.session;
  const channel = useCommitteeChannel(committeeId, "delegate", `presentation-${committeeId}`);

  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    if (!channel.latestAnnouncement?.content) return;
    setAnnouncement(channel.latestAnnouncement.content);
  }, [channel.latestAnnouncement]);

  if (conference.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white">
        <div className="text-center text-white/80">Loading presentation feed…</div>
      </div>
    );
  }

  return (
    <div
      data-mode={session?.mode || "normal"}
      className="min-h-screen bg-[radial-gradient(circle_at_top,#1b2858_0%,#060b1f_46%,#050510_100%)] text-white"
    >
      {announcement ? (
        <AnnouncementOverlay content={announcement} onDismiss={() => setAnnouncement(null)} />
      ) : null}

      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18)_0%,rgba(11,16,48,0)_68%)]" />

        <div className="relative z-10">
          <div className="mx-auto max-w-[1800px] px-4 md:px-8 pt-5 md:pt-8">
            {conference.error ? <ErrorBanner message={conference.error} /> : null}

            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 opacity-80">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sapphire-300 to-sapphire-600" />
                <span className="text-sm md:text-base font-bold tracking-tight">SAPPHIRE MUN</span>
              </div>
              <div className="flex items-center gap-2">
                <ModeBadge mode={(session?.mode || "normal") as any} size="lg" />
                <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10">
                  Live: {conference.connectionStatus}
                </span>
              </div>
            </div>

            <header className="pt-2 md:pt-4 flex flex-col items-center justify-center text-center">
              <span className="text-sapphire-300 tracking-[0.3em] font-bold text-[11px] md:text-sm uppercase opacity-80 mb-4 block">
                Currently Speaking
              </span>
              <h1 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-sapphire-300 leading-tight">
                {channel.current?.country || "Awaiting Speaker"}
              </h1>
              <p className="text-sm md:text-2xl text-sapphire-200 font-medium mt-2 tracking-wide uppercase opacity-90">
                {conference.committee?.name || "Committee"}
              </p>
            </header>

            <main className="mt-6 md:mt-8 pb-28 md:pb-24">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-center">
                <GlassPanel className="p-4 md:p-10 min-h-[360px] md:min-h-[520px] flex flex-col items-center justify-center">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/45 mb-3">Elapsed Session Timer</p>
                  <div className="scale-95 md:scale-125 lg:scale-150 origin-center">
                    <TimerDisplay session={session} size="lg" />
                  </div>
                  <div className="mt-8 rounded-full border border-white/10 bg-surface-container-highest/60 px-5 py-3 text-center">
                    <span className="text-xs md:text-lg font-bold tracking-tight text-on-surface-variant uppercase">
                      Agenda: {session?.agenda_text || "No agenda set"}
                    </span>
                  </div>
                </GlassPanel>

                <aside className="flex xl:flex-col gap-3 xl:gap-6 xl:items-end">
                  <div className="flex-1 xl:flex-none text-right rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">Speakers Remaining</p>
                    <p className="text-3xl font-black text-sapphire-300">{channel.queue.length}</p>
                  </div>
                  <div className="flex-1 xl:flex-none text-right rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">Quorum</p>
                    <p className="text-2xl font-black text-white">
                      {conference.delegates.filter((d) => d.is_present).length}/{conference.delegates.length}
                    </p>
                  </div>
                  <div className="flex-1 xl:flex-none text-right rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">Signal</p>
                    <p className="text-xl font-black text-emerald-300">{conference.connectionStatus}</p>
                  </div>
                </aside>
              </div>
            </main>
          </div>

          <footer className="fixed bottom-0 left-0 right-0 z-20 h-16 md:h-20 bg-surface-container-low/80 backdrop-blur-2xl border-t border-white/10 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 bg-sapphire-500 px-4 md:px-6 flex items-center z-30 shadow-[20px_0_40px_rgba(0,0,0,0.5)]">
              <span className="font-black text-black tracking-widest uppercase text-[10px] md:text-xs">Live Updates</span>
            </div>
            <div className="h-full flex items-center whitespace-nowrap animate-[ticker_32s_linear_infinite] pl-[130px] md:pl-[170px] pr-8">
              <div className="flex items-center gap-10 text-xs md:text-sm text-white/75 uppercase tracking-wider">
                <span>Now Speaking: {channel.current?.country || "Awaiting Speaker"}</span>
                <span>Queue Length: {channel.queue.length}</span>
                <span>Signed In: {conference.delegates.filter((d) => d.has_logged_in).length}</span>
                <span>Agenda: {session?.agenda_text || "No agenda set"}</span>
                <span>Now Speaking: {channel.current?.country || "Awaiting Speaker"}</span>
                <span>Queue Length: {channel.queue.length}</span>
                <span>Signed In: {conference.delegates.filter((d) => d.has_logged_in).length}</span>
                <span>Agenda: {session?.agenda_text || "No agenda set"}</span>
              </div>
            </div>
          </footer>
        </div>
      </div>

      <style jsx>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
