import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { normalizeCode } from "@/lib/server/passcodes";

function adminCodeValid(input: unknown): boolean {
  const code = normalizeCode(input);
  const envCode = normalizeCode(process.env.ADMIN_PASSCODE || "86303");
  return !!code && code === envCode;
}

export async function POST(req: Request) {
  try {
    const admin = createSupabaseAdmin();
    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const requestedCommitteeId = typeof body?.committeeId === "string" ? body.committeeId : null;

    let userId: string | null = null;
    let bootstrapCredentials: { email: string; password: string } | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: userError,
      } = await admin.auth.getUser(token);
      if (userError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = user.id;
    } else {
      if (!adminCodeValid(body?.adminCode)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const email = process.env.ADMIN_BOOTSTRAP_EMAIL || "bootstrap-admin@sapphiremun.local";
      const password = crypto.randomBytes(18).toString("base64url");

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError && !/already|exists|registered/i.test(createError.message || "")) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      if (created?.user?.id) {
        userId = created.user.id;
      } else {
        const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

        const existing = usersPage.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
        if (!existing?.id) {
          return NextResponse.json({ error: "Could not resolve bootstrap user" }, { status: 500 });
        }
        userId = existing.id;

        const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      bootstrapCredentials = { email, password };
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existingDelegate } = await admin
      .from("delegates")
      .select("id,committee_id")
      .eq("user_id", userId)
      .maybeSingle();

    let committeeId = existingDelegate?.committee_id || requestedCommitteeId;
    if (!committeeId) {
      const { data: firstCommittee } = await admin
        .from("committees")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      committeeId = firstCommittee?.id || null;
    }

    if (!committeeId) {
      return NextResponse.json({ error: "No committee configured" }, { status: 400 });
    }

    if (existingDelegate?.id) {
      const { error: updateError } = await admin
        .from("delegates")
        .update({ role: "admin", has_logged_in: true })
        .eq("id", existingDelegate.id);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    } else {
      const { error: insertError } = await admin.from("delegates").insert({
        user_id: userId,
        committee_id: committeeId,
        display_name: "Secretariat Admin",
        country: "Secretariat",
        role: "admin",
        has_logged_in: true,
      });
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bootstrapCredentials });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Bootstrap failed" }, { status: 500 });
  }
}
