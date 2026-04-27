"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import {
  ModeBadge,
  GlassPanel,
  SectionHeader,
  Tabs,
} from "@/components/ui/shared";
import {
  MonitorSmartphone,
  Search,
  ShieldAlert,
} from "lucide-react";

// Additional icons used in this file
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Download,
  Settings,
  Shield,
  Check,
  Edit2,
  Trash2,
  Send,
  AlertTriangle,
  Key,
  Copy,
} from "lucide-react";
import { countryFlag } from "@/lib/countryFlag";
import type {
  Committee,
  Delegate,
  Session,
  SessionMode,
  GlobalAnnouncement,
} from "@/lib/database.types";
import { toast } from "sonner";
import { useSessionCloseOnTabExit } from "@/hooks/useSessionCloseOnTabExit";

export default function AdminPage() {
  const supabase = createClient();
  useSessionCloseOnTabExit(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [announcements, setAnnouncements] = useState<GlobalAnnouncement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);

  // Role editor
  const [editingDelegate, setEditingDelegate] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  // Registration form
  const [newDelEmail, setNewDelEmail] = useState("");
  const [newDelPassword, setNewDelPassword] = useState("");
  const [newDelName, setNewDelName] = useState("");
  const [newDelCountry, setNewDelCountry] = useState("");
  const [newDelCommitteeId, setNewDelCommitteeId] = useState("");
  const [newDelRole, setNewDelRole] = useState("admin");
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);

  // Passcode creation UI
  const [showPasscodeForm, setShowPasscodeForm] = useState(false);
  const [pcCommitteeId, setPcCommitteeId] = useState("");
  const [pcDisplayName, setPcDisplayName] = useState("");
  const [pcPasscode, setPcPasscode] = useState("");
  const [pcRole, setPcRole] = useState("delegate");
  const [isCreatingPasscode, setIsCreatingPasscode] = useState(false);

  const [globalMessages, setGlobalMessages] = useState<any[]>([]);

  useEffect(() => {
    loadAll();
    fetchGlobalMessages();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGlobalMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("committee_messages")
        .select(`
          id,
          content,
          scope,
          visible_to_eb,
          created_at,
          committee_id,
          sender:sender_id(display_name),
          recipient:recipient_id(display_name)
        `)
        .order("created_at", { ascending: false })
        .limit(150);
      if (!error && data) setGlobalMessages(data);
    } catch (e: any) {
      console.error("Failed to load global messages", e);
    }
  }, [supabase]);

  const loadAll = useCallback(async () => {
    setPageError(null);
    try {
      const [cRes, sRes, dRes] = await Promise.all([
        supabase.from("committees").select("*").order("name"),
        supabase
          .from("sessions")
          .select("*")
          .eq("date", new Date().toISOString().split("T")[0]),
        supabase
          .from("delegates")
          .select("*")
          .order("joined_at", { ascending: false }),
      ]);

      if (cRes.error) throw new Error(cRes.error.message);
      if (sRes.error) throw new Error(sRes.error.message);
      if (dRes.error) throw new Error(dRes.error.message);

      if (cRes.data) setCommittees(cRes.data as Committee[]);
      if (sRes.data) setSessions(sRes.data as Session[]);
      if (dRes.data) setDelegates(dRes.data as Delegate[]);
      setAnnouncements([]);
    } catch (error: any) {
      const message = error?.message || "Unable to load admin data.";
      setPageError(message);
      toast.error(message);
    }
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("admin:live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delegates" },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "committee_messages" },
        () => fetchGlobalMessages(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll, fetchGlobalMessages, supabase]);

  // ---- Actions ----
  async function overrideMode(sessionId: string, mode: SessionMode) {
    const { error } = await supabase
      .from("sessions")
      .update({ mode })
      .eq("id", sessionId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Mode set to ${mode}`);
      loadAll();
    }
  }

  async function sendAnnouncement() {
    toast.error("Announcements are not available in the canonical schema.");
  }

  async function updateDelegateRole(delegateId: string, newRole: string) {
    const { error } = await supabase
      .from("delegates")
      .update({ role: newRole })
      .eq("id", delegateId);
    if (error) toast.error(error.message);
    else {
      toast.success("Role updated");
      setEditingDelegate(null);
      loadAll();
    }
  }

  async function deleteDelegate(delegateId: string) {
    try {
      // Fetch the delegate to inspect role
      const { data: delegate, error: fetchErr } = await supabase
        .from("delegates")
        .select("id,display_name,role")
        .eq("id", delegateId)
        .maybeSingle();
      if (fetchErr || !delegate) return toast.error("Delegate not found");

      if (delegate.role === "admin") {
        // Count admins to avoid deleting the last admin
        const { count: adminCount, error: countErr } = await supabase
          .from("delegates")
          .select("id", { count: "exact" })
          .eq("role", "admin");
        if (countErr) return toast.error("Failed to verify admin count");
        if ((adminCount || 0) <= 1) {
          return toast.error("Cannot delete the last admin account. Create another admin first.");
        }

        const prompt = window.prompt(
          `You are deleting admin '${delegate.display_name}'. Type DELETE ADMIN to confirm:`,
        );
        if (prompt !== "DELETE ADMIN") return toast.error("Admin deletion cancelled");
      } else {
        if (!confirm("Remove this delegate? This is irreversible.")) return;
      }

      // Call server-side deletion endpoint (server enforces last-admin protection)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return toast.error("Not authenticated");

      const res = await fetch("/api/admin/delete-delegate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ delegateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete delegate");
      toast.success("Delegate removed");
      fetchPasscodes();
      loadAll();
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  }

  function exportCSV(type: "delegates" | "attendance") {
    let csv = "";
    if (type === "delegates") {
      // Include delegate ID in same format as stored (UUID)
      csv = "ID,Name,Country,Committee,Role,Present\n";
      delegates.forEach((d) => {
        const c = committees.find((c) => c.id === d.committee_id);
        csv += `"${d.id}","${d.display_name}","${d.country}","${c?.short_name || ""}","${d.role}","${d.is_present}"\n`;
      });
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function globalReset() {
    if (
      !confirm(
        "WARNING: This will delete sessions and committee messages across all committees. Delegates and committees will remain. Are you absolutely sure?",
      )
    )
      return;
    const prompt = window.prompt("Type 'CONFIRM' to execute global reset:");
    if (prompt !== "CONFIRM") return toast.error("Reset cancelled");

    const tables = [
      "committee_messages",
      "passcode_attempts",
      "passcode_audit",
      "sessions",
    ];
    for (const table of tables) {
      await supabase
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all rows
    }
    toast.success("Global reset complete");
    loadAll();
  }

  async function triggerHardwareSync(committeeId: string) {
    const secret = window.prompt("Enter Admin Sync Secret:");
    if (!secret) return;

    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": secret,
        },
        body: JSON.stringify({
          committeeId,
          event: "mode_change",
          data: { mode: "voting" },
        }),
      });
      const data = await res.json();
      if (res.ok) toast.success("Hardware sync triggered successfully");
      else toast.error(data.error || "Failed to trigger sync");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function registerAdminUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newDelEmail || !newDelPassword || !newDelName || !newDelCommitteeId) {
      return toast.error("Missing required fields");
    }

    setIsRegistering(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) throw new Error("Not authenticated");

      const res = await fetch("/api/admin/create-delegate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({
          email: newDelEmail,
          password: newDelPassword,
          displayName: newDelName,
          country: newDelCountry || newDelName,
          committeeId: newDelCommitteeId,
          role: newDelRole,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to register admin");

      toast.success("Admin account created successfully");
      setShowRegForm(false);
      // Reset form
      setNewDelEmail("");
      setNewDelPassword("");
      setNewDelName("");
      setNewDelCountry("");
      setNewDelCommitteeId("");
      setNewDelRole("admin");
      
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsRegistering(false);
    }
  }

    async function createPasscode(e: React.FormEvent) {
      e.preventDefault();
      if (!pcCommitteeId || !pcDisplayName) return toast.error("Missing required fields");
      setIsCreatingPasscode(true);
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) throw new Error("Not authenticated");

          // Backend now owns autogeneration + uniqueness checks.
          const passcodeToSend = pcPasscode && pcPasscode.trim().length > 0
            ? pcPasscode.trim().toUpperCase()
            : undefined;

          const res = await fetch("/api/admin/passcodes/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${currentSession.access_token}`,
            },
            body: JSON.stringify({
              committeeId: pcCommitteeId,
              displayName: pcDisplayName,
              passcode: passcodeToSend,
              role: pcRole,
            }),
          });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create passcode");

        setShowPasscodeForm(true);
        setPcDisplayName("");
        setPcPasscode("");
        toast.success("Passcode created — check Recent Passcodes below");
        fetchPasscodes();
        loadAll();
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsCreatingPasscode(false);
      }
    }

    // ---- Passcode management (list, revoke, rotate, export) ----
    const [passcodes, setPasscodes] = useState<any[]>([]);
    const [isLoadingPasscodes, setIsLoadingPasscodes] = useState(false);
    const [rotatingPasscodeId, setRotatingPasscodeId] = useState<string | null>(null);
    const [isRepairingLegacyPasscodes, setIsRepairingLegacyPasscodes] = useState(false);

    // Reports (moderation)
    const [reports, setReports] = useState<any[]>([]);
    const [isLoadingReports, setIsLoadingReports] = useState(false);

    const fetchPasscodes = useCallback(async () => {
      setIsLoadingPasscodes(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const res = await fetch("/api/admin/passcodes/list", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to fetch passcodes");
        setPasscodes(json.passcodes || []);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setIsLoadingPasscodes(false);
      }
    }, [supabase]);

    useEffect(() => {
      fetchPasscodes();
    }, [fetchPasscodes]);

    useEffect(() => {
      const channel = supabase
        .channel("admin:passcodes:live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "delegate_passcodes" },
          () => fetchPasscodes(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "delegates" },
          () => loadAll(),
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [fetchPasscodes, loadAll, supabase]);

    async function fetchReports() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        setIsLoadingReports(true);
        const res = await fetch("/api/admin/reports/list", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to fetch reports");
        setReports(json.reports || []);
      } catch (e: any) {
        // ignore
      } finally {
        setIsLoadingReports(false);
      }
    }

    useEffect(() => {
      fetchReports();
    }, []);

    async function resolveReport(reportId: string, action: string | null = null) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/admin/reports/resolve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reportId, action }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to resolve report");
        toast.success("Report resolved");
        fetchReports();
      } catch (e: any) {
        toast.error(e.message);
      }
    }

