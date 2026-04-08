"use client";

import { createClient as _createClient, SupabaseClient } from "@supabase/supabase-js";

let _singleton: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (_singleton) return _singleton;

  _singleton = _createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return _singleton;
}
