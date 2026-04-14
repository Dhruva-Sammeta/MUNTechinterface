import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PasscodeRow = {
  id: string;
  committee_id: string;
  display_name: string | null;
  passcode_plain?: string | null;
  role: string;
  created_at: string;
  expires_at: string | null;
  assigned_user_id: string | null;
  is_persistent: boolean;
  revoked: boolean;
  assigned_at: string | null;
};

type AuditRow = {
  passcode_id: string | null;
  details: Record<string, unknown> | null;
};

export async function GET(req: Request) {
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

    const withPlainResult = await supabaseAdmin
      .from("delegate_passcodes")
      .select("id,committee_id,display_name,passcode_plain,role,created_at,expires_at,assigned_user_id,is_persistent,revoked,assigned_at")
      .order("created_at", { ascending: false })
      .limit(200);

    let passcodes = withPlainResult.data as unknown[] | null;
    let error = withPlainResult.error;

    // Backward compatibility for databases that do not have passcode_plain yet.
    if (error && /passcode_plain/i.test(error.message || "")) {
      const legacyResult = await supabaseAdmin
        .from("delegate_passcodes")
        .select("id,committee_id,display_name,role,created_at,expires_at,assigned_user_id,is_persistent,revoked,assigned_at")
        .order("created_at", { ascending: false })
        .limit(200);
      passcodes = legacyResult.data as unknown[] | null;
      error = legacyResult.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (passcodes || []) as PasscodeRow[];
    const passcodeIds = rows.map((r) => r.id).filter(Boolean);
    const passcodeById = new Map<string, string>();

    if (passcodeIds.length > 0) {
      const { data: auditRows } = await supabaseAdmin
        .from("passcode_audit")
        .select("passcode_id,details")
        .eq("action", "create")
        .in("passcode_id", passcodeIds)
        .order("created_at", { ascending: false })
        .limit(500);

      for (const row of ((auditRows || []) as AuditRow[])) {
        if (!row.passcode_id || passcodeById.has(row.passcode_id)) continue;
        const fromAudit = row.details?.passcode;
        if (typeof fromAudit === "string" && fromAudit.trim()) {
          passcodeById.set(row.passcode_id, fromAudit.trim().toUpperCase());
        }
      }
    }

    const hydrated = rows.map((row) => ({
      ...row,
      passcode_plain: row.passcode_plain ?? passcodeById.get(row.id) ?? null,
    }));

    return NextResponse.json({ passcodes: hydrated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
