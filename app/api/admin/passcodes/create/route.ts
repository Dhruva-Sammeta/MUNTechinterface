import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

const PASSCODE_REGEX = /^[A-Z0-9_-]{4,24}$/;

type ExistingPasscodeRow = {
  passcode_hash: string;
  passcode_salt: string;
};

function normalizePasscode(input: unknown): string | null {
  const normalized = String(input || "").trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function isValidPasscode(passcode: string) {
  return PASSCODE_REGEX.test(passcode);
}

function derivePasscodeHash(passcode: string, salt: string) {
  return crypto.pbkdf2Sync(passcode, salt, 310000, 32, "sha256").toString("hex");
}

function makeCommitteePrefix(shortName: string | null | undefined) {
  const raw = String(shortName || "CMT").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const trimmed = raw.slice(0, 8);
  return trimmed.length ? trimmed : "CMT";
}

function generateCandidate(prefix: string) {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${suffix}`;
}

function passcodeExists(passcode: string, existing: ExistingPasscodeRow[]) {
  for (const row of existing) {
    const derived = derivePasscodeHash(passcode, row.passcode_salt);
    if (derived === row.passcode_hash) return true;
  }
  return false;
}

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

    const { data: committee, error: committeeError } = await supabaseAdmin
      .from("committees")
      .select("short_name")
      .eq("id", committeeId)
      .maybeSingle();
    if (committeeError || !committee) {
      return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
    }

    const allowedRoles = new Set(["delegate", "eb"]);
    const normalizedRole = String(role || "delegate").toLowerCase();
    if (!allowedRoles.has(normalizedRole)) {
      return NextResponse.json({ error: "Role must be delegate or eb" }, { status: 400 });
    }

    const { data: existingPasscodes, error: existingError } = await supabaseAdmin
      .from("delegate_passcodes")
      .select("passcode_hash, passcode_salt")
      .eq("committee_id", committeeId);
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existing = (existingPasscodes || []) as ExistingPasscodeRow[];

    const normalizedInput = normalizePasscode(passcode);
    let plain: string;

    if (normalizedInput) {
      if (!isValidPasscode(normalizedInput)) {
        return NextResponse.json(
          {
            error:
              "Invalid passcode format. Use 4-24 chars: A-Z, 0-9, underscore, or hyphen.",
          },
          { status: 400 },
        );
      }
      if (passcodeExists(normalizedInput, existing)) {
        return NextResponse.json(
          { error: "This passcode already exists for the selected committee" },
          { status: 409 },
        );
      }
      plain = normalizedInput;
    } else {
      const prefix = makeCommitteePrefix(committee.short_name);
      let generated: string | null = null;
      for (let i = 0; i < 20; i++) {
        const candidate = generateCandidate(prefix);
        if (!passcodeExists(candidate, existing)) {
          generated = candidate;
          break;
        }
      }
      if (!generated) {
        return NextResponse.json(
          { error: "Could not generate a unique passcode. Try again." },
          { status: 500 },
        );
      }
      plain = generated;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = derivePasscodeHash(plain, salt);

    const insertObj: any = {
      committee_id: committeeId,
      passcode_hash: hash,
      passcode_salt: salt,
      passcode_plain: plain,
      display_name: displayName,
      role: normalizedRole,
      is_persistent: true,
    };
    if (expiresAt) insertObj.expires_at = expiresAt;

    let { error: insertError, data: inserted } = await supabaseAdmin
      .from("delegate_passcodes")
      .insert(insertObj)
      .select()
      .maybeSingle();

    // Backward compatibility for databases that do not have passcode_plain yet.
    if (insertError && /passcode_plain/i.test(insertError.message || "")) {
      const legacyInsert = { ...insertObj };
      delete legacyInsert.passcode_plain;
      const retry = await supabaseAdmin
        .from("delegate_passcodes")
        .insert(legacyInsert)
        .select()
        .maybeSingle();
      insertError = retry.error;
      inserted = retry.data;
    }

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // Audit log
    await supabaseAdmin.from("passcode_audit").insert({ action: "create", admin_user_id: adminUser.id, passcode_id: inserted.id, details: { display_name: displayName, role: normalizedRole, is_persistent: true, passcode: plain } });

    return NextResponse.json({ success: true, passcode: plain });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
