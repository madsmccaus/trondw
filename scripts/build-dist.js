#!/usr/bin/env node
/**
 * Vercel static output: only assets the live site serves.
 * Serverless functions stay in api/ at the project root (Vercel default).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

execFileSync(process.execPath, ['build-index.js'], { cwd: root, stdio: 'inherit' });

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const copyDir = (name) => {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, path.join(dist, name), { recursive: true });
};

for (const name of ['data', 'covers', 'flip', 'fonts']) {
  copyDir(name);
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (/\.(html|css|js)$/.test(entry.name)) {
    fs.copyFileSync(path.join(root, entry.name), path.join(dist, entry.name));
  }
}

console.log(`✓ Wrote ${dist}`);
