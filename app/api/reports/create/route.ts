import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const messageId = typeof body?.messageId === "string" ? body.messageId : null;
    const reason = typeof body?.reason === "string" ? body.reason : null;

    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const { data: reporterDelegate } = await supabaseAdmin
      .from("delegates")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error: auditError } = await supabaseAdmin.from("passcode_audit").insert({
      action: "report_message",
      admin_user_id: user.id,
      delegate_id: reporterDelegate?.id ?? null,
      details: { message_id: messageId, reason },
    });

    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, persisted: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to report message" }, { status: 500 });
  }
}
