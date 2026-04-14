import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";

async function ensureAdmin(accessToken: string) {
  const admin = createSupabaseAdmin();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);
  if (userError || !user) return null;

  const { data: delegate } = await admin
    .from("delegates")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (delegate?.role !== "admin") return null;
  return user.id;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminUserId = await ensureAdmin(authHeader.replace("Bearer ", ""));
    if (!adminUserId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const committeeId = searchParams.get("committeeId");

    const admin = createSupabaseAdmin();
    const withPlain = await admin
      .from("delegate_passcodes")
      .select("id,committee_id,display_name,passcode_plain,role,created_at,expires_at,assigned_user_id,assigned_at,is_persistent,revoked")
      .order("created_at", { ascending: false })
      .limit(500);

    let rows = withPlain.data as any[] | null;
    let error = withPlain.error;

    if (error && /passcode_plain/i.test(error.message || "")) {
      const legacy = await admin
        .from("delegate_passcodes")
        .select("id,committee_id,display_name,role,created_at,expires_at,assigned_user_id,assigned_at,is_persistent,revoked")
        .order("created_at", { ascending: false })
        .limit(500);
      rows = legacy.data as any[] | null;
      error = legacy.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filtered = (rows || []).filter((item) => !committeeId || item.committee_id === committeeId);
    const ids = filtered.map((item) => item.id).filter(Boolean);

    const audit = ids.length
      ? await admin
          .from("passcode_audit")
          .select("passcode_id,details")
          .eq("action", "create")
          .in("passcode_id", ids)
          .order("created_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };

    if (audit.error) return NextResponse.json({ error: audit.error.message }, { status: 500 });

    const byId = new Map<string, string>();
    for (const row of (audit.data || []) as any[]) {
      const value = row?.details?.passcode;
      if (row?.passcode_id && typeof value === "string" && value.trim() && !byId.has(row.passcode_id)) {
        byId.set(row.passcode_id, value.trim().toUpperCase());
      }
    }

    const passcodes = filtered.map((row) => ({
      ...row,
      passcode_plain: row.passcode_plain || byId.get(row.id) || null,
    }));

    return NextResponse.json({ passcodes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "List failed" }, { status: 500 });
  }
}
