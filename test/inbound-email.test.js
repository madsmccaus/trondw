const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { Readable } = require('stream');
const mod = require('../api/inbound-email');

const SECRET = 'whsec_' + Buffer.from('test-secret-key-123').toString('base64');
const NOW = 1_800_000_000;

function sign(body, id = 'msg_1', ts = NOW) {
  const key = Buffer.from(SECRET.slice(6), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` };
}

function makeReq(body, headers, method = 'POST') {
  const req = Readable.from([Buffer.from(body)]);
  req.method = method;
  req.headers = headers;
  return req;
}

function makeRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

const ENV = { RESEND_WEBHOOK_SECRET: SECRET, RESEND_API_KEY: 're_x', ALLOWED_SENDERS: 'Trond@Example.no, mads@example.com' };

function setup(overrides = {}) {
  const stored = [];
  const handler = mod.createHandler({
    env: overrides.env || ENV,
    nowSeconds: NOW,
    fetchReceivedEmail: async (id) => ({
      id, subject: 'Dagbok i dag', created_at: '2026-10-11T23:30:00Z',
      text: 'Fra: noen@example.com\nHei alle sammen.\nMed vennlig hilsen\n', ...overrides.email
    }),
    storePost: async (post) => { stored.push(post); return { postId: 7, file: 'data/x.json' }; }
  });
  return { handler, stored };
}

const event = (from = 'Trond Worren <trond@example.no>') =>
  JSON.stringify({ type: 'email.received', created_at: '2026-10-11T23:30:00Z', data: { email_id: 'em_1', from, subject: 'Dagbok i dag' } });

test('valid signed email from allowed sender is stored', async () => {
  const { handler, stored } = setup();
  const body = event();
  const res = makeRes();
  await handler(makeReq(body, sign(body)), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(stored[0].d, '2026-10-12'); // Oslo date
  assert.ok(!stored[0].x.includes('@'));
  assert.ok(stored[0].x.includes('Hei alle sammen.'));
});

test('bad signature is rejected', async () => {
  const { handler, stored } = setup();
  const body = event();
  const headers = sign(body); headers['svix-signature'] = 'v1,AAAA';
  const res = makeRes();
  await handler(makeReq(body, headers), res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(stored.length, 0);
});

test('tampered body is rejected', async () => {
  const { handler } = setup();
  const res = makeRes();
  await handler(makeReq(event('x@evil.com'), sign(event())), res);
  assert.strictEqual(res.statusCode, 401);
});

test('stale timestamp is rejected', async () => {
  const { handler } = setup();
  const body = event();
  const res = makeRes();
  await handler(makeReq(body, sign(body, 'msg_1', NOW - 3600)), res);
  assert.strictEqual(res.statusCode, 401);
});

test('missing secret fails closed', async () => {
  const { handler, stored } = setup({ env: { ...ENV, RESEND_WEBHOOK_SECRET: '' } });
  const body = event();
  const res = makeRes();
  await handler(makeReq(body, sign(body)), res);
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(stored.length, 0);
});

test('non-allowlisted sender is ignored', async () => {
  const { handler, stored } = setup();
  const body = event('Spammer <spam@evil.com>');
  const res = makeRes();
  await handler(makeReq(body, sign(body)), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(stored.length, 0);
});

test('other event types are ignored', async () => {
  const { handler, stored } = setup();
  const body = JSON.stringify({ type: 'email.sent', data: {} });
  const res = makeRes();
  await handler(makeReq(body, sign(body)), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(stored.length, 0);
});

test('GET is rejected', async () => {
  const { handler } = setup();
  const res = makeRes();
  await handler(makeReq('', {}, 'GET'), res);
  assert.strictEqual(res.statusCode, 405);
});

test('html-only email falls back to text', async () => {
  const { handler, stored } = setup({ email: { text: '', html: '<p>Hei</p><p>verden</p>' } });
  const body = event();
  const res = makeRes();
  await handler(makeReq(body, sign(body)), res);
  assert.match(stored[0].x, /Hei\s+verden/);
});

test('helpers', () => {
  assert.strictEqual(mod.extractAddress('A B <X@Y.no>'), 'x@y.no');
  assert.deepStrictEqual(mod.parseAllowedSenders(' A@b.no ,, c@d.no'), ['a@b.no', 'c@d.no']);
});
