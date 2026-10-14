// Shared helpers for the classic pages
const TW = {
  MNF: ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'],
  CL: {dagbok:'Dagbok',dikt:'Dikt',annet:'Annet',forkynnelse:'Forkynnelse',plakat:'Plakat',mirakel:'Mirakel',bok:'Bok',forbonn:'Forbønn'},
  esc: (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  date(d) { const t = new Date(d + 'T12:00:00'); return `${t.getDate()}. ${TW.MNF[t.getMonth()]} ${t.getFullYear()}`; },
  clean(p) { return { ...p, t: TWSanitize.sanitizeSubject(p.t) || 'Uten tittel', x: TWSanitize.sanitizeEmailContent(p.x) }; },
  paras(text) { return text.split(/\n{2,}/).map((p) => `<p>${TW.esc(p).replace(/\n/g, '<br>')}</p>`).join(''); },
  preview(text, n = 320) {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= n) return flat;
    return flat.slice(0, flat.lastIndexOf(' ', n)) + ' …';
  },
  href(p) { return `/innlegg?m=${encodeURIComponent(p.m)}&i=${encodeURIComponent(p.i)}`; },
  async latest() { const r = await fetch('/data/latest.json', { cache: 'no-cache' }); return r.ok ? r.json() : []; }
};
