import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  HARDCODED_ADMIN_PASSCODE,
  normalizePasscodeInput,
} from "@/lib/auth/passcodes";

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const requestedCommitteeId =
      typeof body?.committeeId === "string" ? body.committeeId : null;
    const adminCode = normalizePasscodeInput(body?.adminCode);
    const envAdminPass = normalizePasscodeInput(process.env.ADMIN_PASSCODE);
    const validAdminCode =
      adminCode === HARDCODED_ADMIN_PASSCODE ||
      (!!envAdminPass && adminCode === envAdminPass);

    let userId: string | null = null;
    let bootstrapCredentials: { email: string; password: string } | null = null;
    let existingDelegate:
      | { id: string; committee_id: string; role: string }
      | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;

      const { data: delegate, error: delegateErr } = await supabaseAdmin
        .from("delegates")
        .select("id,committee_id,role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (delegateErr) {
        return NextResponse.json({ error: delegateErr.message }, { status: 500 });
      }

      existingDelegate = (delegate as { id: string; committee_id: string; role: string } | null) ?? null;
      const alreadyAdmin = existingDelegate?.role === "admin";

      // Authenticated users must already be admin, unless a valid admin code is provided.
      if (!alreadyAdmin && !validAdminCode) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // Fallback path for admin entry from picker when anonymous auth is disabled.
      if (!validAdminCode) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "bootstrap-admin@sapphiremun.local";
      const bootstrapPassword = crypto.randomBytes(18).toString("base64url");

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: bootstrapEmail,
        password: bootstrapPassword,
        email_confirm: true,
      });

      if (createErr && !/already|exists|registered/i.test(createErr.message || "")) {
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }

      if (created?.user?.id) {
        userId = created.user.id;
      } else {
        const { data: usersPage, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
        const existing = usersPage?.users?.find((u) => u.email?.toLowerCase() === bootstrapEmail.toLowerCase());
        if (!existing?.id) {
          return NextResponse.json({ error: "Failed to locate bootstrap admin user" }, { status: 500 });
        }
        userId = existing.id;
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: bootstrapPassword,
          email_confirm: true,
        });
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      bootstrapCredentials = {
        email: bootstrapEmail,
        password: bootstrapPassword,
      };

      const { data: delegate, error: delegateErr } = await supabaseAdmin
        .from("delegates")
        .select("id,committee_id,role")
        .eq("user_id", userId)
        .maybeSingle();
      if (delegateErr) {
        return NextResponse.json({ error: delegateErr.message }, { status: 500 });
      }
      existingDelegate = (delegate as { id: string; committee_id: string; role: string } | null) ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Keep existing committee when possible; otherwise fall back to selected committee
    // or the first available committee.
    let committeeId = existingDelegate?.committee_id ?? requestedCommitteeId;
    if (!committeeId) {
      const { data: firstCommittee } = await supabaseAdmin
        .from("committees")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      committeeId = firstCommittee?.id ?? null;
    }

    if (!committeeId) {
      return NextResponse.json(
        { error: "No committee exists to attach admin user" },
        { status: 400 },
      );
    }

    if (existingDelegate?.id) {
      const { error } = await supabaseAdmin
        .from("delegates")
        .update({
          role: "admin",
          has_logged_in: true,
        })
        .eq("id", existingDelegate.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabaseAdmin.from("delegates").insert({
        user_id: userId,
        committee_id: committeeId,
        display_name: "Secretariat Admin",
        country: "Secretariat",
        role: "admin",
        has_logged_in: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bootstrapCredentials });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
