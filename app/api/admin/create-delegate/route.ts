import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAdminFromRequest } from "@/lib/server/supabaseAdmin";

const ALLOWED_ROLES = new Set(["delegate", "eb", "admin"]);

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const supabaseAdmin = createSupabaseAdmin();

    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const displayName = String(body?.displayName || "").trim();
    const country = String(body?.country || "").trim() || displayName;
    const committeeId = String(body?.committeeId || "").trim();
    const role = String(body?.role || "admin").trim().toLowerCase();

    if (!email || !password || !displayName || !committeeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: committee, error: committeeError } = await supabaseAdmin
      .from("committees")
      .select("id")
      .eq("id", committeeId)
      .maybeSingle();

    if (committeeError || !committee?.id) {
      return NextResponse.json({ error: "Invalid committee" }, { status: 400 });
    }

    let userId: string | null = null;

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createUserError && !/already|exists|registered/i.test(createUserError.message || "")) {
      return NextResponse.json({ error: createUserError.message }, { status: 500 });
    }

    if (createdUser?.user?.id) {
      userId = createdUser.user.id;
    } else {
      const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }

      const existing = usersPage?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!existing?.id) {
        return NextResponse.json({ error: "Failed to locate user" }, { status: 500 });
      }

      userId = existing.id;

      const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });

      if (updateUserError) {
        return NextResponse.json({ error: updateUserError.message }, { status: 500 });
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const { data: existingDelegate, error: existingDelegateError } = await supabaseAdmin
      .from("delegates")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingDelegateError) {
      return NextResponse.json({ error: existingDelegateError.message }, { status: 500 });
    }

    if (existingDelegate?.id) {
      const { error: updateDelegateError } = await supabaseAdmin
        .from("delegates")
        .update({
          committee_id: committeeId,
          display_name: displayName,
          country,
          role,
          has_logged_in: true,
        })
        .eq("id", existingDelegate.id);

      if (updateDelegateError) {
        return NextResponse.json({ error: updateDelegateError.message }, { status: 500 });
      }
    } else {
      const { error: insertDelegateError } = await supabaseAdmin.from("delegates").insert({
        user_id: userId,
        committee_id: committeeId,
        display_name: displayName,
        country,
        role,
        has_logged_in: true,
      });

      if (insertDelegateError) {
        return NextResponse.json({ error: insertDelegateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error?.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message || "Failed to create delegate" }, { status: 500 });
  }
}
