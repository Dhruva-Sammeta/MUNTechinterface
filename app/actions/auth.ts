"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Validates a passcode against the admin secret or committee-specific join codes.
 * Returns the assigned role if valid, or null if invalid.
 */
export async function verifyPasscode(input: string, committeeId?: string) {
  const code = input.toUpperCase().trim();
  
  // 1. Check Admin Passcode (Server Side Secret)
  if (process.env.ADMIN_PASSCODE && code === process.env.ADMIN_PASSCODE.toUpperCase()) {
    return "admin";
  }

  // 2. Check Committee codes if a committee is selected
  // We use the server client to query the DB securely
  if (committeeId) {
    const supabase = await createClient();
    const { data: committee } = await supabase
      .from("committees")
      .select("join_code")
      .eq("id", committeeId)
      .maybeSingle();

    if (committee) {
      if (code === committee.join_code.toUpperCase()) {
        return "delegate";
      }
      if (code === `${committee.join_code.toUpperCase()}_EB`) {
        return "eb";
      }
    }
  }

  return null;
}
