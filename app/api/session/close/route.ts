import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  return header.replace("Bearer ", "").trim() || null;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const bodyToken = typeof body?.token === "string" ? body.token.trim() : "";
    const token = extractBearer(req) || bodyToken || null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("delegates")
      .update({ has_logged_in: false })
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to close session" }, { status: 500 });
  }
}
