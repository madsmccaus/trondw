'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isWordPress404Page,
  isEmptyArchiveStub,
  archiveJunkReason,
  filterArchivePosts,
} = require('../lib/archive-junk');

test('WordPress 404 scrape', () => {
  const p = {
    t: 'Fant ikke siden',
    x: '## Oops! Denne siden ble ikke funnet\n\nDet ble ikke funnet noe her. Kanskje du kan prøve å søke?',
    img: [],
    dr: [],
  };
  assert.equal(archiveJunkReason(p), 'wp404');
  assert.equal(isEmptyArchiveStub(p), false);
});

test('empty title-only stub is removed', () => {
  const p = { t: 'Diktsamling – Sov søtt', x: '', img: [], dr: [] };
  assert.equal(archiveJunkReason(p), 'empty');
});

test('post with image array is kept despite empty body', () => {
  const p = { t: 'Photo', x: '', img: ['a.webp'], dr: [] };
  assert.equal(archiveJunkReason(p), null);
});

test('post with markdown image in body is kept', () => {
  const p = { t: 'Photo', x: '![](/x.webp)', img: [], dr: [] };
  assert.equal(archiveJunkReason(p), null);
});

test('real post with body is kept', () => {
  const p = { t: 'Hei', x: 'Dette er innhold.', img: [], dr: [] };
  assert.equal(archiveJunkReason(p), null);
});

test('filterArchivePosts splits kept and removed', () => {
  const { kept, removed } = filterArchivePosts([
    { d: '2021-01-01', t: 'Fant ikke siden', x: '## Oops! Denne siden ble ikke funnet\n\nDet ble ikke funnet noe her.', img: [] },
    { d: '2017-06-01', t: 'Diktsamling', x: 'Tekst her', img: [] },
    { d: '2017-06-01', t: 'Tom', x: '', img: [] },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(removed.wp404.length, 1);
  assert.equal(removed.empty.length, 1);
});
