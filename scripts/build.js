#!/usr/bin/env node
/**
 * Build the static site into public/ (the Vercel output directory).
 *
 * Only what the site serves goes in: pages, CSS/JS, fonts, the frozen archive
 * index for the Bibliotek page and the flip-book manifest. Scans, covers and the
 * frozen archive months live in the separate trondw-assets project
 * (scripts/build-assets.js; ASSETS in boker.html; rewrites in vercel.json).
 * Email-era data (latest, meta, years, live months) is served by api/data.js.
 *
 * Also writes lib/archive-base.json, the frozen-archive totals api/data.js needs.
 */

const fs = require('fs');
const path = require('path');
const site = require('../lib/site-data');
const { buildArkiv } = require('../lib/arkiv');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public');
const dataDir = path.join(root, 'data');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data'), { recursive: true });

const copy = (rel, dest = rel) => {
  fs.mkdirSync(path.dirname(path.join(out, dest)), { recursive: true });
  fs.cpSync(path.join(root, rel), path.join(out, dest), { recursive: true });
};

// Pages and client code
const ROOT_FILES = ['index.html', 'arkiv.html', 'boker.html', 'om.html', 'app.css', 'site.css',
  'app.js', 'site.js', 'theme.js', 'tw.js', 'robots.txt'];
for (const f of ROOT_FILES) copy(f);
copy('lib/sanitize.js');
copy('fonts');
copy('flip/manifest.json');
copy('data/documents.json');

// Frozen archive: month files and year index are served from trondw-assets
// (vercel.json rewrites); here we only need their totals for lib/archive-base.json.
const months = fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
const staticPosts = [];
let liveMonths = 0;
for (const file of months) {
  const m = file.slice(0, 7);
  if (site.isLiveMonth(m)) { liveMonths++; continue; }
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  staticPosts.push(...site.keptPosts(m, raw).posts);
}
staticPosts.sort((a, b) => a.d.localeCompare(b.d));
const { years } = buildArkiv(staticPosts);

const base = site.buildBase(staticPosts);
fs.writeFileSync(path.join(root, 'lib', 'archive-base.json'), JSON.stringify(base, null, 1) + '\n');

let bytes = 0, files = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; }
  }
})(out);
console.log(`✓ public/: ${files} files, ${(bytes / 1e6).toFixed(1)} MB`);
console.log(`  archive: ${staticPosts.length} posts in ${months.length - liveMonths} frozen months, years ${years.map(([y]) => y).join(', ')}`);
console.log(`  live months (served by api/data.js): ${liveMonths}`);
