import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
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
      .select("id,role,committee_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!callerDelegate || (callerDelegate.role !== "admin" && callerDelegate.role !== "eb")) {
      return NextResponse.json({ error: "Forbidden: admin/eb required" }, { status: 403 });
    }

    // Fetch reports
    const { data: reports } = await supabaseAdmin
      .from("reported_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const messageIds = (reports || []).map((r: any) => r.message_id).filter(Boolean);
    const { data: messages } = messageIds.length
      ? await supabaseAdmin.from("committee_messages").select("id,committee_id,session_id,scope,sender_id,created_at").in("id", messageIds)
      : { data: [] };

    const reporterDelegateIds = (reports || []).map((r: any) => r.reporter_delegate_id).filter(Boolean);
    const { data: delegates } = reporterDelegateIds.length
      ? await supabaseAdmin.from("delegates").select("id,display_name,country,committee_id").in("id", reporterDelegateIds)
      : { data: [] };

    // Map messages and delegates into reports
    const messagesById = {} as Record<string, any>;
    (messages || []).forEach((m: any) => (messagesById[m.id] = m));
    const delegatesById = {} as Record<string, any>;
    (delegates || []).forEach((d: any) => (delegatesById[d.id] = d));

    let combined = (reports || []).map((r: any) => ({
      ...r,
      message: messagesById[r.message_id] || null,
      reporter_delegate: delegatesById[r.reporter_delegate_id] || null,
    }));

    // If caller is EB (not admin), filter to their committee only
    if (callerDelegate.role === "eb") {
      combined = combined.filter((c) => c.message && c.message.committee_id === callerDelegate.committee_id);
    }

    return NextResponse.json({ reports: combined });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
