import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const code = String(body?.code || "").toUpperCase();
    const committeeJoinCode = body?.committeeJoinCode
      ? String(body.committeeJoinCode).toUpperCase()
      : null;

    if (!code) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    // Match committee join code
    if (committeeJoinCode && code === committeeJoinCode) {
      return NextResponse.json({ valid: true, role: "delegate" });
    }

    // Match EB code
    if (committeeJoinCode && code === `${committeeJoinCode}_EB`) {
      return NextResponse.json({ valid: true, role: "eb" });
    }

    // Match admin passcode from server env only
    const adminPass = process.env.ADMIN_PASSCODE;
    if (adminPass && code === String(adminPass).toUpperCase()) {
      return NextResponse.json({ valid: true, role: "admin" });
    }

    return NextResponse.json({ valid: false });
  } catch (err) {
    return NextResponse.json({ valid: false, error: "bad request" }, { status: 400 });
  }
}
