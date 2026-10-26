const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/contact');
const { createRateLimiter } = require('../lib/rate-limit');
const { makeReq, makeRes, siteHeaders } = require('./helpers');

const ENV = {
  CONTACT_TO_EMAIL: 'inbox@example.com',
  CONTACT_FROM_EMAIL: 'arkiv@example.com',
  RESEND_API_KEY: 're_test',
  VISIT_SALT: 'salt',
};

function posted(body, headers) {
  return makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  });
}

function setup(env = ENV, limit = 5) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization });
    return { ok: true, status: 200, text: async () => '' };
  };
  const handler = createHandler({
    env,
    fetch: fetchImpl,
    limiter: createRateLimiter({ limit, windowMs: 60 * 60 * 1000, now: () => 1_000_000 }),
  });
  return { handler, calls };
}

test('a message is mailed to the configured inbox, with reply-to when an email was given', async () => {
  const { handler, calls } = setup();
  const res = makeRes();
  await handler(posted({ name: 'Kari', email: 'kari@example.com', message: 'Hei fra leseren', company: '' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(calls[0].body.to, ['inbox@example.com']);
  assert.equal(calls[0].body.reply_to, 'kari@example.com');
  assert.match(calls[0].body.from, /arkiv@example.com/);
  assert.match(calls[0].body.text, /Hei fra leseren/);
  assert.equal(calls[0].auth, 'Bearer re_test');
});

test('the honeypot pretends to succeed and does not send', async () => {
  const { handler, calls } = setup();
  const res = makeRes();
  await handler(posted({ name: 'Bot', message: 'Buy now', company: 'https://spam.example' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(calls.length, 0);
});

test('an empty message is refused', async () => {
  const { handler, calls } = setup();
  const res = makeRes();
  await handler(posted({ message: '   ' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Skriv en melding/);
  assert.equal(calls.length, 0);
});

test('a bad email is refused and a plain form post keeps the text', async () => {
  const { handler, calls } = setup();
  const res = makeRes();
  await handler(makeReq({
    method: 'POST',
    headers: siteHeaders({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: 'name=Kari&email=not-an-email&message=' + encodeURIComponent('Hei <b>der</b>'),
  }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /E-postadressen/);
  assert.match(res.body, /Hei &lt;b&gt;der&lt;\/b&gt;/);
  assert.equal(calls.length, 0);
});

test('a message that is too long is refused', async () => {
  const { handler, calls } = setup();
  const res = makeRes();
  await handler(posted({ message: 'a'.repeat(4001) }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /for lang/);
  assert.equal(calls.length, 0);
});

test('the sixth message in an hour is refused', async () => {
  const { handler, calls } = setup(ENV, 5);
  for (let i = 0; i < 5; i++) {
    const res = makeRes();
    await handler(posted({ message: 'Hei ' + i }), res);
    assert.equal(res.statusCode, 200);
  }
  const blocked = makeRes();
  await handler(posted({ message: 'en for mye' }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body.error, /For mange/);
  assert.equal(calls.length, 5);
});

test('a missing inbox does not send', async () => {
  const { handler, calls } = setup({ ...ENV, CONTACT_TO_EMAIL: '' });
  const res = makeRes();
  await handler(posted({ message: 'Hei' }), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /ikke klart/);
  assert.equal(calls.length, 0);
});

test('another website cannot post the form', async () => {
  const { handler, calls } = setup();
  const res = makeRes();
  await handler(posted({ message: 'Hei' }, { origin: 'https://evil.example' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('the contact page is Norwegian and keeps the honeypot out of sight', async () => {
  const { handler } = setup();
  const res = makeRes();
  await handler(makeReq({ method: 'GET', headers: siteHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<h1>Kontakt<\/h1>/);
  assert.match(res.body, /name="company"/);
  assert.match(res.body, /class="hp"/);
  assert.match(res.body, /valgfritt/);
});
