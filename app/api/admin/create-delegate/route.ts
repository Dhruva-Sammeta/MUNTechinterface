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

// We use the SERVICE_ROLE_KEY to bypass RLS and create/manage auth users.
// This key should NEVER be exposed to the browser.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Verify that the caller is an admin
    // To do this properly, we need the caller's auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize another client to verify the user's session
    const { data: { user: adminUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !adminUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Double check 'delegates' table for admin role
    const { data: adminDelegate, error: delegateError } = await supabaseAdmin
      .from("delegates")
      .select("role")
      .eq("user_id", adminUser.id)
      .maybeSingle();

    if (delegateError || adminDelegate?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { email, password, displayName, country, committeeId, role, passcode, createDelegateNow } = body;

    if (!displayName || !committeeId || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // If registering a regular delegate/EB: create a passcode and optionally a temp auth user.
    if (role === "delegate" || role === "eb") {
      const { data: committee, error: committeeError } = await supabaseAdmin
        .from("committees")
        .select("short_name")
        .eq("id", committeeId)
        .maybeSingle();
      if (committeeError || !committee) {
        return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
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
        role: role || "delegate",
        is_persistent: true,
      };

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
      await supabaseAdmin.from("passcode_audit").insert({ action: "create", admin_user_id: adminUser.id, passcode_id: inserted.id, details: { display_name: displayName, role: role || "delegate", passcode: plain } });

      // Optionally create an auth user (temp credentials) but DO NOT create a delegate row yet.
      if (email && password) {
        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName },
        });
        if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
        return NextResponse.json({ success: true, passcode: plain, tempCredentials: { email, password }, userId: userData.user.id });
      }

      return NextResponse.json({ success: true, passcode: plain });
    }

    // Otherwise (admin/secretariat/etc): create auth user + delegate row immediately
    if (!email || !password) return NextResponse.json({ error: "Email and password required for admin accounts" }, { status: 400 });

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

    const newUser = userData.user;

    const { error: insertError2 } = await supabaseAdmin.from("delegates").insert({
      user_id: newUser.id,
      committee_id: committeeId,
      display_name: displayName,
      country: country || displayName,
      role: role,
      has_logged_in: true,
    });

    if (insertError2) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return NextResponse.json({ error: insertError2.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: newUser.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
