const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHandler: adminHandler } = require('../api/admin');
const { createHandler: vippsHandler } = require('../api/vipps');
const { createHandler: stottHandler } = require('../api/stott');
const { createHandler: visitHandler } = require('../api/visit');
const { createMemoryVisitStore } = require('../lib/visit-store');
const { createRateLimiter } = require('../lib/rate-limit');
const { makeReq, makeRes, siteHeaders, CHROME } = require('./helpers');

const NOW = Date.parse('2026-10-26T12:00:00Z');
const PASSWORD = 'correct horse';

function admin(extra = {}) {
  return adminHandler({
    env: { ADMIN_PASSWORD: PASSWORD, VISIT_SALT: 'salt', ...extra.env },
    now: () => NOW,
    store: extra.store === undefined ? createMemoryVisitStore() : extra.store,
    limiter: createRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000, now: () => NOW }),
  });
}

function cookieFrom(res) {
  const raw = res.headers['set-cookie'] || '';
  const match = raw.match(/tw_admin=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

test('admin stays locked without a password and tells the truth', async () => {
  const handler = admin({ env: { ADMIN_PASSWORD: '' }, store: null });
  const res = makeRes();
  await handler(makeReq({ headers: siteHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /ikke satt opp/);
  assert.match(res.body, /noindex/);
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
  assert.doesNotMatch(res.body, /type="password"/);
});

test('a wrong password is refused and the right one sets an httpOnly cookie', async () => {
  const handler = admin();
  const bad = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: 'password=nope',
  }), bad);
  assert.equal(bad.statusCode, 401);
  assert.match(bad.body, /Feil passord/);
  assert.equal(bad.headers['set-cookie'], undefined);

  const good = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: `password=${encodeURIComponent(PASSWORD)}`,
  }), good);
  assert.equal(good.statusCode, 303);
  assert.equal(good.headers.location, '/admin');
  assert.match(good.headers['set-cookie'], /HttpOnly/);
  assert.match(good.headers['set-cookie'], /SameSite=Lax/);
  assert.doesNotMatch(good.headers['set-cookie'], /Secure/);
});

test('the dashboard shows real counts and says when they are not real yet', async () => {
  const store = createMemoryVisitStore();
  const visits = visitHandler({
    env: { VISIT_SALT: 'salt' },
    store,
    now: () => new Date(NOW),
  });
  await visits(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8', 'user-agent': CHROME }),
    body: JSON.stringify({ path: '/om', referrer: 'https://www.google.com/search?q=trond' }),
  }), makeRes());

  const handler = admin({ store });
  const login = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: `password=${encodeURIComponent(PASSWORD)}`,
  }), login);
  const page = makeRes();
  await handler(makeReq({ headers: siteHeaders({ cookie: `tw_admin=${cookieFrom(login)}` }) }), page);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<h1>Besøk<\/h1>/);
  assert.match(page.body, /<strong>1<\/strong>/);
  assert.match(page.body, />\/om</);
  assert.match(page.body, /google\.com/);
  assert.match(page.body, /noindex/);
  assert.doesNotMatch(page.body, /203\.0\.113\.8/);

  const bare = admin({ env: { ADMIN_PASSWORD: PASSWORD, VISIT_SALT: '' }, store: null });
  const login2 = makeRes();
  await bare(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: `password=${encodeURIComponent(PASSWORD)}`,
  }), login2);
  const empty = makeRes();
  await bare(makeReq({ headers: siteHeaders({ cookie: `tw_admin=${cookieFrom(login2)}` }) }), empty);
  assert.match(empty.body, /ikke ekte/);
  assert.doesNotMatch(empty.body, /<strong>0<\/strong>/);
});

test('logging out clears the cookie', async () => {
  const handler = admin();
  const res = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: 'action=logout',
  }), res);
  assert.equal(res.statusCode, 303);
  assert.match(res.headers['set-cookie'], /Max-Age=0/);
});

test('too many wrong passwords are slowed down', async () => {
  const handler = admin();
  for (let i = 0; i < 8; i++) {
    const res = makeRes();
    await handler(makeReq({
      method: 'POST',
      headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9' }),
      body: 'password=nope',
    }), res);
    assert.equal(res.statusCode, 401);
  }
  const blocked = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9' }),
    body: 'password=nope',
  }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body, /For mange forsøk/);
});

test('vipps stays hidden until a number or a real link is set', async () => {
  const hidden = stottHandler({ env: {} });
  const probe = vippsHandler({ env: {} });
  const missing = makeRes();
  await hidden(makeReq({ headers: siteHeaders() }), missing);
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /Siden finnes ikke/);
  const head = makeRes();
  await probe(makeReq({ method: 'HEAD', headers: siteHeaders() }), head);
  assert.equal(head.statusCode, 404);

  const shown = stottHandler({ env: { VIPPS_NUMBER: '123 45 678' } });
  const page = makeRes();
  await shown(makeReq({ headers: siteHeaders() }), page);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /123 45 678/);
  assert.match(page.body, /<svg/);
  assert.match(page.body, /Støtt siden/);
  const on = makeRes();
  await vippsHandler({ env: { VIPPS_NUMBER: '123 45 678' } })(makeReq({ method: 'HEAD' }), on);
  assert.equal(on.statusCode, 204);
  assert.doesNotMatch(String(on.body || ''), /123/);

  const nasty = makeRes();
  await stottHandler({ env: { VIPPS_NUMBER: '<b>', VIPPS_LINK: 'https://example.com/?q="><script>' } })(makeReq(), nasty);
  assert.equal(nasty.statusCode, 200);
  assert.match(nasty.body, /&lt;b&gt;/);
  assert.doesNotMatch(nasty.body, /<script>/i);
  assert.match(nasty.body, /href="https:\/\/example.com\/\?q=&quot;&gt;&lt;script&gt;"/);

  const badLink = makeRes();
  await stottHandler({ env: { VIPPS_LINK: 'javascript:alert(1)' } })(makeReq(), badLink);
  assert.equal(badLink.statusCode, 404);
});

test('the inbox address is not written into the repo, and the footer link is quiet', () => {
  const needle = 'mads' + 'aeloen@' + 'gmail.com';
  const skip = new Set(['node_modules', '.git', 'data', 'fonts', 'flip']);
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name) || name === 'package-lock.json') continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(js|html|css|md|json|txt)$/.test(name)) files.push(full);
    }
  })(path.join(__dirname, '..'));
  for (const file of files) {
    assert.equal(fs.readFileSync(file, 'utf8').includes(needle), false, file);
  }
  for (const page of ['index.html', 'arkiv.html', 'om.html', 'boker.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(html, /href="\/kontakt">Kontakt/);
    assert.match(html, /id="vipps-link" hidden>Støtt siden/);
  }
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.deepEqual(vercel.rewrites.map((r) => r.source), ['/kontakt', '/stott', '/admin']);
});
