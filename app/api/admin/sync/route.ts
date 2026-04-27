import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAdminFromRequest } from "@/lib/server/supabaseAdmin";

const MODES = new Set(["normal", "crisis", "voting", "break"]);

async function isAuthorized(req: Request) {
  const syncSecret = process.env.ADMIN_SYNC_SECRET;
  const providedSecret = req.headers.get("x-admin-secret");

  if (syncSecret) {
    if (providedSecret && providedSecret === syncSecret) {
      return { ok: true };
    }
  } else if (providedSecret && providedSecret.trim()) {
    return { ok: true };
  }

  try {
    await requireAdminFromRequest(req);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function POST(req: Request) {
  try {
    const auth = await isAuthorized(req);
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const event = String(body?.event || "").trim();
    const committeeId = String(body?.committeeId || "").trim();

    if (event !== "mode_change") {
      return NextResponse.json({ success: true, applied: false, reason: "No-op event" });
    }

    const requestedMode = String(body?.data?.mode || "").trim().toLowerCase();
    if (!committeeId || !MODES.has(requestedMode)) {
      return NextResponse.json({ error: "Invalid committeeId or mode" }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const today = new Date().toISOString().split("T")[0];

    const { data: existingSession, error: findError } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("committee_id", committeeId)
      .eq("date", today)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    let sessionId = existingSession?.id as string | undefined;

    if (!sessionId) {
      const { data: insertedSession, error: insertError } = await supabaseAdmin
        .from("sessions")
        .insert({ committee_id: committeeId, date: today })
        .select("id")
        .maybeSingle();

      if (insertError || !insertedSession?.id) {
        return NextResponse.json({ error: insertError?.message || "Failed to create session" }, { status: 500 });
      }

      sessionId = insertedSession.id;
    }

    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({ mode: requestedMode })
      .eq("id", sessionId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, applied: true, session: updatedSession });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Sync failed" }, { status: 500 });
  }
}
