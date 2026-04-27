import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const body = await req.json();
    const reportId = String(body?.reportId || "").trim();

    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }

    return NextResponse.json({ success: true, skipped: true });
  } catch (error: any) {
    if (error?.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error?.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message || "Failed to resolve report" }, { status: 500 });
  }
}
