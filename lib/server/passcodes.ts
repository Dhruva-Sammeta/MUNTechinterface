import crypto from "crypto";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export type PasscodeRow = {
  id: string;
  committee_id: string;
  passcode_plain: string | null;
  passcode_hash: string;
  passcode_salt: string;
  role: "delegate" | "eb" | "admin";
  display_name: string;
  assigned_user_id: string | null;
  assigned_at: string | null;
  expires_at: string | null;
  revoked: boolean | null;
};

export const PASSCODE_REGEX = /^[A-Z0-9_-]{4,24}$/;

export function normalizeCode(input: unknown): string {
  return String(input || "").trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return PASSCODE_REGEX.test(code);
}

export function derivePasscodeHash(code: string, salt: string): string {
  return crypto.pbkdf2Sync(code, salt, 310000, 32, "sha256").toString("hex");
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function makeCommitteePrefix(shortName: string | null | undefined): string {
  const raw = String(shortName || "CMT")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return raw.slice(0, 8) || "CMT";
}

export function generateCandidate(prefix: string): string {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${suffix}`;
}

export function matchesCode(code: string, row: PasscodeRow): boolean {
  if (row.passcode_plain && row.passcode_plain === code) return true;
  if (!row.passcode_hash || !row.passcode_salt) return false;
  try {
    return derivePasscodeHash(code, row.passcode_salt) === row.passcode_hash;
  } catch {
    return false;
  }
}

export async function listCommitteePasscodes(committeeId: string): Promise<PasscodeRow[]> {
  const admin = createSupabaseAdmin();

  const withPlain = await admin
    .from("delegate_passcodes")
    .select(
      "id,committee_id,passcode_plain,passcode_hash,passcode_salt,role,display_name,assigned_user_id,assigned_at,expires_at,revoked"
    )
    .eq("committee_id", committeeId)
    .order("created_at", { ascending: false });

  let rows = (withPlain.data || []) as PasscodeRow[];
  let error = withPlain.error;

  if (error && /passcode_plain/i.test(error.message || "")) {
    const legacy = await admin
      .from("delegate_passcodes")
      .select(
        "id,committee_id,passcode_hash,passcode_salt,role,display_name,assigned_user_id,assigned_at,expires_at,revoked"
      )
      .eq("committee_id", committeeId)
      .order("created_at", { ascending: false });
    rows = (legacy.data || []) as PasscodeRow[];
    error = legacy.error;
  }

  if (error) throw new Error(error.message);

  const ids = rows.map((row) => row.id);
  if (!ids.length) return rows;

  const audit = await admin
    .from("passcode_audit")
    .select("passcode_id,details")
    .eq("action", "create")
    .in("passcode_id", ids)
    .order("created_at", { ascending: false })
    .limit(1000);

  const byId = new Map<string, string>();
  for (const item of (audit.data || []) as any[]) {
    const value = item?.details?.passcode;
    if (item?.passcode_id && typeof value === "string" && value.trim()) {
      byId.set(item.passcode_id, value.trim().toUpperCase());
    }
  }

  return rows.map((row) => ({
    ...row,
    passcode_plain: row.passcode_plain || byId.get(row.id) || null,
  }));
}

export async function generateUniqueCommitteeCode(
  committeeId: string,
  committeeShortName: string,
  existingRows: PasscodeRow[]
): Promise<string> {
  const prefix = makeCommitteePrefix(committeeShortName);
  for (let i = 0; i < 30; i += 1) {
    const candidate = generateCandidate(prefix);
    const exists = existingRows.some((row) => matchesCode(candidate, row));
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique passcode");
}
