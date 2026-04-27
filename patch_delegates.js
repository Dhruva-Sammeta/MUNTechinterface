const fs = require("fs");
let content = fs.readFileSync("app/admin/page.tsx", "utf-8");

const startStr = `<div className="overflow-x-auto custom-scrollbar">\n                <table className="w-full text-sm">`;
const endStr = `                  </tbody>\n                </table>\n              </div>\n            </GlassPanel>`;

const parts = content.split(startStr);
if (parts.length === 2) {
  const parts2 = parts[1].split(endStr);
  if (parts2.length === 2) {
    const tableInside = `<table className="w-full text-sm">` + parts2[0].replace(`{filteredDelegates.map((d) => {
                      const c = committees.find((c) => c.id === d.committee_id);
                      return (`, `{items.map((d) => {
                      return (`) + `                  </tbody>\n                </table>`;
    
    // also remove the extra table tag at the start
    const cleanTableInside = tableInside.replace(`<table className="w-full text-sm"><table className="w-full text-sm">`, `<table className="w-full text-sm">`);

    const newCode = `<div className="space-y-6">
                {committees.map(c => {
                  const items = filteredDelegates.filter(d => d.committee_id === c.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={c.id} className="overflow-x-auto custom-scrollbar bg-black/10 rounded-xl border border-white/5">
                      <div className="px-4 py-3 border-b border-white/5 bg-black/20 flex gap-4 items-center">
                        <h3 className="font-bold" style={{ color: "var(--color-sapphire-400)" }}>{c.name} ({c.short_name})</h3>
                        <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full">{items.length} delegates</span>
                      </div>
                      ${cleanTableInside.split('\\n').join('\n                      ')}
                    </div>
                  );
                })}
                {filteredDelegates.length === 0 && (
                  <div className="p-8 text-center text-white/40 text-sm border border-dashed border-white/10 rounded-xl">
                    No delegates found.
                  </div>
                )}
              </div>
            </GlassPanel>`;
    content = parts[0] + newCode + parts2[1];
    content = content.replace(`{c?.short_name}`, `{c.short_name}`);
    fs.writeFileSync("app/admin/page.tsx", content);
    console.log("Updated successfully");
  } else {
    console.log("Could not find end string.");
  }
} else {
  console.log("Could not find start string.");
}
