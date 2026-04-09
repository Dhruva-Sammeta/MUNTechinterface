import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { code, committeeJoinCode, displayName, country } = await req.json();
    if (!code || !committeeJoinCode) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Find committee id from join code
    const { data: committeeData } = await supabaseAdmin
      .from("committees")
      .select("id")
      .eq("join_code", String(committeeJoinCode).toUpperCase())
      .maybeSingle();
    const committeeId = committeeData?.id;
    if (!committeeId) return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
    const { data: passcodes } = await supabaseAdmin
      .from("delegate_passcodes")
      .select("*")
      .eq("committee_id", committeeId)
      .order("created_at", { ascending: false });

    if (!passcodes || passcodes.length === 0) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 400 });
    }

    const now = Date.now();
    let matched: any = null;
    for (const p of passcodes) {
      if (p.expires_at && new Date(p.expires_at).getTime() <= now) continue;
      if (p.revoked) continue;
      const derived = crypto.pbkdf2Sync(String(code).toUpperCase(), p.passcode_salt, 310000, 32, "sha256").toString("hex");
      if (derived === p.passcode_hash) {
        matched = p;
        break;
      }
    }

    if (!matched) return NextResponse.json({ error: "Invalid passcode" }, { status: 400 });

    // If the passcode is already assigned to a different user, reject
    if (matched.assigned_user_id && matched.assigned_user_id !== user.id) {
      return NextResponse.json({ error: "Passcode already assigned to another user" }, { status: 403 });
    }

    // Check if delegate record for this user exists
    const { data: existingDelegate } = await supabaseAdmin
      .from("delegates")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let delegateId: string | null = null;
    if (existingDelegate) {
      // Update existing delegate record with committee/role
      const { error: updateError } = await supabaseAdmin
        .from("delegates")
        .update({ committee_id: matched.committee_id, display_name: displayName || matched.display_name, country: country || matched.display_name, role: matched.role })
        .eq("id", existingDelegate.id);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      delegateId = existingDelegate.id;
    } else {
      // Insert new delegate record
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("delegates")
        .insert({ user_id: user.id, committee_id: matched.committee_id, display_name: displayName || matched.display_name, country: country || matched.display_name, role: matched.role })
        .select()
        .maybeSingle();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      delegateId = inserted?.id ?? null;
    }

    // Assign passcode to this user (persistent)
    await supabaseAdmin
      .from("delegate_passcodes")
      .update({ assigned_user_id: delegateId, assigned_at: new Date().toISOString() })
      .eq("id", matched.id);

    return NextResponse.json({ success: true, role: matched.role || "delegate" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
