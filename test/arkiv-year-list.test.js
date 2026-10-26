'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');

function yearRows(years) {
  const m = app.match(/<ul class="ark-year-list">\$\{YEARS\.map\(\(\[yy,n\]\)=>`([^`]+)`\)/);
  assert.ok(m, 'archive index renders .ark-year-list from YEARS');
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const row = new Function('yy', 'n', 'fmt', 'return `' + m[1] + '`;');
  return years.map(([yy, n]) => row(yy, n, fmt)).join('');
}

test('each archive year row is a single link around the year and the count', () => {
  const html = yearRows([['2026', 85], ['2016', 1234]]);
  const rows = [...html.matchAll(/<li>[\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal((row.match(/<a\b/g) || []).length, 1, row);
    assert.match(row, /^<li><a href="\/arkiv\?y=\d{4}">/);
    assert.match(row, /<span class="n">[^<]+ innlegg<\/span><\/a><\/li>$/);
    assert.doesNotMatch(row, /<\/a>[\s\S]*<span class="n">/);
  }
  assert.match(html, /<a href="\/arkiv\?y=2026">2026<span class="sr">, <\/span><span class="n">85 innlegg<\/span><\/a>/);
  assert.match(html, /<a href="\/arkiv\?y=2016">2016<span class="sr">, <\/span><span class="n">1\u00a0234 innlegg<\/span><\/a>/);
});

test('the year-row link fills the row, keeps the old spacing, and has a visible focus and hover', () => {
  const rule = css.match(/\.ark-year-list a\{([^}]+)\}/);
  assert.ok(rule, '.ark-year-list a rule');
  const body = rule[1];
  assert.match(body, /(?:^|;)display:flex(?:;|$)/);
  assert.match(body, /justify-content:space-between/);
  assert.match(body, /gap:1rem/);
  assert.match(body, /width:100%/);
  assert.match(body, /min-height:44px/);
  assert.match(body, /padding:\.55rem 0/);
  assert.match(body, /border-bottom:1px solid var\(--rule\)/);
  assert.doesNotMatch(css, /\.ark-year-list li\{[^}]*display:flex/);
  assert.match(css, /\.ark-year-list a:focus-visible\{outline:2px solid var\(--ink\);outline-offset:3px\}/);
  assert.match(css, /@media \(hover:hover\) and \(pointer:fine\)\{\.ark-year-list a:hover\{background:var\(--hover\)/);
  assert.match(css, /\.ark-year-list a:active\{opacity:\.72\}|, \.ark-year-list a:active\{opacity:\.72\}/);
});
