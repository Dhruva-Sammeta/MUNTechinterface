import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

type PasscodeRow = {
  id: string;
  committee_id: string;
  passcode_plain: string | null;
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

function matchesPasscode(code: string, row: PasscodeRow) {
  if (row.passcode_plain && row.passcode_plain === code) return true;
  if (!row.passcode_hash || !row.passcode_salt) return false;
  try {
    return verifyHash(code, row.passcode_salt, row.passcode_hash);
  } catch {
    return false;
  }
}

async function hydratePasscodePlainFromAudit(supabaseAdmin: any, rows: PasscodeRow[]) {
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return rows;

  const { data: auditRows } = await supabaseAdmin
    .from("passcode_audit")
    .select("passcode_id,details")
    .eq("action", "create")
    .in("passcode_id", ids)
    .order("created_at", { ascending: false })
    .limit(500);

  const passcodeMap = new Map<string, string>();
  for (const audit of (auditRows || []) as any[]) {
    const passcodeValue = audit.details?.passcode;
    if (audit.passcode_id && typeof passcodeValue === "string" && passcodeValue.trim()) {
      passcodeMap.set(audit.passcode_id, passcodeValue.trim().toUpperCase());
    }
  }

  return rows.map((row) => ({
    ...row,
    passcode_plain: row.passcode_plain || passcodeMap.get(row.id) || null,
  }));
}

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
    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const code = normalize(body?.code);
    const committeeJoinCode = normalize(body?.committeeJoinCode);
    const displayName = String(body?.displayName || "").trim();
    const country = String(body?.country || "").trim();

    if (!code || !committeeJoinCode) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: committee, error: committeeErr } = await supabaseAdmin
      .from("committees")
      .select("id")
      .eq("join_code", committeeJoinCode)
      .maybeSingle();
    if (committeeErr || !committee?.id) {
      return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
    }

    const committeeId = committee.id as string;

    const withPlainResult = await supabaseAdmin
      .from("delegate_passcodes")
      .select("id,committee_id,passcode_plain,passcode_hash,passcode_salt,role,display_name,assigned_user_id,expires_at,revoked")
      .eq("committee_id", committeeId)
      .order("created_at", { ascending: false });

    let passcodes: PasscodeRow[] | null = withPlainResult.data as PasscodeRow[] | null;
    let passcodesErr = withPlainResult.error;

    if (passcodesErr && /passcode_plain/i.test(passcodesErr.message || "")) {
      const legacyResult = await supabaseAdmin
        .from("delegate_passcodes")
        .select("id,committee_id,passcode_hash,passcode_salt,role,display_name,assigned_user_id,expires_at,revoked")
        .eq("committee_id", committeeId)
        .order("created_at", { ascending: false });
      passcodes = legacyResult.data as PasscodeRow[] | null;
      passcodesErr = legacyResult.error;
    }

    if (passcodesErr) {
      return NextResponse.json({ error: passcodesErr.message }, { status: 500 });
    }

    const rows = await hydratePasscodePlainFromAudit(supabaseAdmin, (passcodes || []) as PasscodeRow[]);
    const now = Date.now();
    let matched: PasscodeRow | null = null;

    for (const row of rows) {
      if (row.revoked) continue;
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
      if (!matchesPasscode(code, row)) continue;
      matched = row;
      break;
    }

    if (!matched) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 400 });
    }

    const { data: existingDelegate, error: existingErr } = await supabaseAdmin
      .from("delegates")
      .select("id, committee_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    let delegateId: string | null = existingDelegate?.id ?? null;

    if (delegateId) {
      if (matched.assigned_user_id && matched.assigned_user_id !== delegateId) {
        return NextResponse.json({ error: "Passcode already assigned to another user" }, { status: 403 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from("delegates")
        .update({
          committee_id: matched.committee_id,
          display_name: displayName || matched.display_name,
          country: country || displayName || matched.display_name,
          role: matched.role || "delegate",
          has_logged_in: true,
        })
        .eq("id", delegateId);
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("delegates")
        .insert({
          user_id: user.id,
          committee_id: matched.committee_id,
          display_name: displayName || matched.display_name,
          country: country || displayName || matched.display_name,
          role: matched.role || "delegate",
          has_logged_in: true,
        })
        .select("id")
        .maybeSingle();
      if (insertErr || !inserted?.id) {
        return NextResponse.json({ error: insertErr?.message || "Failed to create delegate" }, { status: 500 });
      }
      delegateId = inserted.id;
    }

    const { error: assignErr } = await supabaseAdmin
      .from("delegate_passcodes")
      .update({ assigned_user_id: delegateId, assigned_at: new Date().toISOString() })
      .eq("id", matched.id);
    if (assignErr) {
      return NextResponse.json({ error: assignErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, role: matched.role || "delegate" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
