import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureSessionId(committeeId: string): Promise<string> {
  const admin = createSupabaseAdmin();
  const today = todayISODate();

  const current = await admin
    .from("sessions")
    .select("id")
    .eq("committee_id", committeeId)
    .eq("date", today)
    .maybeSingle();

  if (current.data?.id) return current.data.id;

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
    .select("id")
    .maybeSingle();

  if (inserted.error || !inserted.data?.id) {
    throw new Error(inserted.error?.message || "Could not create session");
  }

  return inserted.data.id;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdmin();
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const committeeId = String(body?.committeeId || "");
    const content = String(body?.content || "").trim();

    if (!committeeId || !content) {
      return NextResponse.json({ error: "committeeId and content are required" }, { status: 400 });
    }

    const { data: delegate, error: delegateError } = await admin
      .from("delegates")
      .select("id,committee_id,has_logged_in")
      .eq("user_id", user.id)
      .maybeSingle();

    if (delegateError || !delegate?.id || delegate.committee_id !== committeeId || !delegate.has_logged_in) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessionId = await ensureSessionId(committeeId);

    const { data, error } = await admin
      .from("committee_messages")
      .insert({
        committee_id: committeeId,
        session_id: sessionId,
        sender_id: delegate.id,
        scope: "public",
        content,
        is_approved: true,
      })
      .select("id,committee_id,session_id,sender_id,scope,content,is_approved,created_at")
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });

    return NextResponse.json({ success: true, message: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Send failed" }, { status: 500 });
  }
}
