import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { listCommitteePasscodes, matchesCode, normalizeCode } from "@/lib/server/passcodes";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const admin = createSupabaseAdmin();
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const code = normalizeCode(body?.code);
    const committeeJoinCode = normalizeCode(body?.committeeJoinCode);
    const displayName = String(body?.displayName || "").trim();

    if (!code || !committeeJoinCode) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: committee, error: committeeError } = await admin
      .from("committees")
      .select("id")
      .eq("join_code", committeeJoinCode)
      .maybeSingle();

    if (committeeError || !committee?.id) {
      return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
    }

    const rows = await listCommitteePasscodes(committee.id);
    const now = Date.now();

    let matched = null as (typeof rows)[number] | null;
    if (code === committeeJoinCode) {
      matched = {
        id: "DIRECT_JOIN",
        committee_id: committee.id,
        passcode_plain: committeeJoinCode,
        passcode_hash: "",
        passcode_salt: "",
        role: "delegate",
        display_name: displayName || "Delegate",
        assigned_user_id: null,
        assigned_at: null,
        expires_at: null,
        revoked: false,
      };
    } else if (code === `${committeeJoinCode}_EB`) {
      matched = {
        id: "DIRECT_JOIN_EB",
        committee_id: committee.id,
        passcode_plain: `${committeeJoinCode}_EB`,
        passcode_hash: "",
        passcode_salt: "",
        role: "eb",
        display_name: displayName || "Executive Board",
        assigned_user_id: null,
        assigned_at: null,
        expires_at: null,
        revoked: false,
      };
    }

    if (!matched) {
      for (const row of rows) {
        if (row.revoked) continue;
        if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
        if (!matchesCode(code, row)) continue;
        matched = row;
        break;
      }
    }

    if (!matched) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 400 });
    }

    const { data: existingDelegate, error: existingDelegateError } = await admin
      .from("delegates")
      .select("id, committee_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingDelegateError) {
      return NextResponse.json({ error: existingDelegateError.message }, { status: 500 });
    }

    let delegateId = existingDelegate?.id || null;

    if (delegateId) {
      if (matched.assigned_user_id && matched.assigned_user_id !== delegateId) {
        return NextResponse.json({ error: "Passcode already assigned" }, { status: 403 });
      }

      const { error: updateError } = await admin
        .from("delegates")
        .update({
          committee_id: matched.committee_id,
          display_name: displayName || matched.display_name,
          country: displayName || matched.display_name,
          role: matched.role,
          has_logged_in: true,
        })
        .eq("id", delegateId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("delegates")
        .insert({
          user_id: user.id,
          committee_id: matched.committee_id,
          display_name: displayName || matched.display_name,
          country: displayName || matched.display_name,
          role: matched.role,
          has_logged_in: true,
        })
        .select("id")
        .maybeSingle();

      if (insertError || !inserted?.id) {
        return NextResponse.json({ error: insertError?.message || "Failed to create delegate" }, { status: 500 });
      }
      delegateId = inserted.id;
    }

    if (!matched.id.startsWith("DIRECT_JOIN")) {
      const { error: assignError } = await admin
        .from("delegate_passcodes")
        .update({ assigned_user_id: delegateId, assigned_at: new Date().toISOString() })
        .eq("id", matched.id);

      if (assignError) {
        return NextResponse.json({ error: assignError.message }, { status: 500 });
      }

      await admin.from("passcode_audit").insert({
        action: "claim",
        delegate_id: delegateId,
        passcode_id: matched.id,
        details: { user_id: user.id },
      });
    }

    return NextResponse.json({ success: true, role: matched.role, committeeId: matched.committee_id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Claim failed" }, { status: 500 });
  }
}
