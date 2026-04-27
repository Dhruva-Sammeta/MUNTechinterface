"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSessionCloseOnTabExit(enabled: boolean) {
  const tokenRef = useRef<string | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token || null;
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      tokenRef.current = session?.access_token || null;
    });

    const closeSession = () => {
      if (closingRef.current) return;
      closingRef.current = true;

      const token = tokenRef.current;
      if (token) {
        const payload = JSON.stringify({ token });

        try {
          navigator.sendBeacon(
            "/api/session/close",
            new Blob([payload], { type: "application/json" }),
          );
        } catch {
          // Fallback below handles unsupported beacon payloads.
        }

        void fetch("/api/session/close", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // Ignore close-session network failures during tab teardown.
        });
      }

      void supabase.auth.signOut({ scope: "local" }).catch(() => {
        // Best-effort local signout on tab close.
      });
    };

    window.addEventListener("beforeunload", closeSession);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", closeSession);
    };
  }, [enabled]);
}
