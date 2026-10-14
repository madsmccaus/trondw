// Shared loader for the v2 directions. Each page renders either the list
// (no params) or a single post (?m=YYYY-MM&i=N) using its own templates.
async function twV2({ list, post }) {
  const root = document.getElementById('root');
  const q = new URLSearchParams(location.search);
  const m = q.get('m'), i = q.get('i');
  const all = (await TW.latest()).map(TW.clean).filter((p) => p.x);
  if (m && i) {
    let p = all.find((x) => x.m === m && String(x.i) === i);
    if (!p && /^\d{4}-\d{2}$/.test(m)) {
      try {
        const hit = (await fetch(`/data/${m}.json`).then((r) => r.json())).find((x) => String(x.i) === i && x.src === 'email');
        if (hit) p = TW.clean({ ...hit, m });
      } catch (e) {}
    }
    if (!p) { root.innerHTML = '<p class="empty">Fant ikke innlegget.</p>'; return; }
    document.title = `${p.t} · Trond Worren`;
    root.innerHTML = post(p);
  } else {
    root.innerHTML = all.length ? list(all) : '<p class="empty">Ingen nye innlegg ennå.</p>';
  }
  window.scrollTo(0, 0);
}
const twLink = (p) => `${location.pathname}?m=${encodeURIComponent(p.m)}&i=${encodeURIComponent(p.i)}`;
const twSample = (p) => p.sample ? '<span class="sample">Eksempel · kun forhåndsvisning</span>' : '';
// v3 helpers
const twLead = (p) => { const text = typeof p === "string" ? p : (p.sample ? p.x.split(/\n{2,}/).slice(1).join(" ") : p.x); const m = text.replace(/\s+/g,' ').match(/^(.{40,170}?[.!?])\s/); return m ? m[1] : TW.preview(text, 140); };
const twToday = () => { const t = new Date(); return `${['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'][t.getDay()]} ${t.getDate()}. ${TW.MNF[t.getMonth()]} ${t.getFullYear()}`; };
const twShort = (d) => { const t = new Date(d+'T12:00:00'); return `${String(t.getDate()).padStart(2,'0')}.${String(t.getMonth()+1).padStart(2,'0')}.${t.getFullYear()}`; };
function twReveal(){ const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.12});
  document.querySelectorAll('.rv').forEach(el=>io.observe(el)); }
