"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { Diamond, LogIn, Mail, Lock, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Check role and redirect
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: delegate } = await supabase
        .from("delegates")
        .select("role, committee_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (delegate?.role === "admin") {
        router.push("/admin");
      } else if (delegate?.role === "eb") {
        router.push(`/eb/${delegate.committee_id}`);
      } else if (delegate?.committee_id) {
        router.push(`/delegate/${delegate.committee_id}`);
      } else {
        router.push("/join");
      }
    }
    setLoading(false);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/join`,
      },
    });

    if (authError) {
      setError(authError.message);
    } else {
      setError("");
      alert("Check your email for the login link!");
    }
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--color-bg-primary)" }}
    >
      {/* Background glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-10"
        style={{
          background:
            "radial-gradient(ellipse, rgba(10,132,255,0.3), transparent 70%)",
        }}
      />

      <motion.div
        className="glass-card-elevated w-full max-w-md p-8 relative z-10"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <Diamond
            size={28}
            style={{ color: "var(--color-sapphire-500)" }}
            strokeWidth={2}
          />
          <div>
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              SAPPHIRE MUN
            </h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              EB & Admin Login
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div
          className="flex rounded-lg overflow-hidden mb-6"
          style={{ border: "1px solid var(--color-border-default)" }}
        >
          <button
            type="button"
            className="flex-1 py-2 text-sm font-medium transition-all"
            style={{
              background:
                mode === "password"
                  ? "var(--color-sapphire-500)"
                  : "transparent",
              color:
                mode === "password" ? "#fff" : "var(--color-text-secondary)",
            }}
            onClick={() => setMode("password")}
          >
            Password
          </button>
          <button
            type="button"
            className="flex-1 py-2 text-sm font-medium transition-all"
            style={{
              background:
                mode === "magic" ? "var(--color-sapphire-500)" : "transparent",
              color: mode === "magic" ? "#fff" : "var(--color-text-secondary)",
            }}
            onClick={() => setMode("magic")}
          >
            Magic Link
          </button>
        </div>

        <form
          onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}
        >
          {/* Email */}
          <div className="mb-4">
            <label
              className="flex items-center gap-2 text-xs font-medium mb-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <Mail size={14} style={{ color: "var(--color-text-muted)" }} />
              <span>Email</span>
            </label>
            <div>
              <input
                type="email"
                className="input-field"
                placeholder="admin@sapphiremun.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Password (only for password mode) */}
          {mode === "password" && (
            <div className="mb-6">
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Password
              </label>
              <div>
                <label
                  className="flex items-center gap-2 text-xs font-medium mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <Lock size={14} style={{ color: "var(--color-text-muted)" }} />
                  <span>Password</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input-field pr-12"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--color-text-muted)" }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p
              className="mb-4 text-xs px-3 py-2 rounded-lg"
              style={{
                background: "rgba(255,59,48,0.1)",
                color: "var(--color-mode-crisis)",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={16} />
                {mode === "password" ? "Sign In" : "Send Magic Link"}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Delegate?{" "}
            <Link
              href="/join"
              style={{ color: "var(--color-sapphire-500)" }}
              className="font-medium"
            >
              Join with committee code →
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
