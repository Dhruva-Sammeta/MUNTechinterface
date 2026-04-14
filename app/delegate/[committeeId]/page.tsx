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
};

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export default function DelegatePage() {
  const params = useParams<{ committeeId: string }>();
  const committeeId = params.committeeId;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [error, setError] = useState("");

  async function loadState() {
    const response = await fetch(`/api/committee/state?committeeId=${committeeId}`);
    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error || "Could not load state");
      return;
    }
    setSession(payload.session || null);
    setDelegates((payload.delegates || []) as Delegate[]);
    setMessages((payload.messages || []) as Message[]);
  }

  useEffect(() => {
    if (!committeeId) return;
    loadState();
    const timer = setInterval(loadState, 3000);
    return () => clearInterval(timer);
  }, [committeeId]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    setError("");
    const content = messageInput.trim();
    if (!content) return;

    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();

    if (!authSession?.access_token) {
      router.push("/");
      return;
    }

    const response = await fetch("/api/committee/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession.access_token}`,
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
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-2xl font-semibold">Delegate Console</h1>
          <p className="mt-1 text-sm text-slate-400">Canonical flow: session, attendance visibility, and moderated chat.</p>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase text-slate-400">Mode</p>
            <p className="mt-1 text-lg">{session?.mode || "-"}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase text-slate-400">Timer</p>
            <p className="mt-1 text-lg">{session?.timer_duration_s ?? 0}s</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase text-slate-400">Active Delegates</p>
            <p className="mt-1 text-lg">{delegates.length}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-lg font-medium">Agenda</h2>
          <p className="mt-2 text-slate-200">{session?.agenda_text || "No agenda set."}</p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-lg font-medium">Public Chat</h2>
          <form onSubmit={sendMessage} className="mt-3 flex gap-2">
            <input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder="Type a message"
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
