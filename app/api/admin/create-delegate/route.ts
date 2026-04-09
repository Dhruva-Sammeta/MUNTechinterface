import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
    const { email, password, displayName, country, committeeId, role } = await req.json();

    if (!email || !password || !displayName || !committeeId || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 3. Create Auth User
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for conference ease
      user_metadata: { display_name: displayName },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    const newUser = userData.user;

    // 4. Create Delegate Record
    // Check if a delegate record for this user already exists (shouldn't)
    const { error: insertError } = await supabaseAdmin.from("delegates").insert({
      user_id: newUser.id,
      committee_id: committeeId,
      display_name: displayName,
      country: country || displayName,
      role: role,
    });

    if (insertError) {
      // Cleanup: delete the auth user if delegate creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: newUser.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
