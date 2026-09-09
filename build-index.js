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
  allPosts.push(...posts);
}

// Sort by date ascending (oldest first)
allPosts.sort((a, b) => a.d.localeCompare(b.d));

console.log(`\nTotal posts: ${allPosts.length}`);
console.log(`Date range: ${allPosts[0].d} to ${allPosts[allPosts.length - 1].d}`);

// Write index.json
fs.writeFileSync(outputFile, JSON.stringify(allPosts, null, 2));
console.log(`\n✓ Created ${outputFile}`);
