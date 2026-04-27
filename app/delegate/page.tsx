"use client";

import Link from "next/link";

export default function DelegateIndexPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white p-4">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-[0_30px_120px_rgba(15,180,255,0.15)] backdrop-blur-md">
        <h1 className="text-3xl font-bold mb-4">Delegate Dashboard</h1>
        <p className="mb-4 text-sm text-white/70">
          This page is a placeholder for delegate access. If you were redirected here automatically, choose your committee again or return to the login page.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-sapphire-500 px-5 py-3 text-sm font-semibold text-white hover:bg-sapphire-400 transition">
            Return to login
          </Link>
        </div>
      </div>
    </div>
  );
}
