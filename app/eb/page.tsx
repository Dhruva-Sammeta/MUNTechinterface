"use client";

import Link from "next/link";

export default function EbIndexPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#151e45_0%,#060b1f_45%,#050510_100%)] text-white p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-10 shadow-[0_30px_120px_rgba(15,180,255,0.15)] backdrop-blur-2xl">
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/50 mb-2">SAPPHIRE MUN</p>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">EB Command Center</h1>
        <p className="mb-6 text-sm md:text-base text-white/70 max-w-2xl">
          Open a committee-specific EB console using the committee route, or sign in again to load your assigned command view.
        </p>

        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 mb-5">
          <p className="text-xs text-white/60 uppercase tracking-[0.18em] mb-2">Route format</p>
          <p className="font-mono text-sapphire-200 text-sm">/eb/&lt;committeeId&gt;</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/join" className="inline-flex items-center justify-center rounded-xl bg-sapphire-500 px-5 py-3 text-sm font-semibold text-white hover:bg-sapphire-400 transition">
            Join Committee
          </Link>
          <Link href="/login" className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition">
            Open Login
          </Link>
          <Link href="/admin" className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition">
            Go to Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
