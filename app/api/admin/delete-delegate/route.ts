import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Ensure caller is an admin in delegates table
    const { data: adminDelegate, error: delegateErr } = await supabaseAdmin
      .from("delegates")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (delegateErr || adminDelegate?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { delegateId } = await req.json();
    if (!delegateId) return NextResponse.json({ error: "Missing delegateId" }, { status: 400 });

    // Load target delegate
    const { data: target, error: targetErr } = await supabaseAdmin
      .from("delegates")
      .select("id,user_id,role")
      .eq("id", delegateId)
      .maybeSingle();
    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: "Delegate not found" }, { status: 404 });

    // If target is admin, ensure there will remain another admin
    if (target.role === "admin") {
      const { count, error: countErr } = await supabaseAdmin
        .from("delegates")
        .select("id", { count: "exact" })
        .eq("role", "admin");
      if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: "Cannot delete the last admin account" }, { status: 400 });
      }
    }

    // Delete the delegate row only (do not cascade).
    const { error: delErr } = await supabaseAdmin.from("delegates").delete().eq("id", delegateId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Audit
    try {
      await supabaseAdmin.from("passcode_audit").insert({ action: "delete_delegate", admin_user_id: user.id, delegate_id: delegateId, details: { deleted_role: target.role } });
    } catch (_) {
      // non-blocking
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
