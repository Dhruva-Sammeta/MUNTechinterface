"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import type { Committee } from "@/lib/database.types";
import { verifyPasscode } from "@/app/actions/auth";

// Authentication is strictly hierarchical: Start as delegate, then escalate.

type LoginStep = "committee" | "passcode" | "delegation";

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
  const [verifiedRole, setVerifiedRole] = useState<string | null>(null);

  // Initial load of committees
  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data } = await sb.from("committees").select("*").order("name");
      if (data) setCommittees(data as Committee[]);
      setLoadingInitial(false);
    }
    init();
  }, []);

  // Clear errors as user types
  useEffect(() => {
    setError("");
    setHint("");
  }, [passcode]);

  // ── Step 1: Validate passcode ─────────────────────────────────────────────
  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim()) return;
    
    setLoading(true);
    setError("");

    try {
      const role = await verifyPasscode(passcode, matchedCommittee?.id);
      
      if (role) {
        setVerifiedRole(role);
        setStep("delegation");
      } else {
        setError("Invalid passcode. Enter your committee join code, EB code, or Admin code.");
      }
    } catch (err: any) {
      setError("Verification failed: " + err.message);
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

  // ── Step 2: Delegate joins with delegation name ────────────────────────────
  async function handleDelegateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchedCommittee || !delegation.trim()) return;
    setLoading(true);
    setError("");

    const sb = createClient();
    const uid = await getOrCreateAnonSession();
    if (!uid) {
      setLoading(false);
      return;
    }

    // Check if already joined a committee
    const { data: existingDelegate } = await sb
      .from("delegates")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();

    // Determine role based on previously verified passcode
    const assignedRole = verifiedRole || "delegate";

    const payload = {
      committee_id: assignedRole === "admin" ? (matchedCommittee?.id || null) : matchedCommittee?.id,
      display_name: delegation.trim(),
      country: delegation.trim(),
      role: assignedRole,
    };

    if (existingDelegate) {
      const { error } = await sb
        .from("delegates")
        .update(payload)
        .eq("id", existingDelegate.id);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    } else {
      const { error } = await sb
        .from("delegates")
        .insert({ user_id: uid, ...payload });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    }

    // Role-based routing logic unchanged but ensuring matchedCommittee exists for non-admins
    if (assignedRole === "delegate") {
      router.push(`/delegate/${matchedCommittee?.id}`);
    } else if (assignedRole === "eb") {
      router.push(`/eb/${matchedCommittee?.id}`);
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

      <motion.div
        className="w-full max-w-sm z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      >
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

          <AnimatePresence mode="wait">
            {step === "committee" ? (
              /* ── Committee Selection step ── */
              <motion.div
                key="committee"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4 relative"
              >
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
                      <motion.button
                        key={c.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.3 }}
                        onClick={() => {
                          setMatchedCommittee(c);
                          setStep("passcode");
                          setHint(`Committee selected: ${c.name}`);
                          setPasscode("");
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
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-center text-blue-200/40 py-4">
                    No committees found. Use generic access code below.
                  </p>
                )}

                <div className="pt-4 border-t border-white/10">
                  <p className="w-full text-center text-[10px] text-cyan-400/60 uppercase tracking-widest font-semibold">
                    Select a committee to continue
                  </p>
                </div>
              </motion.div>
            ) : step === "passcode" ? (
              /* ── Passcode step ── */
              <motion.form
                key="passcode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                onSubmit={handlePasscodeSubmit}
                className="space-y-5 relative"
              >
                <button
                  type="button"
                  onClick={() => {
                    setStep("committee");
                    setPasscode("");
                    setHint("");
                    setError("");
                  }}
                  className="text-[11px] text-cyan-400/60 hover:text-cyan-400 transition-colors mb-2 block"
                >
                  ← Back
                </button>
                <div>
                  <label className="block text-[11px] font-semibold text-cyan-200/60 mb-2 tracking-[0.1em] uppercase">
                    Join Code / Admin Code
                  </label>
                  <input
                    type="text"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                    className="w-full bg-[#0a1840]/60 border border-white/10 rounded-xl px-4 py-3 text-white text-center tracking-[0.3em] font-mono text-base outline-none focus:border-cyan-500/60 focus:shadow-[0_0_0_3px_rgba(15,200,255,0.1)] transition-all"
                    placeholder="━ ━ ━ ━ ━"
                    maxLength={10}
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
                  disabled={
                    loading || (passcode.length > 0 && !matchedCommittee)
                  }
                  className="w-full py-3 rounded-xl font-semibold text-sm tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] active:scale-[0.97]"
                >
                  {loading ? "Connecting…" : "Continue →"}
                </button>
              </motion.form>
            ) : (
              /* ── Delegation details step ── */
              <motion.form
                key="delegation"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleDelegateSubmit}
                className="space-y-5 relative"
              >
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
                    placeholder="e.g. Republic of India"
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
              </motion.form>
            )}
          </AnimatePresence>

          {/* Footer note */}
          <div className="mt-8 pt-6 border-t border-white/5 space-y-4 relative">
            <p className="text-center text-[10px] text-blue-200/20 uppercase tracking-widest font-medium">
              Join via committee code · Elevate access in settings
            </p>
            <div className="flex flex-col items-center gap-1.5 pt-2">
              <p className="text-[10px] text-white/10 font-medium tracking-wider">
                Credits: <span className="text-white/20">Dhruva Sammeta</span>
              </p>
              <p className="text-[9px] text-white/5 tracking-[0.2em] uppercase">
                All rights reserved, Sapphire MUN
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
