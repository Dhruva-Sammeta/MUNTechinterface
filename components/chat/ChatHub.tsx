"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { 
  Send, 
  Globe,
  MessageCircle, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  Loader2,
  AlertTriangle,
  Clock
} from "lucide-react";
import { GlassPanel } from "@/components/ui/shared";

type DelegateRef = {
  id: string;
  display_name?: string | null;
  country?: string | null;
};

interface ChatHubProps {
  committeeId: string;
  sessionId: string;
  delegateId: string;
  delegateRole: string;
  blocId?: string | null;
  accentColor?: string;
  delegates: any[];
}

type ChatTab = "public" | "private" | "eb_chits" | "eb_review";

export function ChatHub({ 
  committeeId, 
  sessionId, 
  delegateId, 
  delegateRole,
  blocId = null,
  accentColor = "#0A84FF",
  delegates
}: ChatHubProps) {
  const [activeTab, setActiveTab] = useState<ChatTab>("public");
  const [inputText, setInputText] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [visibleToEb, setVisibleToEb] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isEbView = delegateRole === "eb" || delegateRole === "admin";

  const { messages, decryptedCache, isLoading, sendMessage, approveMessage, reportMessage } = useChat(
    committeeId, 
    sessionId, 
    delegateId,
    delegateRole,
    blocId
  );

  const directRecipients = delegates
    .filter((d: any) => d.id !== delegateId && d.role === "delegate")
    .sort((a: any, b: any) => a.country.localeCompare(b.country));

  useEffect(() => {
    if (recipientId) {
      const stillExists = directRecipients.some((d: any) => d.id === recipientId);
      if (stillExists) return;
    }
    setRecipientId(directRecipients[0]?.id || "");
  }, [directRecipients, recipientId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, decryptedCache]);

  const filteredMessages = messages
    .filter((m) => {
      if (activeTab === "public") {
        return m.scope === "public";
      }

      if (activeTab === "private") {
        if (m.scope !== "private") return false;
        return m.sender_id === delegateId || m.recipient_id === delegateId;
      }

      if (activeTab === "eb_chits") {
        if (!isEbView || m.scope !== "private") return false;
        return m.sender_id === delegateId || m.recipient_id === delegateId;
      }

      if (activeTab === "eb_review") {
        return isEbView && m.scope === "private" && Boolean((m as any).visible_to_eb);
      }
      return false;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    if (activeTab === "eb_review") {
      return;
    }

    if (activeTab === "public") {
      await sendMessage(inputText.trim(), "public");
      setInputText("");
      return;
    }

    if (activeTab === "eb_chits") {
      await sendMessage(inputText.trim(), "private", recipientId, undefined, { visibleToEb: true });
      setInputText("");
      return;
    }

    await sendMessage(inputText.trim(), "private", recipientId, undefined, { visibleToEb });
    
    setInputText("");
  };

  const tabs: { id: ChatTab; label: string; icon: any; color: string }[] = [
    { id: "public", label: "Public", icon: Globe, color: accentColor },
    ...(isEbView
      ? [
          { id: "eb_chits" as ChatTab, label: "EB Chits", icon: MessageCircle, color: "#22c55e" },
          { id: "eb_review" as ChatTab, label: "EB View", icon: ShieldAlert, color: "#f59e0b" },
        ]
      : [{ id: "private" as ChatTab, label: "Direct", icon: MessageCircle, color: accentColor }]),
  ];

  const visibleTabs = tabs;

  return (
    <div className="flex h-full min-h-[500px] gap-3">
      {/* ── Tabs Sidebar ────────────────────────────────────────────────── */}
      <div className="w-16 flex flex-col gap-2">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full aspect-square flex flex-col items-center justify-center rounded-xl transition-all ${
              activeTab === tab.id ? "bg-white/10" : "hover:bg-white/5 opacity-40"
            }`}
            style={{ color: activeTab === tab.id ? tab.color : "inherit" }}
          >
            <tab.icon size={20} />
            <span className="text-[9px] mt-1 font-bold uppercase">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Main Chat Window ────────────────────────────────────────────── */}
      <GlassPanel padding={false} className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-white/5">
              {(() => {
                const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon;
                return ActiveIcon ? <ActiveIcon size={16} color={accentColor} /> : null;
              })()}
            </div>
            <div>
              <h3 className="text-sm font-bold capitalize">
                {activeTab === "public"
                  ? "Public Chat"
                  : activeTab === "private"
                    ? "Direct Chat"
                    : activeTab === "eb_chits"
                      ? "EB Chits"
                      : "EB Flagged Direct Chat"}
              </h3>
              <p className="text-[10px] text-white/30 flex items-center gap-1">
                <Lock size={8} /> End-to-end scoped encryption
              </p>
            </div>
          </div>
          
        </div>

        {/* Message Feed */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
          style={{ background: "radial-gradient(circle at top right, rgba(255,255,255,0.02), transparent)" }}
        >
            {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin opacity-20" size={32} />
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30">
              <MessageCircle size={48} className="mb-4" />
              <p className="text-sm italic">No messages in this scope yet.</p>
            </div>
            ) : (
            filteredMessages.map((msg) => (
              <ChatMessage 
                key={msg.id} 
                msg={msg} 
                isMine={msg.sender_id === delegateId}
                plaintext={decryptedCache[msg.id] || "Decrypting..."}
                delegates={delegates}
                isEBView={isEbView}
                onApprove={() => approveMessage(msg.id)}
                onReport={async (reason: string | null) => await reportMessage(msg.id, reason || undefined)}
              />
            ))
          )}
        </div>

        {/* Footer / Input */}
        <div className="p-2 border-t border-white/5 bg-white/5">
          {(activeTab === "private" || activeTab === "eb_chits") && (
            <div className="mb-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 px-1">
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                {directRecipients.length === 0 ? (
                  <option value="">No delegates available</option>
                ) : (
                  directRecipients.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.country} - {d.display_name}
                    </option>
                  ))
                )}
              </select>

              {activeTab === "private" ? (
                <label className="inline-flex items-center gap-2 text-xs text-white/70 px-2">
                  <input
                    type="checkbox"
                    checked={visibleToEb}
                    onChange={(e) => setVisibleToEb(e.target.checked)}
                  />
                  Mark visible to EB
                </label>
              ) : (
                <div className="inline-flex items-center gap-2 text-xs text-emerald-200/80 px-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10">
                  EB chits are marked visible to EB automatically
                </div>
              )}
            </div>
          )}

          <form 
            onSubmit={handleSend}
            className="flex gap-2 items-center"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                activeTab === "public"
                  ? "Send message to public chat..."
                  : activeTab === "private"
                  ? "Send direct message..."
                  : activeTab === "eb_chits"
                    ? "Send EB chit..."
                    : "EB review is read-only"
              }
              disabled={activeTab === "eb_review" || ((activeTab === "private" || activeTab === "eb_chits") && !recipientId)}
              className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-white/20 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={
                !inputText.trim() ||
                activeTab === "eb_review" ||
                ((activeTab === "private" || activeTab === "eb_chits") && !recipientId)
              }
              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all disabled:opacity-20"
              style={{ color: accentColor }}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </GlassPanel>
    </div>
  );
}

function getSenderLabel(delegate: DelegateRef | undefined, isMine: boolean) {
  if (isMine) return "You";
  return delegate?.display_name || delegate?.country || "Unknown Delegate";
}

function ChatMessage({ msg, isMine, plaintext, delegates, isEBView, onApprove, onReport }: any) {
  const sender = (delegates as DelegateRef[]).find((d) => d.id === msg.sender_id);
  const recipient = (delegates as DelegateRef[]).find((d) => d.id === msg.recipient_id);
  const senderLabel = getSenderLabel(sender, isMine);
  const senderIdentity = sender?.display_name || sender?.country || "Unknown Delegate";
  const recipientLabel = recipient?.display_name || recipient?.country || "Unknown Delegate";

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[85%] ${isMine ? "ml-auto" : "mr-auto"}`}>
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-[10px] font-bold opacity-70">
          {senderLabel}
        </span>
        <span className="text-[8px] opacity-20 flex items-center gap-1">
          <Clock size={8} /> {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div 
        className={`px-4 py-2.5 rounded-2xl relative shadow-lg ${
          isMine 
            ? "bg-white/10 rounded-tr-none text-white" 
            : "bg-white/5 border border-white/5 rounded-tl-none text-white/90"
        }`}
      >
        {msg.scope === "private" && (
          <div className="text-[8px] uppercase tracking-widest mb-1 pb-1 border-b border-white/5 flex items-center gap-1 opacity-40">
            <Lock size={8} /> Direct: {senderIdentity}{" -> "}{recipientLabel}
            {Boolean((msg as any).visible_to_eb) ? (
              <span className="ml-2 rounded-full border border-amber-300/40 px-1.5 py-0.5 text-[8px] text-amber-200">
                EB Visible
              </span>
            ) : null}
          </div>
        )}

        <p className="text-sm leading-relaxed whitespace-pre-wrap">{plaintext}</p>
        
        {msg.scope === "private" && !msg.is_approved && (
          <div className="mt-2 flex items-center gap-1 pt-1 border-t border-white/5">
            <span className="text-[9px] font-bold text-amber-500 flex items-center gap-1 animate-pulse">
              <Clock size={10} /> Pending Review
            </span>
            {isEBView && (
              <button 
                onClick={onApprove}
                className="ml-auto p-1 hover:bg-white/10 rounded-md text-green-500 transition-all"
                title="Approve Chit"
              >
                <CheckCircle2 size={14} />
              </button>
            )}
            {!isMine && (
              <button
                onClick={async () => {
                  const reason = window.prompt("Report this message (optional reason):");
                  if (reason === null) return;
                  try {
                    await onReport(reason || null);
                  } catch (e) {
                    // handled by hook
                  }
                }}
                className="ml-2 p-1 hover:bg-white/10 rounded-md text-amber-400 transition-all"
                title="Report Message"
              >
                <AlertTriangle size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
