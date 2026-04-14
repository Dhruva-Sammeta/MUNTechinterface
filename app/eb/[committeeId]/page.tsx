"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Delegate = {
  id: string;
  display_name: string;
  role: string;
};

type Session = {
  mode: string;
  agenda_text: string;
  timer_duration_s: number;
  timer_paused: boolean;
  timer_started_at: string | null;
};

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export default function EbPage() {
  const params = useParams<{ committeeId: string }>();
  const committeeId = params.committeeId;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [agendaInput, setAgendaInput] = useState("");
  const [error, setError] = useState("");

  async function loadState() {
    const response = await fetch(`/api/committee/state?committeeId=${committeeId}`);
    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error || "Could not load state");
      return;
    }
    setSession(payload.session || null);
    setAgendaInput(payload.session?.agenda_text || "");
    setDelegates((payload.delegates || []) as Delegate[]);
    setMessages((payload.messages || []) as Message[]);
  }

  useEffect(() => {
    if (!committeeId) return;
    loadState();
    const timer = setInterval(loadState, 3000);
    return () => clearInterval(timer);
  }, [committeeId]);

  async function withToken() {
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    if (!authSession?.access_token) {
      router.push("/");
      return null;
    }
    return authSession.access_token;
  }

  async function updateSession(patch: Record<string, unknown>) {
    const token = await withToken();
    if (!token) return;

    const response = await fetch("/api/committee/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ committeeId, ...patch }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error || "Could not update session");
      return;
    }

    setSession(payload.session || null);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    setError("");
    const content = messageInput.trim();
    if (!content) return;

    const token = await withToken();
    if (!token) return;

    const response = await fetch("/api/committee/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ committeeId, content }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error || "Could not send message");
      return;
    }

    setMessageInput("");
    loadState();
  }

  const delegateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const delegate of delegates) map.set(delegate.id, delegate.display_name);
    return map;
  }, [delegates]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-2xl font-semibold">EB Console</h1>
          <p className="mt-1 text-sm text-slate-400">Canonical moderation and session control surface.</p>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-lg font-medium">Session Controls</h2>
          <div className="flex flex-wrap gap-2">
            {(["normal", "crisis", "voting", "break"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => updateSession({ mode })}
                className={`rounded-md px-3 py-2 text-sm border ${session?.mode === mode ? "bg-cyan-600 border-cyan-500" : "border-slate-700 hover:bg-slate-800"}`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={String(session?.timer_duration_s ?? 0)}
              onChange={(event) => updateSession({ timerDurationSeconds: Number(event.target.value || 0) })}
              className="w-40 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              type="number"
              min={0}
            />
            <button
              type="button"
              onClick={() => updateSession({ timerPaused: !(session?.timer_paused ?? true) })}
              className="rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-800"
            >
              {session?.timer_paused ? "Resume Timer" : "Pause Timer"}
            </button>
          </div>

          <textarea
            value={agendaInput}
            onChange={(event) => setAgendaInput(event.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 min-h-24"
            placeholder="Session agenda"
          />
          <button
            type="button"
            onClick={() => updateSession({ agendaText: agendaInput })}
            className="rounded-md bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-500"
          >
            Save Agenda
          </button>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-lg font-medium">Public Chat</h2>
          <form onSubmit={sendMessage} className="mt-3 flex gap-2">
            <input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder="Broadcast a message"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
            <button className="rounded-md bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-500" type="submit">
              Send
            </button>
          </form>

          <ul className="mt-4 space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {messages.map((message) => (
              <li key={message.id} className="rounded-md bg-slate-800/60 px-3 py-2 text-sm">
                <p className="font-medium text-cyan-200">{delegateNameById.get(message.sender_id) || "Delegate"}</p>
                <p className="mt-1">{message.content}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(message.created_at).toLocaleTimeString()}</p>
              </li>
            ))}
            {messages.length === 0 && <li className="text-sm text-slate-400">No messages yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
