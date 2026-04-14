import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureSession(committeeId: string) {
  const admin = createSupabaseAdmin();
  const today = todayISODate();

  const current = await admin
    .from("sessions")
    .select("id,committee_id,date,mode,agenda_text,timer_duration_s,timer_started_at,timer_paused,created_at")
    .eq("committee_id", committeeId)
    .eq("date", today)
    .maybeSingle();

  if (current.data?.id) return current.data;

  const inserted = await admin
    .from("sessions")
    .insert({
      committee_id: committeeId,
      date: today,
      mode: "normal",
      agenda_text: "",
      timer_duration_s: 0,
      timer_paused: true,
    })
    .select("id,committee_id,date,mode,agenda_text,timer_duration_s,timer_started_at,timer_paused,created_at")
    .maybeSingle();

  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message || "Could not create session");
  }

  return inserted.data;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const committeeId = searchParams.get("committeeId");
    if (!committeeId) {
      return NextResponse.json({ error: "committeeId required" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    const [session, delegatesRes, messagesRes] = await Promise.all([
      ensureSession(committeeId),
      admin
        .from("delegates")
        .select("id,user_id,committee_id,display_name,country,role,is_present,has_logged_in,joined_at")
        .eq("committee_id", committeeId)
        .eq("has_logged_in", true)
        .order("display_name", { ascending: true }),
      admin
        .from("committee_messages")
        .select("id,committee_id,session_id,sender_id,scope,content,is_approved,created_at")
        .eq("committee_id", committeeId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (delegatesRes.error) return NextResponse.json({ error: delegatesRes.error.message }, { status: 500 });
    if (messagesRes.error) return NextResponse.json({ error: messagesRes.error.message }, { status: 500 });

    return NextResponse.json({
      session,
      delegates: delegatesRes.data || [],
      messages: (messagesRes.data || []).reverse(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "State fetch failed" }, { status: 500 });
  }
}
