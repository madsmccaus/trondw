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
