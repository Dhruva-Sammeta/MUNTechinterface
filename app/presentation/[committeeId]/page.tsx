"use client";

import { useEffect, useState } from "react";

type Session = {
  mode: string;
  agenda_text: string;
  timer_duration_s: number;
  timer_paused: boolean;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
};

export default function PresentationPage({ params }: { params: { committeeId: string } }) {
  const committeeId = params.committeeId;
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/committee/state?committeeId=${committeeId}`);
      const payload = await response.json();
      if (response.ok) {
        setSession(payload.session || null);
        setMessages(payload.messages || []);
      }
    }

    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [committeeId]);

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold">Committee Presentation View</h1>
        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-400">Mode</p>
          <p className="text-xl">{session?.mode || "-"}</p>
          <p className="mt-3 text-sm text-slate-400">Agenda</p>
          <p className="text-lg">{session?.agenda_text || "No agenda set"}</p>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <h2 className="text-lg font-medium">Latest Messages</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {messages.slice(-20).map((message) => (
              <li key={message.id} className="rounded-md bg-slate-800/60 px-3 py-2">
                <p>{message.content}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(message.created_at).toLocaleTimeString()}</p>
              </li>
            ))}
            {messages.length === 0 && <li className="text-slate-400">No messages yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
