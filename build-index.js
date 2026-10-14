#!/usr/bin/env node
/**
 * Build index.json from monthly data files
 * Collects all posts from YYYY-MM.json files and creates a sorted index
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(dataDir, 'index.json');

// Read all JSON files from data directory
const files = fs.readdirSync(dataDir)
  .filter(f => f.match(/^\d{4}-\d{2}\.json$/))
  .sort();

console.log(`Found ${files.length} monthly data files`);

const allPosts = [];

for (const file of files) {
  const filePath = path.join(dataDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const posts = JSON.parse(content);
  
  console.log(`${file}: ${posts.length} posts`);
  allPosts.push(...posts.map((p) => ({ ...p, _m: file.slice(0, 7) })));
}

// Sort by date ascending (oldest first)
allPosts.sort((a, b) => a.d.localeCompare(b.d));

console.log(`\nTotal posts: ${allPosts.length}`);
console.log(`Date range: ${allPosts[0].d} to ${allPosts[allPosts.length - 1].d}`);

// titles.json: a small list of every written post for the /v4/arkiv index
{
  const { sanitizeSubject } = require('./lib/sanitize');
  const titles = allPosts.map((p) => [p.i, p.d, sanitizeSubject(p.t) || 'Uten tittel', p._m]);
  fs.writeFileSync(path.join(dataDir, 'titles.json'), JSON.stringify(titles));
  console.log(`✓ Wrote data/titles.json with ${titles.length} posts`);
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
