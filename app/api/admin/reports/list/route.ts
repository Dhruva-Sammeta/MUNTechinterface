import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/server/supabaseAdmin";

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
    return NextResponse.json({ reports: [] });
  } catch (error: any) {
    if (error?.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error?.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message || "Failed to list reports" }, { status: 500 });
  }
}
