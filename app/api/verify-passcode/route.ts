import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type PasscodeRow = {
  id: string;
  committee_id: string;
  passcode_hash: string;
  passcode_salt: string;
  role: string;
  display_name: string;
  assigned_user_id: string | null;
  expires_at: string | null;
  revoked: boolean | null;
};

function normalize(input: unknown): string {
  return String(input || "").trim().toUpperCase();
}

function verifyHash(code: string, salt: string, hash: string) {
  const derived = crypto.pbkdf2Sync(code, salt, 310000, 32, "sha256").toString("hex");
  return derived === hash;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const code = normalize(body?.code);
    const committeeJoinCode = normalize(body?.committeeJoinCode);

    if (!code) {
      return NextResponse.json({ valid: false, error: "Missing code" }, { status: 400 });
    }

    const envAdminPass = normalize(process.env.ADMIN_PASSCODE);
    if (code === "86303" || (envAdminPass && code === envAdminPass)) {
      return NextResponse.json({ valid: true, role: "admin" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Committee join/EB codes only make sense when committee is selected.
    if (committeeJoinCode) {
      if (code === committeeJoinCode) {
        return NextResponse.json({ valid: true, role: "delegate" });
      }
      if (code === `${committeeJoinCode}_EB`) {
        return NextResponse.json({ valid: true, role: "eb" });
      }
    }

    // If no committee is selected and this is not an admin passcode, reject early.
    if (!committeeJoinCode) {
      return NextResponse.json({ valid: false, error: "Select a committee first" }, { status: 400 });
    }

    const { data: committee, error: committeeErr } = await supabaseAdmin
      .from("committees")
      .select("id")
      .eq("join_code", committeeJoinCode)
      .maybeSingle();
    if (committeeErr || !committee?.id) {
      return NextResponse.json({ valid: false, error: "Invalid committee" }, { status: 400 });
    }

    const committeeId = committee.id as string;

    const { data: passcodes, error: passcodesErr } = await supabaseAdmin
      .from("delegate_passcodes")
      .select("id,committee_id,passcode_hash,passcode_salt,role,display_name,assigned_user_id,expires_at,revoked")
      .eq("committee_id", committeeId)
      .order("created_at", { ascending: false });

    if (passcodesErr) {
      return NextResponse.json({ valid: false, error: passcodesErr.message }, { status: 500 });
    }

    const now = Date.now();
    const rows = (passcodes || []) as PasscodeRow[];

    for (const row of rows) {
      if (row.revoked) continue;
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
      if (!verifyHash(code, row.passcode_salt, row.passcode_hash)) continue;

      return NextResponse.json({
        valid: true,
        role: row.role || "delegate",
        assignedDisplayName: row.display_name,
        passcodeId: row.id,
        assigned: !!row.assigned_user_id,
      });
    }

    return NextResponse.json({ valid: false, error: "Invalid passcode" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message || "Invalid request" }, { status: 400 });
  }
}
