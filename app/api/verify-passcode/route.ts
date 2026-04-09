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

    // Rate limiting: count failed attempts from this IP in the last window
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
    const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const MAX_FAILED = 8; // max failed attempts in window
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count: failedCount } = await supabaseAdmin
      .from("passcode_attempts")
      .select("id", { count: "exact" })
      .eq("ip", ip)
      .eq("success", false)
      .gte("created_at", since);

    if ((failedCount || 0) >= MAX_FAILED) {
      return NextResponse.json({ valid: false, error: "Too many attempts, try again later" }, { status: 429 });
    }

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
      if (p.expires_at && new Date(p.expires_at).getTime() <= now) continue;
      if (p.revoked) continue;

      const derived = crypto
        .pbkdf2Sync(code, p.passcode_salt, 310000, 32, "sha256")
        .toString("hex");
      if (derived === p.passcode_hash) {
        // record successful attempt
        await supabaseAdmin.from("passcode_attempts").insert({ ip, committee_id: committeeId, passcode_id: p.id, success: true });
        return NextResponse.json({
          valid: true,
          role: p.role || "delegate",
          assignedDisplayName: p.display_name,
          passcodeId: p.id,
          assigned: !!p.assigned_user_id,
        });
      }
    }


    // record failed attempt
    await supabaseAdmin.from("passcode_attempts").insert({ ip, committee_id: committeeId, success: false });
    return NextResponse.json({ valid: false });
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 400 });
  }
}
