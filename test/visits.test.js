const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const { createHandler } = require('../api/visit');
const { createMemoryVisitStore, createBlobVisitStore, createVisitStore, resetMemoryVisitStore } = require('../lib/visit-store');
const { recordVisit, summarize, applyVisit, normalizePath } = require('../lib/visits');
const { osloDay } = require('../lib/day');
const { makeReq, makeRes, siteHeaders, CHROME } = require('./helpers');

const NOW = new Date('2026-10-26T12:00:00Z');
const IP = '203.0.113.50';

function hit(store, extra = {}) {
  return recordVisit(store, {
    salt: 'salt',
    ip: IP,
    ua: CHROME,
    path: '/',
    referrer: '',
    host: 'trondworren.net',
    now: NOW,
    ...extra,
  });
}

test('Oslo day rolls over at local midnight', () => {
  assert.equal(osloDay(new Date('2026-10-26T22:30:00Z')), '2026-10-26');
  assert.equal(osloDay(new Date('2026-10-26T23:30:00Z')), '2026-10-27');
});

test('a reader is counted once a day, and the address is not stored', async () => {
  const store = createMemoryVisitStore();
  await hit(store);
  await hit(store, { path: '/arkiv' });
  await hit(store, { path: '/arkiv' });
  const { doc } = await store.load();
  const saved = JSON.stringify(doc);
  assert.equal(saved.includes(IP), false);
  assert.equal(saved.includes('203.0.113'), false);
  const day = doc.days['2026-10-26'];
  assert.equal(day.ids.length, 1);
  assert.equal(day.pages['/'], 1);
  assert.equal(day.pages['/arkiv'], 1);
  assert.equal(day.refs.Direkte, 1);
});

test('the first referrer of the day is kept, and our own site counts as direct', async () => {
  const store = createMemoryVisitStore();
  await hit(store, { referrer: 'https://www.google.com/search?q=trond' });
  await hit(store, { path: '/om', referrer: 'https://trondworren.net/' });
  const { doc } = await store.load();
  assert.equal(doc.days['2026-10-26'].refs['google.com'], 1);
  assert.equal(doc.days['2026-10-26'].refs.Direkte, undefined);
});

test('bots, missing salt and odd paths are ignored', async () => {
  const store = createMemoryVisitStore();
  const bot = await hit(store, { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  const unsalted = await recordVisit(store, { salt: '', ip: IP, ua: CHROME, path: '/', now: NOW });
  const junk = await hit(store, { path: '/wp-admin' });
  assert.equal(bot.reason, 'bot');
  assert.equal(unsalted.reason, 'salt');
  assert.equal(junk.reason, 'path');
  const { doc } = await store.load();
  assert.deepEqual(doc.days, {});
});

test('post pages are kept, and days older than 30 drop off', () => {
  assert.equal(normalizePath('/?m=2020-01&i=3'), '/?m=2020-01&i=3');
  assert.equal(normalizePath('/kontakt'), '/kontakt');
  assert.equal(normalizePath('/nope'), null);
  const old = { version: 1, days: { '2020-01-01': { ids: ['x'], pages: {}, refs: {}, pageKeys: [], refKeys: [] } } };
  const { doc } = applyVisit(old, { day: '2026-10-26', id: 'abc', path: '/', ref: 'Direkte' });
  assert.equal(doc.days['2020-01-01'], undefined);
  assert.equal(doc.days['2026-10-26'].ids.length, 1);
});

test('the summary covers today and the previous 29 days', async () => {
  const store = createMemoryVisitStore();
  await hit(store, { path: '/?m=2020-01&i=3', referrer: 'https://news.ycombinator.com/' });
  const { doc } = await store.load();
  const summary = summarize(doc, '2026-10-26');
  assert.equal(summary.today, 1);
  assert.equal(summary.total, 1);
  assert.equal(summary.daily.length, 30);
  assert.equal(summary.daily[0].date, '2026-10-26');
  assert.equal(summary.pages[0].key, '/?m=2020-01&i=3');
  assert.equal(summary.referrers[0].key, 'news.ycombinator.com');
});

test('the visit route stays quiet and skips a cross-site call', async () => {
  const store = createMemoryVisitStore();
  const handler = createHandler({ env: { VISIT_SALT: 'salt' }, store, now: () => NOW });
  const ok = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/json', 'x-forwarded-for': IP }),
    body: JSON.stringify({ path: '/', referrer: '' }),
  }), ok);
  assert.equal(ok.statusCode, 204);
  const foreign = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.9' }),
    body: JSON.stringify({ path: '/', referrer: '' }),
  }), foreign);
  assert.equal(foreign.statusCode, 204);
  const { doc } = await store.load();
  assert.equal(doc.days['2026-10-26'].ids.length, 1);
});

test('a blob store retries a lost race and still stores one reader', async () => {
  let saved = { version: 1, days: {} };
  let etag = '1';
  let fails = 1;
  const api = {
    async get() {
      return {
        statusCode: 200,
        stream: Readable.from([Buffer.from(JSON.stringify(saved))]),
        blob: { etag },
      };
    },
    async put(pathname, body, opts) {
      assert.equal(pathname, 'analytics/visits.json');
      assert.equal(opts.access, 'private');
      assert.equal(opts.allowOverwrite, true);
      if (fails) {
        fails -= 1;
        const err = new Error('etag');
        err.name = 'BlobPreconditionFailedError';
        throw err;
      }
      assert.equal(opts.ifMatch, etag);
      saved = JSON.parse(body);
      etag = '2';
    },
  };
  const store = createBlobVisitStore('token', api);
  const result = await hit(store);
  assert.equal(result.counted, true);
  assert.equal(saved.days['2026-10-26'].ids.length, 1);
  assert.equal(JSON.stringify(saved).includes(IP), false);
});

test('memory storage is not used on Vercel, and a token selects blob', () => {
  resetMemoryVisitStore();
  assert.equal(createVisitStore({ VERCEL: '1', VISIT_STORE: 'memory' }), null);
  assert.equal(createVisitStore({}), null);
  const blob = createVisitStore({ BLOB_READ_WRITE_TOKEN: 'token' });
  assert.equal(blob.kind, 'blob');
  resetMemoryVisitStore();
});
