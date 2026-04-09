import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

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
      const plain = passcode && String(passcode).trim().length > 0
        ? String(passcode).trim().toUpperCase()
        : Math.random().toString(36).slice(-6).toUpperCase();

      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.pbkdf2Sync(plain, salt, 310000, 32, "sha256").toString("hex");

      const insertObj: any = {
        committee_id: committeeId,
        passcode_hash: hash,
        passcode_salt: salt,
        display_name: displayName,
        role: role || "delegate",
        is_persistent: true,
      };

      const { error: insertError, data: inserted } = await supabaseAdmin
        .from("delegate_passcodes")
        .insert(insertObj)
        .select()
        .maybeSingle();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

      // Audit log
      await supabaseAdmin.from("passcode_audit").insert({ action: "create", admin_user_id: adminUser.id, passcode_id: inserted.id, details: { display_name: displayName, role: role || "delegate" } });

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
