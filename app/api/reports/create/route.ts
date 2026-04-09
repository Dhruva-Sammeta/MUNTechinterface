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

    const body = await req.json();
    const { messageId, reason, details } = body;
    if (!messageId) return NextResponse.json({ error: "Missing messageId" }, { status: 400 });

    // Try to find reporter delegate id (may be null for anonymous accounts)
    const { data: reporterDelegate } = await supabaseAdmin
      .from("delegates")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();

    const { error: insertErr } = await supabaseAdmin.from("reported_messages").insert({
      message_id: messageId,
      reporter_user_id: user.id,
      reporter_delegate_id: reporterDelegate?.id || null,
      reporter_ip: ip,
      reason: reason || null,
      details: details || {},
    });

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
