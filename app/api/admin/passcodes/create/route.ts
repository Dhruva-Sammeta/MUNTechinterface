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

    // Verify admin caller via Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user: adminUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminDelegate, error: delegateError } = await supabaseAdmin
      .from("delegates")
      .select("role")
      .eq("user_id", adminUser.id)
      .maybeSingle();

    if (delegateError || adminDelegate?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { committeeId, displayName, passcode, role, expiresAt } = await req.json();
    if (!committeeId || !displayName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const plain = passcode && String(passcode).trim().length > 0
      ? String(passcode).trim().toUpperCase()
      : Math.random().toString(36).slice(-6).toUpperCase();

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(plain, salt, 310000, 32, "sha256").toString("hex");

    const insertObj: any = {
      committee_id: committeeId,
      passcode_hash: hash,
      passcode_salt: salt,
      display_name: displayName,
      role: role || "delegate",
    };
    if (expiresAt) insertObj.expires_at = expiresAt;

    const { error: insertError } = await supabaseAdmin.from("delegate_passcodes").insert(insertObj);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ success: true, passcode: plain });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
