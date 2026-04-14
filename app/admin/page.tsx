"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Committee = {
  id: string;
  name: string;
  short_name: string;
};

type PasscodeRow = {
  id: string;
  committee_id: string;
  display_name: string;
  passcode_plain: string | null;
  role: string;
  created_at: string;
  expires_at: string | null;
  assigned_user_id: string | null;
  assigned_at: string | null;
  revoked: boolean;
};

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [passcodes, setPasscodes] = useState<PasscodeRow[]>([]);

  const [committeeId, setCommitteeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("delegate");
  const [customCode, setCustomCode] = useState("");

  const [loadingPasscodes, setLoadingPasscodes] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("committees")
        .select("id,name,short_name")
        .order("name", { ascending: true });
      setCommittees((data || []) as Committee[]);
      if (data?.[0]?.id) setCommitteeId(data[0].id);
    }
    init();
  }, [supabase]);

  async function fetchPasscodes(selectedCommitteeId?: string) {
    setLoadingPasscodes(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session missing");

      const query = selectedCommitteeId ? `?committeeId=${selectedCommitteeId}` : "";
      const response = await fetch(`/api/admin/passcodes/list${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load passcodes");
      setPasscodes((payload.passcodes || []) as PasscodeRow[]);
    } catch (loadError: any) {
      setError(loadError.message || "Failed to load passcodes");
    } finally {
      setLoadingPasscodes(false);
    }
  }

  useEffect(() => {
    if (!committeeId) return;
    fetchPasscodes(committeeId);
  }, [committeeId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!committeeId || !displayName.trim()) {
      setError("Committee and display name are required");
      return;
    }

    setCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session missing");

      const response = await fetch("/api/admin/passcodes/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          committeeId,
          displayName: displayName.trim(),
          role,
          passcode: customCode.trim() ? customCode.trim().toUpperCase() : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Create failed");

      setNotice(`Passcode created: ${payload.passcode}`);
      setDisplayName("");
      setCustomCode("");
      fetchPasscodes(committeeId);
    } catch (createError: any) {
      setError(createError.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggleRevoke(row: PasscodeRow) {
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin session missing");

      const response = await fetch("/api/admin/passcodes/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ passcodeId: row.id, revoke: !row.revoked }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Update failed");

      fetchPasscodes(committeeId);
    } catch (toggleError: any) {
      setError(toggleError.message || "Update failed");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-2xl font-semibold">Canonical Admin Panel</h1>
          <p className="mt-1 text-sm text-slate-400">Single source of truth for passcode generation and management.</p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-lg font-medium">Create Delegate / EB Passcode</h2>
          <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <select
              value={committeeId}
              onChange={(event) => setCommitteeId(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="">Select committee</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.short_name} - {committee.name}
                </option>
              ))}
            </select>

            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Delegation name"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />

            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="delegate">delegate</option>
              <option value="eb">eb</option>
            </select>

            <input
              value={customCode}
              onChange={(event) => setCustomCode(event.target.value.toUpperCase())}
              placeholder="Custom code (optional)"
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
              maxLength={24}
            />

            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500 disabled:opacity-60 md:col-span-2 lg:col-span-4"
            >
              {creating ? "Creating..." : "Create Passcode"}
            </button>
          </form>
          {notice && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">Recent Passcodes</h2>
            <button
              type="button"
              onClick={() => fetchPasscodes(committeeId)}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          {loadingPasscodes ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-2">Delegation</th>
                    <th className="px-2 py-2">Passcode</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Created</th>
                    <th className="px-2 py-2">Revoked</th>
                    <th className="px-2 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {passcodes.map((row) => (
                    <tr key={row.id} className="border-b border-slate-900">
                      <td className="px-2 py-2">{row.display_name}</td>
                      <td className="px-2 py-2 font-mono">{row.passcode_plain || "LEGACY-HIDDEN"}</td>
                      <td className="px-2 py-2">{row.role}</td>
                      <td className="px-2 py-2">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-2 py-2">{row.revoked ? "Yes" : "No"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleRevoke(row)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                        >
                          {row.revoked ? "Restore" : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {passcodes.length === 0 && (
                    <tr>
                      <td className="px-2 py-4 text-sm text-slate-400" colSpan={6}>
                        No passcodes found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
