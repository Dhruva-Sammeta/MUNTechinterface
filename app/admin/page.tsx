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
  UserPlus,
  ShieldAlert,
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

export default function AdminPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [announcements, setAnnouncements] = useState<GlobalAnnouncement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Role editor
  const [editingDelegate, setEditingDelegate] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  // Registration form
  const [newDelEmail, setNewDelEmail] = useState("");
  const [newDelPassword, setNewDelPassword] = useState("");
  const [newDelName, setNewDelName] = useState("");
  const [newDelCountry, setNewDelCountry] = useState("");
  const [newDelCommitteeId, setNewDelCommitteeId] = useState("");
  const [newDelRole, setNewDelRole] = useState("delegate");
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = useCallback(async () => {
    const [cRes, sRes, dRes, aRes] = await Promise.all([
      supabase.from("committees").select("*").order("name"),
      supabase
        .from("sessions")
        .select("*")
        .eq("date", new Date().toISOString().split("T")[0]),
      supabase
        .from("delegates")
        .select("*")
        .order("joined_at", { ascending: false }),
      supabase
        .from("global_announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (cRes.data) setCommittees(cRes.data as Committee[]);
    if (sRes.data) setSessions(sRes.data as Session[]);
    if (dRes.data) setDelegates(dRes.data as Delegate[]);
    if (aRes.data) setAnnouncements(aRes.data as GlobalAnnouncement[]);
  }, [supabase]);

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
    if (!newAnnouncement.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const myDelegate = delegates.find((d) => d.user_id === user.id);
    if (!myDelegate) return;

    const content = newAnnouncement.trim();
    const { error } = await supabase.from("global_announcements").insert({
      content,
      created_by: myDelegate.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Announcement broadcast!");
    setNewAnnouncement("");
    loadAll();

    // Broadcast via realtime to all active committee channels
    committees.forEach((c) => {
      const ch = supabase.channel(`committee:${c.id}`);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ch.send({
            type: "broadcast",
            event: "announce:global",
            payload: { content, createdAt: Date.now() },
          }).then(() => supabase.removeChannel(ch));
        }
      });
    });
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
    if (!confirm("Remove this delegate? This is irreversible.")) return;
    const { error } = await supabase
      .from("delegates")
      .delete()
      .eq("id", delegateId);
    if (error) toast.error(error.message);
    else {
      toast.success("Delegate removed");
      loadAll();
    }
  }

  function exportCSV(type: "delegates" | "attendance") {
    let csv = "";
    if (type === "delegates") {
      csv = "Name,Country,Committee,Role,Present\n";
      delegates.forEach((d) => {
        const c = committees.find((c) => c.id === d.committee_id);
        csv += `"${d.display_name}","${d.country}","${c?.short_name || ""}","${d.role}","${d.is_present}"\n`;
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
        "WARNING: This will delete ALL sessions, chits, votes, documents, and blocs. Delegates will remain. Are you absolutely sure?",
      )
    )
      return;
    const prompt = window.prompt("Type 'CONFIRM' to execute global reset:");
    if (prompt !== "CONFIRM") return toast.error("Reset cancelled");

    const tables = [
      "chits",
      "votes",
      "voting_rounds",
      "documents",
      "bloc_members",
      "blocs",
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

  async function registerDelegate(e: React.FormEvent) {
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
      if (!res.ok) throw new Error(result.error || "Failed to register delegate");

      toast.success("Delegate registered successfully");
      setShowRegForm(false);
      // Reset form
      setNewDelEmail("");
      setNewDelPassword("");
      setNewDelName("");
      setNewDelCountry("");
      setNewDelCommitteeId("");
      setNewDelRole("delegate");
      
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsRegistering(false);
    }
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    {
      id: "delegates",
      label: `Delegates (${delegates.length})`,
      icon: <Users size={14} />,
    },
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
                        ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                        : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30"
                    }`}
                  >
                    {showRegForm ? "Cancel" : <><UserPlus size={14} /> Register New</>}
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
                    <h3 className="text-sm font-bold uppercase tracking-wider">Secure Registration</h3>
                  </div>
                  
                  <form onSubmit={registerDelegate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Account Email</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="delegate@example.com"
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
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Delegation Name</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="e.g. Republic of India"
                        required
                        value={newDelName}
                        onChange={e => setNewDelName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Country Alias (Optional)</label>
                      <input 
                        className="input-field text-xs bg-black/40 border-white/10 w-full" 
                        placeholder="e.g. India"
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
                      <label className="text-[10px] font-bold uppercase text-white/40 block ml-1">Role Authority</label>
                      <select 
                        className="input-field text-xs bg-black/40 border-white/10 w-full"
                        required
                        value={newDelRole}
                        onChange={e => setNewDelRole(e.target.value)}
                      >
                        <option value="delegate">Delegate</option>
                        <option value="eb">Executive Board (EB)</option>
                        <option value="presentation">Presentation Screen</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 lg:col-span-3 pt-2">
                      <button 
                        type="submit" 
                        disabled={isRegistering}
                        className="w-full btn-primary py-3 font-bold tracking-widest uppercase hover:shadow-[0_0_20px_rgba(10,132,255,0.3)]"
                      >
                        {isRegistering ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Confirm and Create Account"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              <div className="overflow-x-auto custom-scrollbar">
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
                        className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDelegates.map((d) => {
                      const c = committees.find((c) => c.id === d.committee_id);
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
                              {c?.short_name}
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
                                  <option value="presentation">
                                    presentation
                                  </option>
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
                                        : d.role === "presentation"
                                          ? "rgba(255,215,0,0.15)"
                                          : "var(--color-bg-elevated)",
                                  color:
                                    d.role === "admin"
                                      ? "var(--color-mode-crisis)"
                                      : d.role === "eb"
                                        ? "var(--color-sapphire-500)"
                                        : d.role === "presentation"
                                          ? "#FFD700"
                                          : "var(--color-text-secondary)",
                                }}
                              >
                                {d.role}
                              </span>
                            )}
                          </td>
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
            </GlassPanel>
          </div>
        )}

        {/* ===== ANNOUNCEMENTS ===== */}
        {activeTab === "announce" && (
          <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <GlassPanel>
              <SectionHeader
                title="Broadcast Announcement"
                subtitle="Shows as full-screen overlay on all connected delegate/EB/presentation screens"
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
                  disabled={!newAnnouncement.trim()}
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
                subtitle="DANGER: Wipes all ephemeral session data across all committees"
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
                      This action will delete all Sessions, Chits, Documents,
                      Votes, and Blocs. Delegate accounts and Committees will
                      remain intact. Use only between complete conference days
                      if needed.
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

      <footer className="px-6 py-4 border-t border-white/5 flex items-center justify-between opacity-30">
        <p className="text-[10px] font-bold uppercase tracking-widest">
          Credits: Dhruva Sammeta
        </p>
        <p className="text-[9px] uppercase tracking-[0.2em]">
          All rights reserved, Sapphire MUN
        </p>
      </footer>
    </div>
  );
}
