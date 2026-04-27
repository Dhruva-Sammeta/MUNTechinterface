"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Committee } from "@/lib/database.types";
import Link from "next/link";
import {
  HARDCODED_ADMIN_PASSCODE,
  HARDCODED_DEFAULT_DELEGATE_PASSCODE,
  HARDCODED_DEFAULT_EB_PASSCODE,
  getCommitteeHardcodedRoleForPasscode,
  getHardcodedRoleForPasscode,
} from "@/lib/auth/passcodes";

// Authentication is strictly hierarchical: Start as delegate, then escalate.

type LoginStep = "committee" | "passcode" | "delegation";

function resolveDefaultCommitteeForHardcodedLogin(
  committees: Committee[],
): Committee | null {
  if (!committees.length) return null;

  const byJoinCode = committees.find(
    (committee) =>
      String(committee.join_code || "").trim().toUpperCase() ===
      HARDCODED_DEFAULT_DELEGATE_PASSCODE,
  );
  if (byJoinCode) return byJoinCode;

  const byShortName = committees.find((committee) =>
    String(committee.short_name || "").trim().toUpperCase().includes("DISEC"),
  );
  if (byShortName) return byShortName;

  return committees[0] || null;
}

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [delegation, setDelegation] = useState("");
  const [step, setStep] = useState<LoginStep>("committee");
  const [matchedCommittee, setMatchedCommittee] = useState<Committee | null>(
    null,
  );
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [passcodeInfo, setPasscodeInfo] = useState<any>(null);
  const [adminEntry, setAdminEntry] = useState(false);

  // Initial load of committees
  useEffect(() => {
    let cancelled = false;
    const failSafe = window.setTimeout(() => {
      if (cancelled) return;
      setLoadingInitial(false);
      setError((prev) => prev || "Network is slow. You can still use Admin Code Login.");
    }, 7000);

    async function init() {
      try {
        const sb = createClient();
        const { data, error } = await sb.from("committees").select("*").order("name");
        if (error) throw error;
        if (!cancelled && data) setCommittees(data as Committee[]);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Unable to load committees. Check your connection and retry.");
        }
      } finally {
        if (!cancelled) {
          setLoadingInitial(false);
        }
        window.clearTimeout(failSafe);
      }
    }

    void init();

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
    };
  }, []);

  // Clear errors as user types
  useEffect(() => {
    setError("");
    setHint("");
  }, [passcode]);

  async function bootstrapAdmin(committeeId: string | null, adminCode: string) {
    const sb = createClient();
    const uid = await getOrCreateAnonSession();

    // Path A: existing authenticated session (anonymous or otherwise)
    if (uid) {
      const {
        data: { session },
      } = await sb.auth.getSession();
      const token = session?.access_token;
      if (token) {
        const res = await fetch("/api/admin/bootstrap-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ committeeId, adminCode }),
        });
        const data = await res.json();
        if (res.ok && data?.success) return true;
      }
    }

    // Path B: fallback bootstrap without prior session (for projects with anon auth disabled)
    const fallbackRes = await fetch("/api/admin/bootstrap-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ committeeId, adminCode }),
    });
    const fallbackData = await fallbackRes.json();
    if (!fallbackRes.ok || !fallbackData?.success) {
      setError(fallbackData?.error || "Admin bootstrap failed.");
      return false;
    }

    if (fallbackData?.bootstrapCredentials?.email && fallbackData?.bootstrapCredentials?.password) {
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: fallbackData.bootstrapCredentials.email,
        password: fallbackData.bootstrapCredentials.password,
      });
      if (signInError) {
        setError("Admin credentials created but sign-in failed. Try again.");
        return false;
      }
    }

    return true;
  }

  // ── Step 1: Validate passcode ─────────────────────────────────────────────
  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const code = passcode.trim().toUpperCase();

    // Hardcoded admin override path
    if (code === HARDCODED_ADMIN_PASSCODE) {
      try {
        const ok = await bootstrapAdmin(matchedCommittee?.id || null, code);
        if (!ok) {
          setLoading(false);
          return;
        }
        router.push("/admin");
      } catch {
        setError("Unable to initialize admin session. Try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const universalHardcodedMatch = committees.find((committee) =>
      getCommitteeHardcodedRoleForPasscode(code, committee.short_name),
    );

    const hardcodedRole =
      getHardcodedRoleForPasscode(code) ||
      (universalHardcodedMatch
        ? getCommitteeHardcodedRoleForPasscode(code, universalHardcodedMatch.short_name)
        : null);

    if (hardcodedRole) {
      const committeeForLogin =
        matchedCommittee ||
        universalHardcodedMatch ||
        resolveDefaultCommitteeForHardcodedLogin(committees);

      if (!committeeForLogin) {
        setError("No committee available for hardcoded login.");
        setLoading(false);
        return;
      }

      if (!matchedCommittee) {
        setMatchedCommittee(committeeForLogin);
      }

      setHint(
        hardcodedRole === "eb"
          ? "Hardcoded EB login accepted. Continue with your portfolio name."
          : "Hardcoded delegate login accepted. Continue with your delegation name.",
      );
      setPasscodeInfo({ valid: true, role: hardcodedRole, hardcoded: true });
      setStep("delegation");
      setLoading(false);
      return;
    }

    // Quick client-side checks for committee join / EB codes
    if (
      matchedCommittee &&
      (code === matchedCommittee.join_code ||
        code === `${matchedCommittee.join_code}_EB`)
    ) {
      setPasscodeInfo(null);
      setStep("delegation");
      setLoading(false);
      return;
    }

    // Verify server-side for admin and generated passcodes.
    try {
      if (!matchedCommittee && !adminEntry) {
        setError("Please select a committee first, or choose Admin Login.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          committeeJoinCode: matchedCommittee?.join_code,
        }),
      });
      const data = await res.json();

      if (res.ok && data?.valid && data?.role === "admin") {
        const ok = await bootstrapAdmin(matchedCommittee?.id || null, code);
        if (!ok) {
          setLoading(false);
          return;
        }
        router.push("/admin");
      } else if (res.ok && data?.valid) {
        if (!matchedCommittee) {
          setError("Select a committee before using delegate or EB codes.");
        } else if (data?.passcodeId) {
          const claimed = await claimPasscodeAndRoute(
            matchedCommittee,
            code,
            data?.assignedDisplayName,
          );
          if (!claimed) {
            return;
          }
        } else {
          setPasscodeInfo(data);
          setStep("delegation");
        }
      } else {
        setError("Invalid passcode. Enter your committee join code, EB code, or Admin code.");
      }
    } catch (err) {
      setError("Unable to verify passcode. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  // ── Shared: get or create an anonymous Supabase session (no email needed) ──
  async function getOrCreateAnonSession(): Promise<string | null> {
    const sb = createClient();
    const {
      data: { user: existing },
    } = await sb.auth.getUser();
    if (existing?.id) return existing.id;

    // Use Supabase anonymous sign-in — no email, no password
    const { data, error: err } = await sb.auth.signInAnonymously();
    if (err) {
      setError("Could not create session: " + err.message);
      return null;
    }
    return data.user?.id ?? null;
  }

  async function claimPasscodeAndRoute(
    committee: Committee,
    normalizedCode: string,
    assignedDisplayName?: string,
  ): Promise<boolean> {
    const sb = createClient();
    const uid = await getOrCreateAnonSession();
    if (!uid) return false;

    const {
      data: { session },
    } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not authenticated");
      return false;
    }

    const response = await fetch("/api/passcodes/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        code: normalizedCode,
        committeeJoinCode: committee.join_code,
        displayName: String(assignedDisplayName || "Delegate").trim() || "Delegate",
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      setError(payload?.error || "Passcode claim failed");
      return false;
    }

    const assignedRole = String(payload.role || "delegate");
    if (assignedRole === "delegate") {
      router.push(`/delegate/${committee.id}`);
    } else if (assignedRole === "eb") {
      router.push(`/eb/${committee.id}`);
    } else {
      router.push(`/admin`);
    }

    return true;
  }

  // ── Step 2: Delegate joins with delegation name ────────────────────────────
  async function handleDelegateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchedCommittee || !delegation.trim()) return;
    setLoading(true);
    setError("");

    if (passcodeInfo?.passcodeId) {
      const claimed = await claimPasscodeAndRoute(
        matchedCommittee,
        passcode.toUpperCase(),
        passcodeInfo?.assignedDisplayName || delegation.trim(),
      );
      if (!claimed) {
        setLoading(false);
      }
      return;
    }

    const sb = createClient();
    const uid = await getOrCreateAnonSession();
    if (!uid) {
      setLoading(false);
      return;
    }

    // For direct join and committee EB codes, role is determined from verification.
    let assignedRole = "delegate";
    try {
      const res = await fetch("/api/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: passcode.toUpperCase(), committeeJoinCode: matchedCommittee.join_code }),
      });
      const data = await res.json();
      if (res.ok && data?.valid) assignedRole = data.role || "delegate";
    } catch (err) {
      // keep assignedRole as delegate on failure
    }

    const payload = {
      committee_id: matchedCommittee.id,
      display_name: delegation.trim(),
      country: delegation.trim(),
      role: assignedRole,
      has_logged_in: true,
    };

    const { error } = await sb
      .from("delegates")
      .upsert({ user_id: uid, ...payload }, { onConflict: "user_id" });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Route based on role
    if (assignedRole === "delegate") {
      router.push(`/delegate/${matchedCommittee.id}`);
    } else if (assignedRole === "eb") {
      router.push(`/eb/${matchedCommittee.id}`);
    } else {
      router.push(`/admin`);
    }
  }

  // Theme color based on selected committee
  const themeColor =
    matchedCommittee?.theme === "pirate"
      ? "#FFD700"
      : matchedCommittee?.theme === "flame"
        ? "#FF4500"
        : "#0FC8FF";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#040818] text-white p-4">
      {/* Ambient background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 15%, rgba(15,180,255,0.07) 0%, transparent 55%)",
        }}
      />
      {/* Secondary glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 80%, rgba(10,132,255,0.04) 0%, transparent 40%)",
        }}
      />

      <div className="w-full max-w-sm z-10">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center mb-10">
          <img
            src="/logo.png"
            alt="Sapphire MUN"
            className="w-20 h-20 object-contain mb-4"
            style={{ filter: "drop-shadow(0 0 18px rgba(15,200,255,0.35))" }}
          />
          <h1
            className="text-xl font-semibold tracking-[0.25em] text-[#a8d8f0]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            SAPPHIRE <span className="text-white">MUN</span>
          </h1>
          <p className="text-[11px] text-blue-200/40 tracking-[0.2em] uppercase mt-1">
            {step === "committee"
              ? "Conference Portal"
              : step === "passcode"
                ? `Joining ${matchedCommittee?.short_name || "…"}`
                : `Entering ${matchedCommittee?.short_name || "…"}`}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#070f2b]/80 border border-white/10 rounded-2xl p-7 shadow-2xl backdrop-blur-sm relative overflow-hidden">
          {/* Subtle inner gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />

          <>
            {step === "committee" ? (
              /* ── Committee Selection step ── */
              <div className="space-y-4 relative">
                <label className="block text-[11px] font-semibold text-cyan-200/60 mb-3 tracking-[0.1em] uppercase text-center">
                  Select Committee
                </label>

                {loadingInitial ? (
                  <div className="flex justify-center py-8">
                    <span className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                  </div>
                ) : committees.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {committees.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setMatchedCommittee(c);
                          setAdminEntry(false);
                          setStep("passcode");
                          setHint(`Committee selected: ${c.name}. Enter join code, EB code, or generated passcode.`);
                          setPasscode("");
                          setPasscodeInfo(null);
                        }}
                        className="text-left px-4 py-3 rounded-xl border border-white/10 hover:border-cyan-500/50 hover:bg-white/5 transition-all outline-none active:scale-[0.97]"
                      >
                        <p
                          className="font-bold text-cyan-50"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          {c.short_name}
                        </p>
                        <p className="text-[10px] text-cyan-200/50 mt-0.5 truncate">
                          {c.name}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-center text-blue-200/40 py-4">
                    No committees are configured yet. Use admin login to continue setup.
                  </p>
                )}

                <div className="pt-4 border-t border-white/10">
                  <p className="w-full text-center text-[10px] text-cyan-400/60 uppercase tracking-widest font-semibold">
                    Select a committee or continue as admin
                  </p>
                  <div className="mt-4 flex justify-center">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setAdminEntry(true);
                          setMatchedCommittee(null);
                          setPasscodeInfo(null);
                          setHint("Admin login selected. Enter admin passcode.");
                          setStep("passcode");
                        }}
                        className="px-4 py-2 rounded-xl text-[11px] text-cyan-100 bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 transition-colors uppercase tracking-[0.15em] font-semibold"
                      >
                        Admin Code Login
                      </button>
                      <Link
                        href="/login"
                        className="px-4 py-2 rounded-xl text-[11px] text-white bg-slate-700/60 border border-slate-400/30 hover:bg-slate-700/80 transition-colors uppercase tracking-[0.15em] font-semibold"
                      >
                        Admin Email Login
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : step === "passcode" ? (
              /* ── Passcode step ── */
              <form onSubmit={handlePasscodeSubmit} className="space-y-5 relative">
                <button
                  type="button"
                  onClick={() => {
                    setStep("committee");
                    setAdminEntry(false);
                    setPasscode("");
                    setHint("");
                    setError("");
                    setPasscodeInfo(null);
                  }}
                  className="text-[11px] text-cyan-400/60 hover:text-cyan-400 transition-colors mb-2 block"
                >
                  ← Back
                </button>
                <div>
                  <label className="block text-[11px] font-semibold text-cyan-200/60 mb-2 tracking-[0.1em] uppercase">
                    {adminEntry ? "Admin Passcode" : "Join / EB / Admin Code"}
                  </label>
                  <input
                    type="text"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                    className="w-full bg-[#0a1840]/60 border border-white/10 rounded-xl px-4 py-3 text-white text-center tracking-[0.3em] font-mono text-base outline-none focus:border-cyan-500/60 focus:shadow-[0_0_0_3px_rgba(15,200,255,0.1)] transition-all"
                    placeholder={
                      adminEntry
                        ? ""
                        : ""
                    }
                    maxLength={24}
                    autoFocus
                    required
                  />
                  {hint && (
                    <p
                      className={`mt-2 text-center text-[11px] ${matchedCommittee ? "text-cyan-400" : "text-amber-400"}`}
                    >
                      {hint}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 px-3 py-2 rounded-xl text-center">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-sm tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] active:scale-[0.97]"
                >
                  {loading ? "Connecting…" : "Continue →"}
                </button>
              </form>
            ) : (
              /* ── Delegation details step ── */
              <form onSubmit={handleDelegateSubmit} className="space-y-5 relative">
                <button
                  type="button"
                  onClick={() => {
                    setStep("passcode");
                    setDelegation("");
                  }}
                  className="text-[11px] text-cyan-400/60 hover:text-cyan-400 transition-colors mb-1"
                >
                  ← Back
                </button>

                {matchedCommittee && (
                  <div className="text-center py-3 bg-cyan-950/30 border border-cyan-500/15 rounded-xl mb-1">
                    <p
                      className="text-xs font-semibold text-cyan-300"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {matchedCommittee.name}
                    </p>
                    <p className="text-[10px] text-blue-200/40 mt-0.5">
                      {matchedCommittee.short_name} · {matchedCommittee.type}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-cyan-200/60 mb-2 tracking-[0.1em] uppercase">
                    Delegation / Portfolio
                  </label>
                  <input
                    type="text"
                    value={delegation}
                    onChange={(e) => setDelegation(e.target.value)}
                    className="w-full bg-[#0a1840]/60 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500/60 focus:shadow-[0_0_0_3px_rgba(15,200,255,0.1)] transition-all"
                    placeholder=""
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 px-3 py-2 rounded-xl text-center">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !delegation.trim()}
                  className="w-full py-3 rounded-xl font-semibold text-sm tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] active:scale-[0.97]"
                >
                  {loading ? "Joining…" : "Enter Committee →"}
                </button>
              </form>
            )}
          </>

          {/* Footer note */}
          <p className="text-center text-[10px] text-blue-200/20 mt-6 relative">
            Use committee join credentials for delegates, or admin access for secretariat tools.
          </p>
        </div>
      </div>
    </div>
  );
}
