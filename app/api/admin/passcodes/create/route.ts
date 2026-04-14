import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  derivePasscodeHash,
  generateSalt,
  generateUniqueCommitteeCode,
  isValidCode,
  listCommitteePasscodes,
  matchesCode,
  normalizeCode,
} from "@/lib/server/passcodes";

async function ensureAdminUser(accessToken: string) {
  const admin = createSupabaseAdmin();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);
  if (userError || !user) return null;

  const { data: delegate, error: delegateError } = await admin
    .from("delegates")
    .select("id,role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (delegateError || delegate?.role !== "admin") return null;
  return { user, delegate };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminSession = await ensureAdminUser(authHeader.replace("Bearer ", ""));
    if (!adminSession) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const committeeId = String(body?.committeeId || "");
    const displayName = String(body?.displayName || "").trim();
    const role = String(body?.role || "delegate").toLowerCase();
    const expiresAt = body?.expiresAt ? String(body.expiresAt) : null;
    const customCode = normalizeCode(body?.passcode);

    if (!committeeId || !displayName) {
      return NextResponse.json({ error: "committeeId and displayName are required" }, { status: 400 });
    }
    if (role !== "delegate" && role !== "eb") {
      return NextResponse.json({ error: "role must be delegate or eb" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: committee, error: committeeError } = await admin
      .from("committees")
      .select("short_name")
      .eq("id", committeeId)
      .maybeSingle();

    if (committeeError || !committee) {
      return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
    }

    const existing = await listCommitteePasscodes(committeeId);

    let plainCode = customCode;
    if (plainCode) {
      if (!isValidCode(plainCode)) {
        return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
      }
      if (existing.some((item) => matchesCode(plainCode!, item))) {
        return NextResponse.json({ error: "Code already exists" }, { status: 409 });
      }
    } else {
      plainCode = await generateUniqueCommitteeCode(committeeId, committee.short_name, existing);
    }

    const salt = generateSalt();
    const hash = derivePasscodeHash(plainCode, salt);

    const insertObj: Record<string, unknown> = {
      committee_id: committeeId,
      passcode_hash: hash,
      passcode_salt: salt,
      passcode_plain: plainCode,
      display_name: displayName,
      role,
      revoked: false,
      is_persistent: true,
    };
    if (expiresAt) insertObj.expires_at = expiresAt;

    let inserted = await admin.from("delegate_passcodes").insert(insertObj).select("id").maybeSingle();

    if (inserted.error && /passcode_plain/i.test(inserted.error.message || "")) {
      const legacyInsert = { ...insertObj };
      delete legacyInsert.passcode_plain;
      inserted = await admin.from("delegate_passcodes").insert(legacyInsert).select("id").maybeSingle();
    }

    if (inserted.error || !inserted.data?.id) {
      return NextResponse.json({ error: inserted.error?.message || "Insert failed" }, { status: 500 });
    }

    await admin.from("passcode_audit").insert({
      action: "create",
      admin_user_id: adminSession.user.id,
      passcode_id: inserted.data.id,
      details: { passcode: plainCode, display_name: displayName, role, expires_at: expiresAt },
    });

    return NextResponse.json({ success: true, passcode: plainCode, passcodeId: inserted.data.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Create failed" }, { status: 500 });
  }
}
