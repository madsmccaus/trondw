'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildArkiv, isDemoPost } = require('../lib/arkiv');

const post = (o) => ({ i: 0, d: '2020-01-01', t: 'Tittel', x: 'Tekst', _m: o.d ? o.d.slice(0, 7) : '2020-01', ...o });

test('email posts from 2026 show up as their own year', () => {
  const { years, byYear } = buildArkiv([
    post({ i: 1, d: '2022-08-03' }),
    post({ i: 0, d: '2026-10-22', src: 'email', t: 'Besjed', x: 'Et dikt' }),
    post({ i: 1, d: '2026-10-23', src: 'email', t: 'Dagbok', x: 'I dag' }),
  ]);
  assert.deepEqual(years, [['2022', 1], ['2026', 2]]);
  assert.deepEqual(byYear['2026'].map((r) => [r[0], r[1], r[3]]), [[1, '2026-10-23', '2026-10'], [0, '2026-10-22', '2026-10']]);
});

test('any future year is included automatically', () => {
  const { years } = buildArkiv([post({ d: '2027-01-05', src: 'email', x: 'Nytt år' })]);
  assert.deepEqual(years, [['2027', 1]]);
});

test('the non-email demo post is left out', () => {
  const demo = post({ d: '2026-09-09', t: 'Demo: Email-generert innlegg', c: 'annet' });
  assert.equal(isDemoPost(demo), true);
  assert.equal(isDemoPost(post({ d: '2019-05-05' })), false);
  assert.deepEqual(buildArkiv([demo]).years, []);
});

test('email posts with nothing left after sanitizing are left out', () => {
  const { years } = buildArkiv([post({ d: '2026-10-22', src: 'email', x: 'ola@example.no' })]);
  assert.deepEqual(years, []);
});

test('the real data has a 2026 year in the archive', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'data');
  const posts = fs.readdirSync(dir).filter((f) => /^2026-\d{2}\.json$/.test(f))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).map((p) => ({ ...p, _m: f.slice(0, 7) })));
  const { years } = buildArkiv(posts);
  assert.ok(years.some(([y, n]) => y === '2026' && n > 0));
});
