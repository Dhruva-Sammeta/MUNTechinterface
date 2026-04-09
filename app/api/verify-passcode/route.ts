import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").toUpperCase();
    const committeeJoinCode = body?.committeeJoinCode
      ? String(body.committeeJoinCode).toUpperCase()
      : null;

    if (!code) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    // Match committee join code (client-visible)
    if (committeeJoinCode && code === committeeJoinCode) {
      return NextResponse.json({ valid: true, role: "delegate" });
    }

    // Match EB code
    if (committeeJoinCode && code === `${committeeJoinCode}_EB`) {
      return NextResponse.json({ valid: true, role: "eb" });
    }

    // Match admin passcode from server env only (kept for compatibility)
    const adminPass = process.env.ADMIN_PASSCODE;
    if (adminPass && code === String(adminPass).toUpperCase()) {
      return NextResponse.json({ valid: true, role: "admin" });
    }

    // Check for admin-created delegate passcodes in DB (server-side)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find committee id from join code if provided
    let committeeId: string | null = null;
    if (committeeJoinCode) {
      const { data: committeeData } = await supabaseAdmin
        .from("committees")
        .select("id")
        .eq("join_code", committeeJoinCode)
        .maybeSingle();
      committeeId = committeeData?.id ?? null;
    }

    // Query candidate passcodes (either for committee or global)
    const { data: passcodes } = await supabaseAdmin
      .from("delegate_passcodes")
      .select("*")
      .order("created_at", { ascending: false });

    if (!passcodes || passcodes.length === 0) {
      return NextResponse.json({ valid: false });
    }

    const now = Date.now();
    for (const p of passcodes) {
      // If committee filter is provided, skip others
      if (committeeId && p.committee_id !== committeeId) continue;

      if (p.redeemed) continue;
      if (p.expires_at && new Date(p.expires_at).getTime() <= now) continue;

      const derived = crypto
        .pbkdf2Sync(code, p.passcode_salt, 310000, 32, "sha256")
        .toString("hex");
      if (derived === p.passcode_hash) {
        return NextResponse.json({
          valid: true,
          role: p.role || "delegate",
          assignedDisplayName: p.display_name,
          passcodeId: p.id,
          assigned: true,
        });
      }
    }

    return NextResponse.json({ valid: false });
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 400 });
  }
}
