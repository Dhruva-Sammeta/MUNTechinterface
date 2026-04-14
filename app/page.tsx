"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Committee = {
  id: string;
  name: string;
  short_name: string;
  join_code: string;
};

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [committeeId, setCommitteeId] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdminEntry, setIsAdminEntry] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCommittees() {
      const { data } = await supabase
        .from("committees")
        .select("id,name,short_name,join_code")
        .order("name", { ascending: true });
      setCommittees((data || []) as Committee[]);
    }
    loadCommittees();
  }, [supabase]);

  const selectedCommittee = useMemo(
    () => committees.find((item) => item.id === committeeId) || null,
    [committeeId, committees]
  );

  async function ensureAnonymousSession() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;

    const { data, error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError || !data.user?.id) {
      throw new Error(anonError?.message || "Could not initialize session");
    }
    return data.user.id;
  }

  async function handleAdminFlow(committeeIdForAdmin: string | null, adminCode: string) {
    await ensureAnonymousSession().catch(() => null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    let response: Response;
    if (session?.access_token) {
      response = await fetch("/api/admin/bootstrap-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ committeeId: committeeIdForAdmin }),
      });
    } else {
      response = await fetch("/api/admin/bootstrap-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ committeeId: committeeIdForAdmin, adminCode }),
      });
    }

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "Admin bootstrap failed");
    }

    if (payload?.bootstrapCredentials?.email && payload?.bootstrapCredentials?.password) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: payload.bootstrapCredentials.email,
        password: payload.bootstrapCredentials.password,
      });
      if (signInError) {
        throw new Error(signInError.message);
      }
    }

    router.push("/admin");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) throw new Error("Passcode is required");

      if (!isAdminEntry && !selectedCommittee) {
        throw new Error("Select a committee first");
      }

      const verifyResponse = await fetch("/api/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          committeeJoinCode: selectedCommittee?.join_code || null,
        }),
      });

      const verify = await verifyResponse.json();
      if (!verifyResponse.ok || !verify?.valid) {
        throw new Error(verify?.error || "Invalid passcode");
      }

      if (verify.role === "admin") {
        await handleAdminFlow(selectedCommittee?.id || null, normalizedCode);
        return;
      }

      if (!selectedCommittee) throw new Error("Select a committee");
      if (!displayName.trim()) throw new Error("Display name is required");

      await ensureAnonymousSession();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const claimResponse = await fetch("/api/passcodes/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code: normalizedCode,
          committeeJoinCode: selectedCommittee.join_code,
          displayName: displayName.trim(),
        }),
      });

      const claim = await claimResponse.json();
      if (!claimResponse.ok || !claim?.success) {
        throw new Error(claim?.error || "Could not claim passcode");
      }

      if (claim.role === "eb") {
        router.push(`/eb/${selectedCommittee.id}`);
      } else {
        router.push(`/delegate/${selectedCommittee.id}`);
      }
    } catch (submitError: any) {
      setError(submitError.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-wide">Sapphire MUN Canonical Login</h1>
        <p className="mt-1 text-sm text-slate-400">One passcode flow for delegate, EB, and admin.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsAdminEntry(false)}
              className={`px-3 py-2 text-xs rounded-md border ${!isAdminEntry ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-slate-700 text-slate-300"}`}
            >
              Committee Login
            </button>
            <button
              type="button"
              onClick={() => setIsAdminEntry(true)}
              className={`px-3 py-2 text-xs rounded-md border ${isAdminEntry ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-slate-700 text-slate-300"}`}
            >
              Admin Login
            </button>
          </div>

          {!isAdminEntry && (
            <div>
              <label className="block text-sm mb-1">Committee</label>
              <select
                value={committeeId}
                onChange={(event) => setCommitteeId(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              >
                <option value="">Select committee</option>
                {committees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.short_name} - {committee.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm mb-1">Passcode</label>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono tracking-wide"
              placeholder={isAdminEntry ? "Enter admin code" : "Enter committee/generated code"}
              maxLength={24}
            />
          </div>

          {!isAdminEntry && (
            <div>
              <label className="block text-sm mb-1">Display Name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                placeholder="e.g. Republic of India"
              />
            </div>
          )}

          {error && <p className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            {loading ? "Please wait..." : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
