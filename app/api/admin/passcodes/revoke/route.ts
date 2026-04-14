import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

async function ensureAdmin(accessToken: string) {
  const admin = createSupabaseAdmin();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);
  if (userError || !user) return null;

  const { data: delegate } = await admin
    .from("delegates")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (delegate?.role !== "admin") return null;
  return user.id;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminUserId = await ensureAdmin(authHeader.replace("Bearer ", ""));
    if (!adminUserId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { passcodeId, revoke } = await req.json();
    if (!passcodeId) return NextResponse.json({ error: "passcodeId required" }, { status: 400 });

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("delegate_passcodes")
      .update({ revoked: !!revoke })
      .eq("id", passcodeId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("passcode_audit").insert({
      action: revoke ? "revoke" : "restore",
      admin_user_id: adminUserId,
      passcode_id: passcodeId,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 500 });
  }
}
