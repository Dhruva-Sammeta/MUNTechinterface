"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { CommitteeMessage, MessageScope } from "@/lib/database.types";
import { toast } from "sonner";

/**
 * useChat — Unified Realtime Chat Hook for SapphireMUN
 * 
 * Handles scoped messaging (Public, Private, Bloc, EB) with background 
 * encryption/decryption using the Web Crypto API.
 */
export function useChat(
  committeeId: string | null,
  sessionId: string | null,
  delegateId: string | null,
  delegateRole: string | null,
  _blocId: string | null = null
) {
  const [messages, setMessages] = useState<CommitteeMessage[]>([]);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const isEbViewer = delegateRole === "eb" || delegateRole === "admin";

  const canViewMessage = useCallback(
    (msg: CommitteeMessage) => {
      if (!delegateId) return false;
      if (msg.scope === "public") return true;

      if (msg.scope === "private") {
        const isParticipant = msg.sender_id === delegateId || msg.recipient_id === delegateId;
        const ebVisible = Boolean((msg as any).visible_to_eb);
        return isParticipant || (isEbViewer && ebVisible);
      }

      return false;
    },
    [delegateId, isEbViewer],
  );

  const getPrivateSecret = useCallback(
    (msg: CommitteeMessage) => {
      if (!committeeId || !msg.sender_id || !msg.recipient_id) return null;
      const pair = [msg.sender_id, msg.recipient_id].sort().join(":");
      return `${committeeId}:dm:${pair}`;
    },
    [committeeId],
  );

  /**
   * Helper to determine decryption secret based on scope
   */
  const getSecretForScope = useCallback(
    (msg: CommitteeMessage) => {
      if (msg.scope === "private") {
        return getPrivateSecret(msg);
      }
      return committeeId;
    },
    [committeeId, getPrivateSecret],
  );

  /**
   * Process and decrypt a message
   */
  const processMessage = async (msg: CommitteeMessage) => {
    if (decryptedCache[msg.id]) return;

    const secret = getSecretForScope(msg);
    if (!secret) return;

    const scopeKey = msg.scope === "private" ? "PRIVATE" : "PUBLIC";
    const plaintext = await decryptMessage(msg.content, secret, scopeKey);
    setDecryptedCache(prev => ({ ...prev, [msg.id]: plaintext }));
  };

  // 1. Initial Load
  useEffect(() => {
    if (!committeeId || !sessionId) {
      setMessages([]);
      setDecryptedCache({});
      setIsLoading(false);
      return;
    }

    async function loadHistory() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("committee_messages")
          .select("*")
          .eq("committee_id", committeeId)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Chat history error:", error);
          setMessages([]);
        } else if (data) {
          const msgs = (data as CommitteeMessage[]).filter(canViewMessage);
          setMessages(msgs);

          // Background decrypt everything
          for (const m of msgs) {
            processMessage(m);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, [canViewMessage, committeeId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Realtime Subscriptions
  useEffect(() => {
    if (!committeeId || !sessionId) return;

    const channel = supabase
      .channel(`chat:${committeeId}:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "committee_messages",
          filter: `committee_id=eq.${committeeId}`,
        },
        async (payload) => {
          const newMessage = payload.new as CommitteeMessage;
          if (newMessage.session_id !== sessionId) return;
          if (!canViewMessage(newMessage)) return;
          setMessages(prev => [...prev, newMessage]);
          processMessage(newMessage); // Decrypt immediately
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "committee_messages",
          filter: `committee_id=eq.${committeeId}`,
        },
        (payload) => {
          const updated = payload.new as CommitteeMessage;
          if (updated.session_id !== sessionId) return;
          if (!canViewMessage(updated)) {
            setMessages(prev => prev.filter(m => m.id !== updated.id));
            return;
          }
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
          processMessage(updated);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "committee_messages",
          filter: `committee_id=eq.${committeeId}`,
        },
        (payload) => {
          const deleted = payload.old as CommitteeMessage;
          if (deleted.session_id !== sessionId) return;
          setMessages(prev => prev.filter(m => m.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canViewMessage, committeeId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Send a scoped message
   */
  const sendMessage = async (
    content: string,
    scope: MessageScope,
    targetRecipientId?: string,
    _targetBlocId?: string,
    options?: { visibleToEb?: boolean }
  ) => {
    if (!delegateId || !committeeId || !sessionId) {
      toast.error("Not authenticated");
      return;
    }

    try {
      const normalizedScope: MessageScope = scope === "private" ? "private" : "public";

      if (normalizedScope === "private") {
        if (!targetRecipientId) {
          toast.error("Select a direct recipient");
          return;
        }
        if (targetRecipientId === delegateId) {
          toast.error("You cannot message yourself");
          return;
        }
      }

      const secret =
        normalizedScope === "private"
          ? `${committeeId}:dm:${[delegateId, String(targetRecipientId)].sort().join(":")}`
          : committeeId;

      // B. Encrypt client-side
      const encrypted = await encryptMessage(
        content,
        secret,
        normalizedScope === "private" ? "PRIVATE" : "PUBLIC",
      );

      // C. Insert to DB (RLS will handle access)
      const { error } = await supabase.from("committee_messages").insert({
        committee_id: committeeId,
        session_id: sessionId,
        sender_id: delegateId,
        scope: normalizedScope,
        recipient_id: normalizedScope === "private" ? targetRecipientId : null,
        visible_to_eb: normalizedScope === "private" ? Boolean(options?.visibleToEb) : false,
        content: encrypted,
      });

      if (error) {
        toast.error("Sending failed: " + error.message);
      }
    } catch (e) {
      console.error(e);
      toast.error("Encryption error");
    }
  };

  /**
   * Approve a pending message (EB only)
   */
  const approveMessage = async (msgId: string) => {
    const { error } = await supabase
      .from("committee_messages")
      .update({ is_approved: true })
      .eq("id", msgId);
    
    if (error) toast.error(error.message);
    else toast.success("Approved");
  };

    /**
     * Report a message for moderation
     */
    const reportMessage = async (msgId: string, reason?: string) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return toast.error("Not authenticated");

        const res = await fetch("/api/reports/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messageId: msgId, reason: reason || null }),
        });

        const json = await res.json();
        if (!res.ok) return toast.error(json.error || "Failed to report message");
        toast.success("Reported");
      } catch (e: any) {
        console.error(e);
        toast.error("Report failed");
      }
    };

  return {
    messages,
    decryptedCache,
    isLoading,
    sendMessage,
    approveMessage,
    reportMessage,
  };
}
