/**
 * Build the /arkiv year index: data/arkiv/years.json and data/arkiv/YYYY.json.
 * Used by lib/site-data.js, scripts/build.js and scripts/build-assets.js.
 *
 * Every year is included, so posts that arrive by email (2026 onwards) show up
 * in the archive automatically on the next build. Only two kinds of posts are
 * left out:
 *  - the 2026 demo post (not from the email pipeline, dated 2026 or later)
 *  - email posts with nothing left to show after the privacy sanitizer
 */

const { sanitizeSubject, sanitizeEmailContent } = require('./sanitize');

const EMAIL_ERA = '2026';

const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Short first-line excerpt so near-identical titles can be told apart
function excerpt(t, x) {
  let f = flat(x);
  // the body often opens by repeating the title; skip that so the excerpt adds something
  const nt = norm(t);
  if (nt.length > 8) {
    for (let k = Math.min(f.length, t.length + 40); k > 0; k--) {
      if (norm(f.slice(0, k)) === nt) { f = f.slice(k).replace(/^[\s.,:;–—-]+/, ''); break; }
    }
  }
  if (f.length <= 170) return f;
  return f.slice(0, f.lastIndexOf(' ', 170)) + ' …';
}

/** Demo/test posts: anything dated in the email era that did not come in by email. */
function isDemoPost(p) {
  return p.src !== 'email' && String(p.d || '') >= EMAIL_ERA;
}

/**
 * @param {Array<{i:any,d:string,t?:string,x?:string,src?:string,_m:string}>} posts
 * @returns {{ years: Array<[string, number]>, byYear: Record<string, Array> }}
 *   byYear rows are [i, d, title, month, excerpt], newest first.
 */
function buildArkiv(posts) {
  const byYear = {};
  for (const p of posts) {
    if (isDemoPost(p)) continue;
    const t = sanitizeSubject(p.t) || 'Uten tittel';
    const x = sanitizeEmailContent(p.x || '');
    if (p.src === 'email' && !x) continue;
    (byYear[p.d.slice(0, 4)] ||= []).push([p.i, p.d, t, p._m, excerpt(t, x)]);
  }
  const ys = Object.keys(byYear).sort();
  for (const y of ys) byYear[y].sort((a, b) => b[1].localeCompare(a[1]) || String(b[0]).localeCompare(String(a[0]), undefined, { numeric: true }));
  return { years: ys.map((y) => [y, byYear[y].length]), byYear };
}

module.exports = { buildArkiv, isDemoPost, excerpt };
