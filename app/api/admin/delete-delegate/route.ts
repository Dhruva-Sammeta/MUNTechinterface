import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAdminFromRequest } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const supabaseAdmin = createSupabaseAdmin();

    const body = await req.json();
    const delegateId = String(body?.delegateId || "").trim();

    if (!delegateId) {
      return NextResponse.json({ error: "delegateId is required" }, { status: 400 });
    }

    const { data: targetDelegate, error: targetError } = await supabaseAdmin
      .from("delegates")
      .select("id,user_id,committee_id,display_name,role")
      .eq("id", delegateId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }

    if (!targetDelegate) {
      return NextResponse.json({ error: "Delegate not found" }, { status: 404 });
    }

    if (targetDelegate.role === "admin") {
      const { count: adminCount, error: countError } = await supabaseAdmin
        .from("delegates")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if ((adminCount || 0) <= 1) {
        return NextResponse.json({ error: "Cannot delete the last admin account" }, { status: 400 });
      }
    }

    const passcodeIds = new Set<string>();

    if (targetDelegate.user_id) {
      const { data: assignedPasscodes, error: assignedPasscodesError } = await supabaseAdmin
        .from("delegate_passcodes")
        .select("id")
        .eq("assigned_user_id", targetDelegate.user_id);

      if (assignedPasscodesError) {
        return NextResponse.json({ error: assignedPasscodesError.message }, { status: 500 });
      }

      for (const row of assignedPasscodes || []) {
        if (row?.id) passcodeIds.add(row.id);
      }
    }

    if (targetDelegate.committee_id && targetDelegate.display_name) {
      const { data: namedPasscodes, error: namedPasscodesError } = await supabaseAdmin
        .from("delegate_passcodes")
        .select("id")
        .eq("committee_id", targetDelegate.committee_id)
        .eq("display_name", targetDelegate.display_name);

      if (namedPasscodesError) {
        return NextResponse.json({ error: namedPasscodesError.message }, { status: 500 });
      }

      for (const row of namedPasscodes || []) {
        if (row?.id) passcodeIds.add(row.id);
      }
    }

    if (passcodeIds.size > 0) {
      const { error: deletePasscodesError } = await supabaseAdmin
        .from("delegate_passcodes")
        .delete()
        .in("id", Array.from(passcodeIds));

      if (deletePasscodesError) {
        return NextResponse.json({ error: deletePasscodesError.message }, { status: 500 });
      }
    }

    const { error: deleteDelegateError } = await supabaseAdmin
      .from("delegates")
      .delete()
      .eq("id", delegateId);

    if (deleteDelegateError) {
      return NextResponse.json({ error: deleteDelegateError.message }, { status: 500 });
    }

    if (targetDelegate.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(targetDelegate.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error?.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message || "Failed to delete delegate" }, { status: 500 });
  }
}
