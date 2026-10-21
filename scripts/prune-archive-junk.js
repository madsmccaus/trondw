#!/usr/bin/env node
/**
 * Remove junk posts from data/YYYY-MM.json (WordPress 404 pages, empty stubs, etc.).
 * Re-run after bulk imports; build-index.js applies the same rules when indexing.
 */

const fs = require('fs');
const path = require('path');
const { filterArchivePosts, archiveJunkReason } = require('../lib/archive-junk');

const dataDir = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();

const totals = { wp404: 0, scrape: 0, empty: 0 };
const byYear = { wp404: {}, scrape: {}, empty: {} };

function bump(bucket, post) {
  totals[bucket]++;
  const y = post.d.slice(0, 4);
  byYear[bucket][y] = (byYear[bucket][y] || 0) + 1;
}

let filesChanged = 0;
for (const file of files) {
  const filePath = path.join(dataDir, file);
  const posts = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const { kept, removed } = filterArchivePosts(posts);
  const n = removed.wp404.length + removed.scrape.length + removed.empty.length;
  if (!n) continue;
  for (const p of removed.wp404) bump('wp404', p);
  for (const p of removed.scrape) bump('scrape', p);
  for (const p of removed.empty) bump('empty', p);
  fs.writeFileSync(filePath, JSON.stringify(kept));
  filesChanged++;
  console.log(`${file}: removed ${n} (${posts.length} → ${kept.length})`);
}

const totalRemoved = totals.wp404 + totals.scrape + totals.empty;
console.log(`\nRemoved ${totalRemoved} posts from ${filesChanged} files`);
console.log(`  WordPress 404 pages: ${totals.wp404}`, byYear.wp404);
console.log(`  Other scrape junk: ${totals.scrape}`, byYear.scrape);
console.log(`  Empty stubs: ${totals.empty}`, byYear.empty);

if (totals.scrape) {
  console.log('\nOther scrape junk (titles):');
  for (const file of files) {
    const posts = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
    for (const p of posts) {
      if (archiveJunkReason(p) === 'scrape') console.log(`  - ${p.d} ${p.t}`);
    }
  }
}
