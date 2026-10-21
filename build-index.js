#!/usr/bin/env node
/**
 * Build index.json from monthly data files
 * Collects all posts from YYYY-MM.json files and creates a sorted index
 */

const fs = require('fs');
const path = require('path');
const { filterArchivePosts } = require('./lib/archive-junk');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(dataDir, 'index.json');
const metaFile = path.join(dataDir, 'meta.json');

// Read all JSON files from data directory
const files = fs.readdirSync(dataDir)
  .filter(f => f.match(/^\d{4}-\d{2}\.json$/))
  .sort();

console.log(`Found ${files.length} monthly data files`);

const allPosts = [];
const junkTotals = { wp404: 0, scrape: 0, empty: 0 };
const junkByYear = { wp404: {}, scrape: {}, empty: {} };

for (const file of files) {
  const filePath = path.join(dataDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const posts = JSON.parse(content);
  const { kept, removed } = filterArchivePosts(posts);
  for (const bucket of ['wp404', 'scrape', 'empty']) {
    for (const p of removed[bucket]) {
      junkTotals[bucket]++;
      const y = p.d.slice(0, 4);
      junkByYear[bucket][y] = (junkByYear[bucket][y] || 0) + 1;
    }
  }
  if (removed.wp404.length + removed.scrape.length + removed.empty.length) {
    console.log(
      `${file}: ${posts.length} posts (${removed.wp404.length + removed.scrape.length + removed.empty.length} junk skipped)`
    );
  } else {
    console.log(`${file}: ${posts.length} posts`);
  }
  allPosts.push(...kept.map((p) => ({ ...p, _m: file.slice(0, 7) })));
}

const junkRemoved = junkTotals.wp404 + junkTotals.scrape + junkTotals.empty;
if (junkRemoved) {
  console.log(`\nSkipped ${junkRemoved} junk posts while indexing:`);
  console.log(`  WordPress 404: ${junkTotals.wp404}`, junkByYear.wp404);
  console.log(`  Other scrape: ${junkTotals.scrape}`, junkByYear.scrape);
  console.log(`  Empty stubs: ${junkTotals.empty}`, junkByYear.empty);
}

// Sort by date ascending (oldest first)
allPosts.sort((a, b) => a.d.localeCompare(b.d));

console.log(`\nTotal posts: ${allPosts.length}`);
console.log(`Date range: ${allPosts[0].d} to ${allPosts[allPosts.length - 1].d}`);

// data/arkiv/YYYY.json: every written post of a year for the /arkiv index,
// with a short first-line excerpt so near-identical titles can be told apart
{
  const { sanitizeSubject, sanitizeEmailContent } = require('./lib/sanitize');
  const outDir = path.join(dataDir, 'arkiv');
  fs.mkdirSync(outDir, { recursive: true });
  const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const excerpt = (t, x) => {
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
  };
  const years = {};
  for (const p of allPosts) {
    const t = sanitizeSubject(p.t) || 'Uten tittel';
    (years[p.d.slice(0, 4)] ||= []).push([p.i, p.d, t, p._m, excerpt(t, sanitizeEmailContent(p.x || ''))]);
  }
  const ys = Object.keys(years).filter((y) => y < '2026').sort();
  for (const y of ys) {
    years[y].sort((a, b) => b[1].localeCompare(a[1]) || b[0] - a[0]);
    fs.writeFileSync(path.join(outDir, `${y}.json`), JSON.stringify(years[y]));
  }
  fs.writeFileSync(path.join(outDir, 'years.json'), JSON.stringify(ys.map((y) => [y, years[y].length])));
  console.log(`✓ Wrote data/arkiv/ for ${ys.length} years`);
}
allPosts.forEach((p) => delete p._m);
// Write index.json
fs.writeFileSync(outputFile, JSON.stringify(allPosts, null, 2));
console.log(`\n✓ Created ${outputFile}`);

// ── latest.json: the newest email posts for the homepage ──────────────
// Only posts that came in through the email pipeline (src === 'email').
// Text is sanitized again here so nothing private reaches the page even
// if an older post was stored before the sanitizer improved.
const { sanitizeEmailContent, sanitizeSubject } = require('./lib/sanitize');
const LATEST_COUNT = 5;
let latest = allPosts
  .filter((p) => p.src === 'email')
  .map((p) => ({
    m: p.d.slice(0, 7), i: p.i, d: p.d, c: p.c,
    t: sanitizeSubject(p.t) || 'Uten tittel',
    x: sanitizeEmailContent(p.x)
  }))
  .filter((p) => p.x)
  .sort((a, b) => b.d.localeCompare(a.d) || b.i - a.i);

// Preview deployments only: top up with clearly labeled sample posts.
// Never on production (VERCEL_ENV === 'production').
const env = process.env.VERCEL_ENV || 'development';
if (env !== 'production' && latest.length < LATEST_COUNT) {
  const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-posts.json'), 'utf-8'))
    .map((p, n) => ({ ...p, m: p.d.slice(0, 7), i: `sample-${n}`, sample: true }));
  latest = latest.concat(samples);
  console.log(`(${env}) added ${samples.length} sample posts to latest.json`);
}
latest = latest.slice(0, LATEST_COUNT);
fs.writeFileSync(path.join(dataDir, 'latest.json'), JSON.stringify(latest, null, 2));
console.log(`✓ Wrote data/latest.json with ${latest.length} posts`);

if (fs.existsSync(metaFile)) {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  meta.total_posts = allPosts.length;
  if (allPosts.length) {
    meta.date_range = [allPosts[0].d, allPosts[allPosts.length - 1].d];
  }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
  console.log(`✓ Updated data/meta.json (total_posts: ${meta.total_posts})`);
}
