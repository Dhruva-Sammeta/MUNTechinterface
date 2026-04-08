"use client";

import { useState, useEffect, useRef } from "react";
import { MessageScope, CommitteeMessage } from "@/lib/database.types";
import { useChat } from "@/hooks/useChat";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  Globe, 
  MessageCircle, 
  Users, 
  ShieldAlert, 
  Lock, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Clock
} from "lucide-react";
import { GlassPanel } from "@/components/ui/shared";

interface ChatHubProps {
  committeeId: string;
  sessionId: string;
  delegateId: string;
  delegateRole: string;
  blocId?: string | null;
  accentColor?: string;
  delegates: any[];
}

export function ChatHub({ 
  committeeId, 
  sessionId, 
  delegateId, 
  delegateRole,
  blocId = null,
  accentColor = "#0A84FF",
  delegates
}: ChatHubProps) {
  const [activeTab, setActiveTab] = useState<MessageScope>("public");
  const [inputText, setInputText] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, decryptedCache, isLoading, sendMessage, approveMessage } = useChat(
    committeeId, 
    sessionId, 
    delegateId,
    blocId
  );

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, decryptedCache]);

  const filteredMessages = messages.filter(m => {
    if (activeTab === "public") return m.scope === "public";
    if (activeTab === "eb") return m.scope === "eb";
    if (activeTab === "bloc") return m.scope === "bloc";
    if (activeTab === "private") {
      // For private, only show if matched with selectedRecipient or any private message if not selected
      if (selectedRecipient) {
        return m.scope === "private" && (
          (m.sender_id === delegateId && m.recipient_id === selectedRecipient) ||
          (m.sender_id === selectedRecipient && m.recipient_id === delegateId)
        );
      }
      return m.scope === "private";
    }
    return false;
  });

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    await sendMessage(
      inputText.trim(),
      activeTab,
      selectedRecipient || undefined,
      activeTab === "bloc" ? (blocId || undefined) : undefined
    );
    
    setInputText("");
  };

  const tabs: { id: MessageScope; label: string; icon: any; color: string }[] = [
    { id: "public", label: "Global", icon: Globe, color: accentColor },
    { id: "private", label: "Private", icon: MessageCircle, color: "#FFB800" },
    { id: "bloc", label: "Alliance", icon: Users, color: "#30D158" },
    { id: "eb", label: "EB Desk", icon: ShieldAlert, color: "#FF3B30" },
  ];

  // Only EB sees EB Desk, and only Bloc members see Bloc tab
  const visibleTabs = tabs.filter(t => {
    if (t.id === "eb" && delegateRole !== "eb" && delegateRole !== "admin") return false;
    if (t.id === "bloc" && !blocId && (delegateRole !== "eb" && delegateRole !== "admin")) return false;
    return true;
  });

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
              <h3 className="text-sm font-bold capitalize">{activeTab} Chat</h3>
              <p className="text-[10px] text-white/30 flex items-center gap-1">
                <Lock size={8} /> Secure Scope-Based Encryption
              </p>
            </div>
          </div>
          
          {activeTab === "private" && (
            <select
              value={selectedRecipient || ""}
              onChange={(e) => setSelectedRecipient(e.target.value || null)}
              className="bg-black/40 border border-white/10 rounded-lg text-xs px-2 py-1 outline-none"
            >
              <option value="">Select Recipient...</option>
              {delegates
                .filter((d: any) => d.id !== delegateId && d.role === "delegate")
                .map((d: any) => (
                  <option key={d.id} value={d.id}>{d.country}</option>
                ))}
            </select>
          )}
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
            filteredMessages.map((msg, i) => (
              <ChatMessage 
                key={msg.id} 
                msg={msg} 
                isMine={msg.sender_id === delegateId}
                plaintext={decryptedCache[msg.id] || "Decrypting..."}
                delegates={delegates}
                isEBView={delegateRole === "eb" || delegateRole === "admin"}
                onApprove={() => approveMessage(msg.id)}
              />
            ))
          )}
        </div>

        {/* Footer / Input */}
        <div className="p-2 border-t border-white/5 bg-white/5">
          <form 
            onSubmit={handleSend}
            className="flex gap-2 items-center"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Send message to ${activeTab}...`}
              className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-white/20 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || (activeTab === "private" && !selectedRecipient)}
              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all disabled:opacity-20"
              style={{ color: accentColor }}
            >
              <Send size={18} />
            </button>
          </form>
          {activeTab === "private" && !selectedRecipient && (
            <p className="text-[10px] text-amber-500 mt-2 text-center">
              Please select a recipient to start a private chat.
            </p>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

function ChatMessage({ msg, isMine, plaintext, delegates, isEBView, onApprove }: any) {
  const sender = delegates.find((d: any) => d.id === msg.sender_id);
  const recipient = delegates.find((d: any) => d.id === msg.recipient_id);

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[85%] ${isMine ? "ml-auto" : "mr-auto"}`}>
      <div className="flex items-center gap-2 mb-1 px-1">
        {!isMine && (
          <span className="text-[10px] font-bold opacity-60">
            {sender?.country || "Secretariat"}
          </span>
        )}
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
            <Lock size={8} /> Chit {isMine ? `to ${recipient?.country}` : `from ${sender?.country}`}
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
          </div>
        )}
      </div>
    </div>
  );
}
