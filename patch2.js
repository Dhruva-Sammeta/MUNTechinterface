const fs = require('fs');
let code = fs.readFileSync('app/admin/page.tsx', 'utf-8');

const s1 = '<div className="overflow-x-auto custom-scrollbar">';
const idx1 = code.lastIndexOf(s1);

if (idx1 !== -1) {
  const s2 = '</GlassPanel>';
  const idx2 = code.indexOf(s2, idx1);
  
  if (idx2 !== -1) {
    let section = code.substring(idx1, idx2);
    // Replace mapping to use filtered items per committee
    section = section.replace('{filteredDelegates.map((d) => {\\n                      const c = committees.find((c) => c.id === d.committee_id);\\n                      return (', 
        '{items.map((d) => {\\n                      return (');
    
    // remove the c?.short_name
    section = section.replace('{c?.short_name}', '{c.short_name}');

    const newCode = `<div className="space-y-6">
                {committees.map(c => {
                  const items = filteredDelegates.filter(d => d.committee_id === c.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={c.id} className="overflow-x-auto custom-scrollbar bg-black/10 rounded-xl border border-white/5">
                      <div className="px-4 py-3 border-b border-white/5 bg-black/20 flex gap-4 items-center">
                        <h3 className="font-bold text-sapphire-400">{c.name} ({c.short_name})</h3>
                        <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full">{items.length} delegates</span>
                      </div>
                      \${section.replace('<div className="overflow-x-auto custom-scrollbar">', '')}
                    </div>
                  );
                })}
                {filteredDelegates.length === 0 && (
                  <div className="p-8 text-center text-white/40 text-sm border border-dashed border-white/10 rounded-xl">
                    No delegates found.
                  </div>
                )}
              </div>
            `;
    code = code.substring(0, idx1) + newCode + code.substring(idx2);
    fs.writeFileSync('app/admin/page.tsx', code);
    console.log("Patched grouping.");
  }
}
