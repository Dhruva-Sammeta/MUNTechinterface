import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

const ALLOWED_MODES = new Set(["normal", "crisis", "voting", "break"]);

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

    if (!committeeId) return NextResponse.json({ error: "committeeId required" }, { status: 400 });

    const { data: delegate, error: delegateError } = await admin
      .from("delegates")
      .select("id,committee_id,role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      delegateError ||
      !delegate?.id ||
      delegate.committee_id !== committeeId ||
      (delegate.role !== "eb" && delegate.role !== "admin")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const session = await ensureSession(committeeId);

    const patch: Record<string, unknown> = {};
    if (typeof body?.mode === "string" && ALLOWED_MODES.has(body.mode)) patch.mode = body.mode;
    if (typeof body?.agendaText === "string") patch.agenda_text = body.agendaText;
    if (typeof body?.timerDurationSeconds === "number" && Number.isFinite(body.timerDurationSeconds)) {
      patch.timer_duration_s = Math.max(0, Math.floor(body.timerDurationSeconds));
    }
    if (typeof body?.timerPaused === "boolean") patch.timer_paused = body.timerPaused;
    if (typeof body?.timerStartedAt === "string" || body?.timerStartedAt === null) {
      patch.timer_started_at = body.timerStartedAt;
    }

    const { data, error } = await admin
      .from("sessions")
      .update(patch)
      .eq("id", session.id)
      .select("id,committee_id,date,mode,agenda_text,timer_duration_s,timer_started_at,timer_paused,created_at")
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });

    return NextResponse.json({ success: true, session: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Session update failed" }, { status: 500 });
  }
}
