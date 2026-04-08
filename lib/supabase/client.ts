"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Graceful fallback if env vars aren't configured yet
  if (!url || !key || url.includes("your-project-ref")) {
    // Return a mock-ish client that won't crash
    // In production, these env vars will always be set
    return createBrowserClient(
      "https://placeholder.supabase.co",
      "placeholder-key",
    );
  }

  return createBrowserClient(url, key);
}