async function deletePasscode(passcodeId: string) {
        if (!confirm("Are you sure you want to delete this passcode? It will be permanently removed.")) return;
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error("Not authenticated");

          const res = await fetch("/api/admin/passcodes/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ passcodeId }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to delete passcode");
          toast.success("Passcode deleted");
        fetchPasscodes();
      } catch (err: any) {
        toast.error(err.message);
      }
    }

    async function rotatePasscodeInternal(passcode: any, showSuccessToast = true) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        // Create a new passcode with same metadata
        const createRes = await fetch("/api/admin/passcodes/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            committeeId: passcode.committee_id,
            displayName: passcode.display_name,
            role: passcode.role,
          }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok) throw new Error(createJson.error || "Failed to create rotated passcode");

// Delete old passcode
          const deleteRes = await fetch("/api/admin/passcodes/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ passcodeId: passcode.id }),
          });
          const deleteJson = await deleteRes.json();
          if (!deleteRes.ok) throw new Error(deleteJson.error || "Failed to delete old passcode");

        if (showSuccessToast) {
          // Copy new passcode to clipboard.
          const newPlain = createJson.passcode;
          try {
            await navigator.clipboard.writeText(newPlain);
            toast.success("Rotated passcode (copied to clipboard)");
          } catch {
            toast.success("Rotated passcode — copy manually:");
          }
        }

        fetchPasscodes();
      } catch (err: any) {
        toast.error(err.message);
      }
    }

    async function rotatePasscode(passcode: any) {
      if (!confirm("Rotate this passcode? This will create a new passcode and revoke the old one.")) return;
      setRotatingPasscodeId(passcode.id);
      try {
        await rotatePasscodeInternal(passcode, true);
      } finally {
        setRotatingPasscodeId(null);
      }
    }

    async function repairLegacyPasscodes() {
      const legacyPasscodes = passcodes.filter((p) => !p.passcode_plain && !p.revoked);
      if (!legacyPasscodes.length) {
        toast.success("No legacy passcodes to repair");
        return;
      }
      if (!confirm(`Repair ${legacyPasscodes.length} legacy passcode(s)? This will rotate each code and revoke the old one.`)) return;

      setIsRepairingLegacyPasscodes(true);
      try {
        let repaired = 0;
        for (const passcode of legacyPasscodes) {
          setRotatingPasscodeId(passcode.id);
          await rotatePasscodeInternal(passcode, false);
          repaired += 1;
        }
        toast.success(`Repaired ${repaired} legacy passcode(s). Refreshing list...`);
        await fetchPasscodes();
      } catch (err: any) {
        toast.error(err.message || "Failed to repair legacy passcodes");
      } finally {
        setRotatingPasscodeId(null);
        setIsRepairingLegacyPasscodes(false);
      }
    }

    function exportPasscodesCSV() {
      if (!passcodes.length) return toast.error("No passcodes to export");
      // Include Passcode ID and plaintext code for admin operations.
      let csv = "Passcode ID,Passcode,Display Name,Committee,Role,Created At,Expires At,Assigned ID,Assigned Name,Assigned At,Revoked,Is Persistent\n";
      passcodes.forEach((p) => {
        const c = committees.find((c) => c.id === p.committee_id);
        const assigned = delegates.find((d) => d.id === p.assigned_user_id);
        csv += `"${p.id}","${p.passcode_plain || ""}","${p.display_name || ""}","${c?.short_name || ""}","${p.role}","${p.created_at || ""}","${p.expires_at || ""}","${p.assigned_user_id || ""}","${assigned?.display_name || ""}","${p.assigned_at || ""}","${p.revoked}","${p.is_persistent}"\n`;
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `passcodes_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

  const tabs = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    {
      id: "delegates",
      label: `Delegates (${delegates.length})`,
      icon: <Users size={14} />,
    },
    { id: "messages", label: "Global Messages", icon: <Send size={14} /> },
    { id: "reports", label: `Reports (${reports.length})`, icon: <AlertTriangle size={14} /> },
    { id: "announce", label: "Announcements", icon: <Megaphone size={14} /> },
    { id: "export", label: "Export", icon: <Download size={14} /> },
    { id: "settings", label: "Settings", icon: <Settings size={14} /> },
  ];

  // Delegate filtering
  const filteredDelegates = delegates.filter((d) => {
    const searchStr = searchQuery.toLowerCase();
    const matchName = (d.display_name || "").toLowerCase().includes(searchStr);
    const matchCountry = (d.country || "").toLowerCase().includes(searchStr);
    const c = committees.find((comp) => comp.id === d.committee_id);
    const matchCommittee = (c?.short_name || "")
      .toLowerCase()
      .includes(searchStr);
    return matchName || matchCountry || matchCommittee;
  });

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg-primary)" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-3"
        style={{
          borderBottom: "1px solid var(--color-border-default)",
          background: "var(--color-bg-secondary)",
        }}
      >
        <div className="flex items-center gap-3">
          <Shield size={20} style={{ color: "var(--color-sapphire-500)" }} />
          <div>
            <h1
              className="text-sm font-bold"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              SAPPHIRE ADMIN
            </h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Global Control Panel
            </p>
          </div>
        </div>
        <span
          className="text-xs px-3 py-1 rounded-full font-bold"
          style={{
            background: "rgba(255,59,48,0.15)",
            color: "var(--color-mode-crisis)",
            border: "1px solid rgba(255,59,48,0.3)",
          }}
        >
          ADMIN ACCESS
        </span>
      </header>

      {pageError ? (
        <div className="mx-4 mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <div className="flex items-center justify-between gap-3">
            <p>{pageError}</p>
            <button
              type="button"
              onClick={() => setPageError(null)}
              className="text-red-100/80 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        {/* ===== OVERVIEW ===== */}
        {activeTab === "overview" && (
          <div className="space-y-4 animate-fade-in">
            <SectionHeader
              title="All Committees — Live Status"
              subtitle={`${sessions.length} active sessions today`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {committees.map((c, i) => {
                const sess = sessions.find((s) => s.committee_id === c.id);
                const dels = delegates.filter((d) => d.committee_id === c.id);
                const present = dels.filter((d) => d.is_present).length;
                const themeColor =
                  c.theme === "pirate"
                    ? "var(--color-pirate-gold)"
                    : c.theme === "flame"
                      ? "var(--color-flame-core)"
                      : "var(--color-sapphire-500)";

                return (
                  <motion.div
                    key={c.id}
                    className="glass-card p-4 rounded-xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p
                          className="text-sm font-bold"
                          style={{
                            color: themeColor,
                            fontFamily: "var(--font-heading)",
                          }}
                        >
                          {c.short_name}
                        </p>
                        <p
                          className="text-[11px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {c.name}
                        </p>
                      </div>
                      {sess && <ModeBadge mode={sess.mode as SessionMode} />}
                    </div>

                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-4 text-xs bg-black/20 p-2.5 rounded-lg border border-white/5">
                      <div>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          Dels:
                        </span>{" "}
                        <strong>{dels.length}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          Present:
                        </span>{" "}
                        <strong>{present}</strong>
                      </div>
                      <div className="col-span-2">
                        <span style={{ color: "var(--color-text-muted)" }}>
                          Code:
                        </span>{" "}
                        <strong className="font-mono text-cyan-200 tracking-widest bg-white/5 px-2 py-0.5 rounded">
                          {c.join_code}
                        </strong>
                      </div>
                    </div>

                    {sess && (
                      <div className="flex gap-1">
                        {(
                          [
                            "normal",
                            "crisis",
                            "voting",
                            "break",
                          ] as SessionMode[]
                        ).map((m) => (
                          <button
                            key={m}
                            onClick={() => overrideMode(sess.id, m)}
                            className="flex-1 py-1 text-[10px] uppercase font-bold rounded-lg transition-all"
                            style={{
                              background:
                                sess.mode === m
                                  ? `${m === "normal" ? "var(--color-mode-normal)" : m === "crisis" ? "var(--color-mode-crisis)" : m === "voting" ? "var(--color-mode-voting)" : "var(--color-mode-break)"}`
                                  : "var(--color-bg-elevated)",
                              color:
                                sess.mode === m
                                  ? "#fff"
                                  : "var(--color-text-muted)",
                            }}
                          >
                            {m.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== REPORTS ===== */}
        {activeTab === "reports" && (
          <div className="max-w-5xl mx-auto animate-fade-in">
            <GlassPanel>
              <SectionHeader
                title="Reported Messages"
                subtitle="Moderation queue — EB and Admins can review and resolve reports"
              />

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-xs text-white/40">When</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Committee</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Message</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Reporter</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Reason</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Status</th>
                      <th className="text-right py-2 px-3 text-xs text-white/40">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingReports ? (
                      <tr><td colSpan={7} className="py-6 text-center opacity-60">Loading reports...</td></tr>
                    ) : reports.length === 0 ? (
                      <tr><td colSpan={7} className="py-6 text-center opacity-40">No reports</td></tr>
                    ) : (
                      reports.map((r: any) => {
                        const c = committees.find((c) => c.id === r.message?.committee_id);
                        return (
                          <tr key={r.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-3 px-3 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                            <td className="py-3 px-3 text-xs">{c?.short_name || r.message?.committee_id || "—"}</td>
                            <td className="py-3 px-3 text-xs">{r.message ? r.message.id : r.message_id}</td>
                            <td className="py-3 px-3 text-xs">{r.reporter_delegate?.display_name || r.reporter_user_id}</td>
                            <td className="py-3 px-3 text-xs">{r.reason || "—"}</td>
                            <td className="py-3 px-3 text-xs">{r.status}</td>
                            <td className="py-3 px-3 text-right">
                              <button
                                className="px-3 py-1 rounded-md text-xs bg-white/5 hover:bg-white/10 mr-2"
                                onClick={() => resolveReport(r.id, null)}
                              >
                                Dismiss
                              </button>
                              <button
                                className="px-3 py-1 rounded-md text-xs bg-red-500/10 hover:bg-red-500/20"
                                onClick={() => {
                                  if (!confirm("Delete message and resolve report? This is irreversible.")) return;
                                  resolveReport(r.id, "delete_message");
                                }}
                              >
                                Delete Message
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ===== GLOBAL MESSAGES ===== */}
        {activeTab === "messages" && (
          <div className="max-w-5xl mx-auto animate-fade-in">
            <GlassPanel>
              <div className="flex items-center justify-between mb-4">
                <SectionHeader
                  title="Global Messages"
                  subtitle="Live feed of all public and private messages across committees"
                />
                <button
                  onClick={fetchGlobalMessages}
                  className="p-2 rounded bg-white/5 hover:bg-white/10"
                  title="Refresh"
                >
                  <Search size={16} className="text-white/60" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-xs text-white/40">When</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Committee</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">From</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">To</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Message</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalMessages.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center opacity-40">No messages</td></tr>
                    ) : (
                      globalMessages.map(msg => {
                        const c = committees.find(c => c.id === msg.committee_id);
                        return (
                          <tr key={msg.id} className="hover:bg-white/5 transition-colors border-b border-white/5">
                            <td className="py-3 px-3 text-xs whitespace-nowrap">{new Date(msg.created_at).toLocaleTimeString()}</td>
                            <td className="py-3 px-3 text-xs whitespace-nowrap">
                              <span className="px-2 py-1 rounded bg-black/40 border border-white/5">
                                {c?.short_name || "Unknown"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs">{msg.sender?.display_name || "Unknown"}</td>
                            <td className="py-3 px-3 text-xs">{msg.recipient?.display_name || "—"}</td>
                            <td className="py-3 px-3 text-xs max-w-xs truncate" title={msg.content}>
                              {msg.content}
                            </td>
                            <td className="py-3 px-3 text-xs">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                                msg.scope === 'private' 
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {msg.scope}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ===== GLOBAL MESSAGES ===== */}
        {activeTab === "messages" && (
          <div className="max-w-5xl mx-auto animate-fade-in">
            <GlassPanel>
              <div className="flex items-center justify-between mb-4">
                <SectionHeader
                  title="Global Messages"
                  subtitle="Live feed of all public and private messages across committees"
                />
                <button
                  onClick={fetchGlobalMessages}
                  className="p-2 rounded bg-white/5 hover:bg-white/10"
                  title="Refresh"
                >
                  <Search size={16} className="text-white/60" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-xs text-white/40">When</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Committee</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">From</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">To</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Message</th>
                      <th className="text-left py-2 px-3 text-xs text-white/40">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalMessages.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center opacity-40">No messages</td></tr>
                    ) : (
                      globalMessages.map(msg => {
                        const c = committees.find(c => c.id === msg.committee_id);
                        return (
                          <tr key={msg.id} className="hover:bg-white/5 transition-colors border-b border-white/5">
                            <td className="py-3 px-3 text-xs whitespace-nowrap">{new Date(msg.created_at).toLocaleTimeString()}</td>
                            <td className="py-3 px-3 text-xs whitespace-nowrap">
                              <span className="px-2 py-1 rounded bg-black/40 border border-white/5">
                                {c?.short_name || "Unknown"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs">{msg.sender?.display_name || "Unknown"}</td>
                            <td className="py-3 px-3 text-xs">{msg.recipient?.display_name || "—"}</td>
                            <td className="py-3 px-3 text-xs max-w-xs truncate" title={msg.content}>
                              {msg.content}
                            </td>
                            <td className="py-3 px-3 text-xs">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                                msg.scope === 'private' 
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {msg.scope}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ===== DELEGATES ===== */}
        {activeTab === "delegates" && (
          <div className="max-w-5xl mx-auto animate-fade-in">
            <GlassPanel variant="elevated">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <SectionHeader
                  title="All Delegates"
                  subtitle="Manage roles across committees"
                />
                <div className="flex items-center gap-3">
                  <div className="relative w-full sm:w-64">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                    />
                    <input
                      type="text"
                      placeholder="Search name, country..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:border-cyan-500/50 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => setShowRegForm(!showRegForm)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      showRegForm
                        ? "bg-red-700/30 text-red-200 border border-red-400/40"
                        : "bg-red-600/20 text-red-100 border border-red-400/40 hover:bg-red-600/30"
                    }`}
                  >
                    {showRegForm ? "Close Admin Form" : <><ShieldAlert size={14} /> Register Admin</>}
                  </button>
                  <button
                    onClick={() => setShowPasscodeForm(!showPasscodeForm)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      showPasscodeForm
                        ? "bg-emerald-700/30 text-emerald-100 border border-emerald-400/40"
                        : "bg-emerald-600/20 text-emerald-100 border border-emerald-400/40 hover:bg-emerald-600/30"
                    }`}
                  >
                    {showPasscodeForm ? "Close Delegate/EB Form" : <><Key size={14} /> Register Delegate/EB</>}
                  </button>
                </div>
              </div>

              {showRegForm && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <ShieldAlert size={18} className="text-amber-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Register Admin</h3>
                  </div>

                  <p className="text-xs text-red-100/80 -mt-2">
                    Use this only for secretariat/admin accounts with email and password login.
                  </p>

                  <form onSubmit={registerAdminUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Account Email</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="admin@example.com"
                        type="email"
                        required
                        value={newDelEmail}
                        onChange={e => setNewDelEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Password</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="Min 6 characters"
                        type="password"
                        required
                        minLength={6}
                        value={newDelPassword}
                        onChange={e => setNewDelPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Display Name</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="e.g. Secretariat Admin"
                        required
                        value={newDelName}
                        onChange={e => setNewDelName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Label (Optional)</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="e.g. Secretariat"
                        value={newDelCountry}
                        onChange={e => setNewDelCountry(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Committee</label>
                      <select 
                        className="input-field text-xs bg-black/40 border-white/10 w-full"
                        required
                        value={newDelCommitteeId}
                        onChange={e => setNewDelCommitteeId(e.target.value)}
                      >
                        <option value="">Select Committee</option>
                        {committees.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.short_name})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Account Type</label>
                      <div className="input-field text-xs bg-black/40 border-red-400/30 w-full flex items-center text-red-100 font-semibold">
                        Admin (fixed)
                      </div>
                    </div>
                    <div className="md:col-span-2 lg:col-span-3 pt-2">
                      <button 
                        type="submit" 
                        disabled={isRegistering}
                        className="w-full py-3 rounded-xl font-bold tracking-widest uppercase bg-red-600 text-white hover:bg-red-500 transition-colors"
                      >
                        {isRegistering ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Register Admin"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {showPasscodeForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6"
                >
                  <div className="p-3 rounded-md bg-black/20 border border-white/5">
                    <h4 className="text-sm font-bold mb-1">How delegate/EB/admin registration works</h4>
                    <ol className="text-xs list-decimal list-inside text-white/60">
                      <li>Select the committee.</li>
                      <li>Enter the delegation name (e.g. Republic of India).</li>
                      <li>Choose Delegate, EB, or Admin role.</li>
                        <li>Leave code blank to auto-generate a unique code (e.g. DISEC-8A3F), or enter custom code.</li>
                      <li>Click Register Delegate/EB and share the code with the user.</li>
                    </ol>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <Key size={18} className="text-emerald-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Register Delegate / EB / Admin</h3>
                  </div>

                  <form onSubmit={createPasscode} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Committee</label>
                      <select className="input-field text-xs bg-black/40 border-white/10 w-full" required value={pcCommitteeId} onChange={(e) => setPcCommitteeId(e.target.value)}>
                        <option value="">Select committee</option>
                        {committees.map((c) => (
                          <option key={c.id} value={c.id}>{c.short_name} — {c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Delegation Name</label>
                      <input className="input-field text-xs bg-black/40 border-white/10 w-full" placeholder="e.g. Republic of India" required value={pcDisplayName} onChange={e => setPcDisplayName(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Join Code (optional override)</label>
                        <input className="input-field text-xs bg-black/40 border-white/10 w-full font-mono tracking-widest" placeholder="Leave blank to auto-generate (e.g. DISEC-8A3F)" value={pcPasscode} onChange={e => setPcPasscode(e.target.value.toUpperCase())} />
                        <p className="text-xs text-white/40">Custom code rules: 4-24 chars, use only A-Z, 0-9, underscore, or hyphen.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Role</label>
                      <select className="input-field text-xs bg-black/40 border-white/10 w-full" value={pcRole} onChange={(e) => setPcRole(e.target.value)}>
                        <option value="delegate">delegate</option>
                        <option value="eb">eb</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>

                    <div className="col-span-3">
                      <button type="submit" disabled={isCreatingPasscode} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors">{isCreatingPasscode ? "Creating…" : "Register Delegate/EB/Admin"}</button>
                    </div>
                  </form>
                  <div className="mt-4">
                    <h4 className="text-sm font-bold mb-2">Recent Passcodes</h4>
                    <div className="bg-black/10 p-3 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-2">
                            <button onClick={fetchPasscodes} className="px-3 py-2 rounded bg-white/5">Refresh</button>
                            <button
                              onClick={repairLegacyPasscodes}
                              disabled={isRepairingLegacyPasscodes || rotatingPasscodeId !== null}
                              className={`px-3 py-2 rounded transition-colors ${isRepairingLegacyPasscodes || rotatingPasscodeId !== null ? "bg-amber-500/20 text-amber-200/60 cursor-not-allowed" : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"}`}
                              title="Generate fresh visible codes for legacy-hidden rows"
                            >
                              {isRepairingLegacyPasscodes ? "Repairing Legacy..." : "Repair Legacy Codes"}
                            </button>
                          <button onClick={exportPasscodesCSV} className="px-3 py-2 rounded bg-white/5 flex items-center gap-2"><Download size={14} /> Export CSV</button>
                        </div>
                        <div className="text-xs text-white/40">
                          {isLoadingPasscodes ? "Loading…" : `${passcodes.length} passcodes`}
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-64 custom-scrollbar">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Delegation</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Passcode</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Committee</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Role</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Created</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Expires</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Assigned</th>
                              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Signed in</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {passcodes.map((p) => {
                              const c = committees.find((c) => c.id === p.committee_id);
                              const assigned = delegates.find((d) => d.id === p.assigned_user_id);
                              return (
                                <tr key={p.id} className="hover:bg-white/5 transition-colors" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                                  <td className="py-2 px-3 font-medium text-xs">{p.display_name || "—"}</td>
                                  <td className="py-2 px-3 text-xs font-mono tracking-wider">
                                    {p.passcode_plain ? (
                                      p.passcode_plain
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="text-amber-300/80">LEGACY-HIDDEN</span>
                                        <button
                                          type="button"
                                          onClick={() => rotatePasscode(p)}
                                          disabled={!!rotatingPasscodeId}
                                          className={`px-2 py-1 rounded text-[10px] font-sans tracking-normal ${rotatingPasscodeId ? "bg-amber-500/20 text-amber-200/60 cursor-not-allowed" : "bg-amber-500/25 text-amber-100 hover:bg-amber-500/35"}`}
                                        >
                                          Fix now
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-xs"><span className="text-[10px] font-bold px-2 py-1 rounded-md bg-black/40 border border-white/5">{c?.short_name || "—"}</span></td>
                                  <td className="py-2 px-3 text-xs">{p.role}</td>
                                  <td className="py-2 px-3 text-xs">{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</td>
                                  <td className="py-2 px-3 text-xs">{p.expires_at ? new Date(p.expires_at).toLocaleString() : ""}</td>
                                  <td className="py-2 px-3 text-xs">{assigned?.display_name || "-"}</td>
                                  <td className="py-2 px-3 text-xs">{p.assigned_user_id ? "Yes" : "No"}</td>
                                  <td className="py-2 px-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!p.passcode_plain) return;
                                          try {
                                            await navigator.clipboard.writeText(p.passcode_plain);
                                            toast.success("Passcode copied");
                                          } catch {
                                            toast.error("Copy failed");
                                          }
                                        }}
                                        disabled={!p.passcode_plain}
                                        className={`p-1.5 rounded transition-colors ${p.passcode_plain ? "bg-white/5 hover:bg-white/10 text-white/80" : "bg-white/5 text-white/20 cursor-not-allowed"}`}
                                      >
                                        <Copy size={13} />
                                      </button>
                                      <button
                                        onClick={() => deletePasscode(p.id)}
                                        className="p-1.5 rounded transition-colors text-red-500/60 hover:text-red-400 hover:bg-red-500/10"
                                        title="Delete passcode"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                      <button
                                        onClick={() => rotatePasscode(p)}
                                        className="p-1.5 rounded bg-white/5"
                                        disabled={!!rotatingPasscodeId}
                                      >
                                        {rotatingPasscodeId === p.id ? "Rotating…" : "Rotate"}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {passcodes.length === 0 && (
                              <tr>
                                <td colSpan={9} className="py-4 px-3 text-xs text-white/40">No passcodes yet</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="space-y-6">
                {committees.map(c => {
                  const items = filteredDelegates.filter(d => d.committee_id === c.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={c.id} className="overflow-x-auto custom-scrollbar bg-black/10 rounded-xl border border-white/5">
                      <div className="px-4 py-3 border-b border-white/5 bg-black/20 flex gap-4 items-center">
                        <h3 className="font-bold" style={{ color: "var(--color-sapphire-400)" }}>{c.name} ({c.short_name})</h3>
                        <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full">{items.length} delegates</span>
                      </div>
                      <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                      }}
                    >
                      <th
                        className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Name
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Country
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Committee
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Role
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Signed in
                      </th>
                      <th
                        className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => {
                      return (
                        <tr
                          key={d.id}
                          className="hover:bg-white/5 transition-colors"
                          style={{
                            borderBottom:
                              "1px solid var(--color-border-default)",
                          }}
                        >
                          <td className="py-2.5 px-3 font-medium text-xs">
                            {d.display_name || "—"}
                          </td>
                          <td
                            className="py-2.5 px-3 text-xs"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-base">{countryFlag(d.country || d.display_name)}</span>
                              {d.country || "—"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-black/40 border border-white/5">
                              {c.short_name}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {editingDelegate === d.id ? (
                              <div className="flex items-center gap-1">
                                <select
                                  className="input-field text-xs py-1 px-2 h-auto w-28 rounded-md"
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value)}
                                >
                                  <option value="delegate">delegate</option>
                                  <option value="eb">eb</option>
                                  <option value="admin">admin</option>
                                </select>
                                <button
                                  onClick={() =>
                                    updateDelegateRole(d.id, editRole)
                                  }
                                  className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider`}
                                style={{
                                  background:
                                    d.role === "admin"
                                      ? "rgba(255,59,48,0.15)"
                                      : d.role === "eb"
                                        ? "rgba(10,132,255,0.15)"
                                        : "var(--color-bg-elevated)",
                                  color:
                                    d.role === "admin"
                                      ? "var(--color-mode-crisis)"
                                      : d.role === "eb"
                                        ? "var(--color-sapphire-500)"
                                        : "var(--color-text-secondary)",
                                }}
                              >
                                {d.role}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs">{d.has_logged_in ? "Yes" : "No"}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              className="p-1.5 rounded transition-colors text-white/40 hover:text-white hover:bg-white/10 mr-1"
                              onClick={() => {
                                setEditingDelegate(d.id);
                                setEditRole(d.role);
                              }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="p-1.5 rounded transition-colors text-red-500/60 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => deleteDelegate(d.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                    </div>
                  );
                })}
                {filteredDelegates.length === 0 && (
                  <div className="p-8 text-center text-white/40 text-sm border border-dashed border-white/10 rounded-xl">
                    No delegates found.
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ===== ANNOUNCEMENTS ===== */}
        {activeTab === "announce" && (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <GlassPanel>
              <SectionHeader
                title="Broadcast Announcement"
                subtitle="Disabled in canonical schema (global announcements table removed)"
              />
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <input
                  className="input-field flex-1 text-sm border-sapphire-500/30 focus:border-sapphire-400"
                  placeholder="Type global alert..."
                  value={newAnnouncement}
                  onChange={(e) => setNewAnnouncement(e.target.value)}
                />
                <button
                  className="btn-primary sm:w-auto w-full font-bold tracking-wide"
                  onClick={sendAnnouncement}
                  disabled
                >
                  <Send size={16} /> Broadcast
                </button>
              </div>
            </GlassPanel>

            <GlassPanel>
              <SectionHeader title="Broadcast History" />
              <div className="space-y-2 mt-4">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl flex gap-3 border border-white/5"
                    style={{ background: "var(--color-bg-elevated)" }}
                  >
                    <div className="mt-0.5">
                      <Megaphone
                        size={16}
                        style={{ color: "var(--color-sapphire-500)" }}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{a.content}</p>
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ===== EXPORT ===== */}
        {activeTab === "export" && (
          <div className="max-w-md mx-auto space-y-4 animate-fade-in">
            <GlassPanel>
              <SectionHeader
                title="Data Export"
                subtitle="Download conference data as CSV"
              />
              <div className="space-y-3 mt-4">
                <button
                  className="btn-secondary w-full justify-start py-3 bg-white/5"
                  onClick={() => exportCSV("delegates")}
                >
                  <Download size={16} className="text-cyan-400" />{" "}
                  <span className="font-semibold text-sm">
                    Export All Delegates (CSV)
                  </span>
                </button>
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ===== SETTINGS ===== */}
        {activeTab === "settings" && (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <GlassPanel>
              <SectionHeader
                title="Hardware Sync Control"
                subtitle="Test external hardware API triggers (Requires Secret)"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {committees.map((c) => (
                  <button
                    key={c.id}
                    className="btn-secondary w-full justify-start text-xs bg-black/30 border-white/5"
                    onClick={() => triggerHardwareSync(c.id)}
                  >
                    <MonitorSmartphone
                      size={14}
                      className="text-sapphire-400"
                    />{" "}
                    Sync: {c.short_name}
                  </button>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel>
              <SectionHeader
                title="Global Data Reset"
                subtitle="DANGER: Wipes sessions and public chat data across all committees"
              />
              <div
                className="p-4 rounded-xl mt-4"
                style={{
                  background: "rgba(255,59,48,0.05)",
                  border: "1px solid rgba(255,59,48,0.2)",
                }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle size={20} className="text-red-500 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-red-500 mb-1">
                      Clear Conference Data
                    </h3>
                    <p className="text-xs text-white/50 leading-relaxed">
                      This action will delete Sessions, Committee Messages,
                      Passcode Attempts, and Passcode Audit records. Delegate
                      accounts and Committees remain intact. Use only between
                      complete conference days if needed.
                    </p>
                  </div>
                </div>
                <button
                  className="btn-danger w-full py-3 tracking-widest font-bold uppercase"
                  onClick={globalReset}
                >
                  <Trash2 size={16} /> Execute Global Reset
                </button>
              </div>
            </GlassPanel>
          </div>
        )}
      </main>
    </div>
  );
}
