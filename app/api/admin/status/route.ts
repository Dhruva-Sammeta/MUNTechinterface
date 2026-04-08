import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/admin/status?committeeId=...
 *
 * Hardware polling endpoint. Returns current session state
 * for a given committee. Used by external hardware systems
 * (stage lights, LED panels, etc.) to sync their state.
 *
 * Auth: X-Admin-Secret header
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");

  if (secret !== process.env.ADMIN_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const committeeId = request.nextUrl.searchParams.get("committeeId");

  if (!committeeId) {
    return NextResponse.json(
      { error: "Missing committeeId query param" },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const today = new Date().toISOString().split("T")[0];

  const [sessionRes, committeeRes, delegatesRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("*")
      .eq("committee_id", committeeId)
      .eq("date", today)
      .single(),
    supabase.from("committees").select("*").eq("id", committeeId).single(),
    supabase
      .from("delegates")
      .select("id, is_present, country, role")
      .eq("committee_id", committeeId),
  ]);

  if (!sessionRes.data || !committeeRes.data) {
    return NextResponse.json(
      { error: "Committee or session not found" },
      { status: 404 },
    );
  }

  const session = sessionRes.data;
  const committee = committeeRes.data;
  const delegates = delegatesRes.data || [];

  // Calculate timer remaining
  let timerRemaining = session.timer_duration_s;
  if (session.timer_started_at && !session.timer_paused) {
    const elapsed =
      (Date.now() - new Date(session.timer_started_at).getTime()) / 1000;
    timerRemaining = Math.max(0, session.timer_duration_s - elapsed);
  }

  return NextResponse.json({
    committee: {
      id: committee.id,
      name: committee.name,
      short_name: committee.short_name,
      theme: committee.theme,
    },
    session: {
      mode: session.mode,
      agenda: session.agenda_text,
      timer_remaining_s: Math.round(timerRemaining),
      timer_running: !session.timer_paused && !!session.timer_started_at,
    },
    delegates: {
      total: delegates.length,
      present: delegates.filter((d: { is_present: boolean }) => d.is_present)
        .length,
    },
    timestamp: new Date().toISOString(),
  });
}
