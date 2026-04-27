import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAdminFromRequest } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const adminContext = await requireAdminFromRequest(req);
    const { passcodeId } = await req.json();

    if (!passcodeId || typeof passcodeId !== "string") {
      return NextResponse.json({ error: "passcodeId required" }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { error: deleteError } = await supabaseAdmin
      .from("delegate_passcodes")
      .delete()
      .eq("id", passcodeId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    await supabaseAdmin.from("passcode_audit").insert({
      action: "delete",
      admin_user_id: adminContext.user.id,
      passcode_id: passcodeId,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error?.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
  }
}
