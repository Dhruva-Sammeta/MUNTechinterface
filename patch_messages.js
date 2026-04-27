const fs = require('fs');
let code = fs.readFileSync('app/admin/page.tsx', 'utf-8');

const s = `        {/* ===== DELEGATES ===== */}`;
const newCode = `        {/* ===== GLOBAL MESSAGES ===== */}
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
                              <span className={\`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider \${
                                msg.scope === 'private' 
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }\`}>
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

`;

code = code.replace(s, newCode + s);
fs.writeFileSync('app/admin/page.tsx', code);
console.log("Added messages tab.");
