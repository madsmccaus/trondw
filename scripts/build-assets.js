#!/usr/bin/env node
/**
 * Assemble the heavy, rarely changing files for the separate Vercel project
 * `trondw-assets` (https://trondw-assets.vercel.app):
 *   flip/ (page scans), covers/ (Bibliotek thumbnails),
 *   data/YYYY-MM.json and data/arkiv/YYYY.json of the frozen archive (before LIVE_FROM).
 * The main site links/rewrites to these, so its own deploys stay tiny.
 *
 * Usage: node scripts/build-assets.js <outDir>
 *        cd <outDir> && vercel deploy --prod      (project trondw-assets)
 * Re-run only when scans, covers or archive months before 2026 change.
 */

const fs = require('fs');
const path = require('path');
const site = require('../lib/site-data');
const { buildArkiv } = require('../lib/arkiv');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'assets-dist'));
const dataDir = path.join(root, 'data');

for (const name of ['flip', 'covers', 'data']) fs.rmSync(path.join(out, name), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data', 'arkiv'), { recursive: true });
fs.cpSync(path.join(root, 'flip'), path.join(out, 'flip'), { recursive: true });
fs.cpSync(path.join(root, 'covers'), path.join(out, 'covers'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets', 'vercel.json'), path.join(out, 'vercel.json'));
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><title>trondw assets</title>\n');
fs.writeFileSync(path.join(out, '.vercelignore'), '.env*\n');

const staticPosts = [];
for (const file of fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort()) {
  const m = file.slice(0, 7);
  if (site.isLiveMonth(m)) continue;
  const raw = fs.readFileSync(path.join(dataDir, file), 'utf8');
  staticPosts.push(...site.keptPosts(m, JSON.parse(raw)).posts);
  fs.writeFileSync(path.join(out, 'data', file), raw);
}
staticPosts.sort((a, b) => a.d.localeCompare(b.d));
const { years, byYear } = buildArkiv(staticPosts);
for (const [y] of years) fs.writeFileSync(path.join(out, 'data', 'arkiv', `${y}.json`), JSON.stringify(byYear[y]));
console.log(`✓ assets in ${out}: archive years ${years.map(([y]) => y).join(', ')}`);
