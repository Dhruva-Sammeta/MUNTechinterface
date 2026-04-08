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
  blocId: string | null = null
) {
  const [messages, setMessages] = useState<CommitteeMessage[]>([]);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  /**
   * Helper to determine decryption secret based on scope
   */
  const getSecretForScope = useCallback((msg: CommitteeMessage) => {
    if (msg.scope === "private") return sessionId;
    if (msg.scope === "bloc") return msg.bloc_id || blocId;
    return committeeId; // Default for public and eb
  }, [committeeId, sessionId, blocId]);

  /**
   * Process and decrypt a message
   */
  const processMessage = async (msg: CommitteeMessage) => {
    if (decryptedCache[msg.id]) return;

    const secret = getSecretForScope(msg);
    if (!secret) return;

    const plaintext = await decryptMessage(msg.content, secret, msg.scope.toUpperCase() as any);
    setDecryptedCache(prev => ({ ...prev, [msg.id]: plaintext }));
  };

  // 1. Initial Load
  useEffect(() => {
    if (!committeeId || !sessionId) return;

    async function loadHistory() {
      const { data, error } = await supabase
        .from("committee_messages")
        .select("*")
        .eq("committee_id", committeeId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Chat history error:", error);
      } else if (data) {
        const msgs = data as CommitteeMessage[];
        setMessages(msgs);
        
        // Background decrypt everything
        for (const m of msgs) {
          processMessage(m);
        }
      }
      setIsLoading(false);
    }

    loadHistory();
  }, [committeeId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Realtime Subscriptions
  useEffect(() => {
    if (!committeeId || !sessionId) return;

    const channel = supabase
      .channel(`chat:${committeeId}`)
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
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
          processMessage(updated);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [committeeId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Send a scoped message
   */
  const sendMessage = async (
    content: string,
    scope: MessageScope,
    targetRecipientId?: string,
    targetBlocId?: string
  ) => {
    if (!delegateId || !committeeId || !sessionId) {
      toast.error("Not authenticated");
      return;
    }

    try {
      // A. Determine encryption secret
      let secret = committeeId;
      if (scope === "private") secret = sessionId;
      if (scope === "bloc") secret = targetBlocId || blocId || committeeId;

      // B. Encrypt client-side
      const encrypted = await encryptMessage(content, secret!!, scope.toUpperCase() as any);

      // C. Insert to DB (RLS will handle access)
      const { error } = await supabase.from("committee_messages").insert({
        committee_id: committeeId,
        session_id: sessionId,
        sender_id: delegateId,
        recipient_id: targetRecipientId || null,
        bloc_id: targetBlocId || blocId || null,
        scope,
        content: encrypted,
        // Private messages (chits) are unapproved by default via DB trigger
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

  return {
    messages,
    decryptedCache,
    isLoading,
    sendMessage,
    approveMessage,
  };
}
