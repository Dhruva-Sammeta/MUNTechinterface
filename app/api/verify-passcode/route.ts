import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { listCommitteePasscodes, matchesCode, normalizeCode } from "@/lib/server/passcodes";

function getAdminCode(): string {
  return normalizeCode(process.env.ADMIN_PASSCODE || "86303");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const code = normalizeCode(body?.code);
    const committeeJoinCode = normalizeCode(body?.committeeJoinCode);

    if (!code) {
      return NextResponse.json({ valid: false, error: "Missing code" }, { status: 400 });
    }

    if (code === getAdminCode()) {
      return NextResponse.json({ valid: true, role: "admin" });
    }

    if (!committeeJoinCode) {
      return NextResponse.json({ valid: false, error: "Committee required" }, { status: 400 });
    }

    if (code === committeeJoinCode) {
      return NextResponse.json({ valid: true, role: "delegate", passcodeId: null, assigned: false });
    }
    if (code === `${committeeJoinCode}_EB`) {
      return NextResponse.json({ valid: true, role: "eb", passcodeId: null, assigned: false });
    }

    const admin = createSupabaseAdmin();
    const { data: committee, error: committeeError } = await admin
      .from("committees")
      .select("id")
      .eq("join_code", committeeJoinCode)
      .maybeSingle();

    if (committeeError || !committee?.id) {
      return NextResponse.json({ valid: false, error: "Invalid committee" }, { status: 400 });
    }

    const rows = await listCommitteePasscodes(committee.id);
    const now = Date.now();

    for (const row of rows) {
      if (row.revoked) continue;
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
      if (!matchesCode(code, row)) continue;

      return NextResponse.json({
        valid: true,
        role: row.role || "delegate",
        passcodeId: row.id,
        assignedDisplayName: row.display_name,
        assigned: !!row.assigned_user_id,
      });
    }

    return NextResponse.json({ valid: false, error: "Invalid passcode" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ valid: false, error: error.message || "Verify failed" }, { status: 500 });
  }
}
