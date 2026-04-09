import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const { data: callerDelegate } = await supabaseAdmin
      .from("delegates")
      .select("id,role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!callerDelegate || (callerDelegate.role !== "admin" && callerDelegate.role !== "eb")) {
      return NextResponse.json({ error: "Forbidden: admin/eb required" }, { status: 403 });
    }

    const body = await req.json();
    const { reportId, action } = body;
    if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });

    // Load report
    const { data: report, error: rErr } = await supabaseAdmin.from("reported_messages").select("*").eq("id", reportId).maybeSingle();
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // If action requests DELETE_MESSAGE, remove the underlying message first
    if (action === "delete_message") {
      const { error: delErr } = await supabaseAdmin.from("committee_messages").delete().eq("id", report.message_id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // Mark report resolved
    const updates: any = {
      status: "resolved",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabaseAdmin.from("reported_messages").update(updates).eq("id", reportId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
