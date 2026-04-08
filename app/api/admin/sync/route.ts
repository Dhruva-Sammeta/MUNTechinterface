import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/sync
 *
 * Hardware sync endpoint. Receives signals from external devices
 * (podium lights, buzzers, displays) and broadcasts via Supabase Realtime.
 *
 * Auth: X-Admin-Secret header must match ADMIN_SYNC_SECRET env var
 *
 * Payload:
 * {
 *   committeeId: string,
 *   event: "mode_change" | "timer_end" | "speaker_start" | "announcement",
 *   data: { ... }
 * }
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");

  if (secret !== process.env.ADMIN_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { committeeId, event, data } = body;

  if (!committeeId || !event) {
    return NextResponse.json(
      { error: "Missing committeeId or event" },
      { status: 400 },
    );
  }

  // Use service-level Supabase client (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  try {
    switch (event) {
      case "mode_change": {
        const { mode } = data;
        if (!["normal", "crisis", "voting", "break"].includes(mode)) {
          return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
        }
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("sessions")
          .update({ mode })
          .eq("committee_id", committeeId)
          .eq("date", today);
        break;
      }

      case "timer_end": {
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("sessions")
          .update({
            timer_duration_s: 0,
            timer_started_at: null,
            timer_paused: true,
          })
          .eq("committee_id", committeeId)
          .eq("date", today);
        break;
      }

      case "speaker_start": {
        // Broadcast via realtime channel (ephemeral)
        const channel = supabase.channel(`speaker_queue:${committeeId}`);
        await channel.send({
          type: "broadcast",
          event: "speaker_queue",
          payload: { type: "SPEAKER_START", payload: data },
        });
        break;
      }

      case "announcement": {
        const { content, created_by } = data;
        if (!content) {
          return NextResponse.json(
            { error: "Missing content" },
            { status: 400 },
          );
        }
        await supabase.from("global_announcements").insert({
          content,
          created_by: created_by || "00000000-0000-0000-0000-000000000000",
        });
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown event: ${event}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, event, committeeId });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}
