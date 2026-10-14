// Shared helpers for the classic pages and /v4
const TW = {
  MNF: ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'],
  esc: (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  date(d) { const t = new Date(d + 'T12:00:00'); return `${t.getDate()}. ${TW.MNF[t.getMonth()]} ${t.getFullYear()}`; },
  clean(p) { return { ...p, t: TWSanitize.sanitizeSubject(p.t) || 'Uten tittel', x: TWSanitize.sanitizeEmailContent(p.x) }; },
  paras(text) { return text.split(/\n{2,}/).map((p) => `<p>${TW.esc(p).replace(/\n/g, '<br>')}</p>`).join(''); },
  preview(text, n = 320) {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= n) return flat;
    return flat.slice(0, flat.lastIndexOf(' ', n)) + ' …';
  },
  async latest() { const r = await fetch('/data/latest.json', { cache: 'no-cache' }); return r.ok ? r.json() : []; }
};
async function twPage({ list, post, any = false }) {
  const root = document.getElementById('root');
  const q = new URLSearchParams(location.search);
  const m = q.get('m'), i = q.get('i');
  const all = (await TW.latest()).map(TW.clean).filter((p) => p.x);
  if (m && i) {
    let p = all.find((x) => x.m === m && String(x.i) === i);
    if (!p && /^\d{4}-\d{2}$/.test(m)) {
      try {
        const hit = (await fetch(`/data/${m}.json`).then((r) => r.json())).find((x) => String(x.i) === i && (any || x.src === 'email'));
        if (hit) p = TW.clean({ ...hit, m });
      } catch (e) {}
    }
    if (!p) { root.innerHTML = '<p class="empty">Fant ikke innlegget.</p>'; return; }
    document.title = `${p.t} · Trond Worren`;
    root.innerHTML = post(p);
  } else {
    root.innerHTML = all.length ? list(all) : '<p class="empty">Ingen nye innlegg ennå.</p>';
  }
}
const twHref = (p) => `${location.pathname}?m=${encodeURIComponent(p.m)}&i=${encodeURIComponent(p.i)}`;
const twSample = (p) => p.sample ? '<span class="sample">Eksempel</span>' : '';
