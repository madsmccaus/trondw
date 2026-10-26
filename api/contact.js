/**
 * Contact page and form.
 *
 * Environment variables (server-side only, never written into the page):
 * - CONTACT_TO_EMAIL: inbox that receives the message
 * - CONTACT_FROM_EMAIL: sender Resend is allowed to use
 * - RESEND_API_KEY: the same key the inbound mail handler already uses
 */

const { readBody, sameOrigin, wantsJson, clientIp, replyJson, replyHtml } = require('../lib/http');
const { parseContact, buildMail, sendMail } = require('../lib/contact');
const { contactPage } = require('../lib/contact-page');
const { sharedLimiter, rateKey } = require('../lib/rate-limit');

const HOUR = 60 * 60 * 1000;

function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || ((url, opts) => fetch(url, opts));
  const limiter = deps.limiter || sharedLimiter('contact', { limit: 5, windowMs: HOUR, now: deps.now || Date.now });

  return async function handler(req, res) {
    if (req.method === 'GET') return replyHtml(res, 200, contactPage());
    if (req.method !== 'POST') return replyJson(res, 405, { error: 'Method not allowed' });

    const json = wantsJson(req);
    const fail = (status, error, values) => {
      if (json) return replyJson(res, status, { error });
      return replyHtml(res, status, contactPage({ error, values }));
    };

    if (!sameOrigin(req)) return fail(400, 'Meldingen ble ikke sendt. Prøv igjen om litt.');

    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      const tooBig = err && err.code === 'LIMIT';
      return fail(400, tooBig ? 'Meldingen er for lang.' : 'Meldingen ble ikke sendt. Prøv igjen om litt.');
    }

    const parsed = parseContact(body);
    const values = {
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : '',
      message: typeof body.message === 'string' ? body.message : '',
    };
    const key = rateKey(clientIp(req), env.VISIT_SALT);

    if (parsed.honeypot) {
      if (!limiter.allow(key)) return fail(429, 'For mange meldinger nå. Vent en stund og prøv igjen.');
      if (json) return replyJson(res, 200, { ok: true });
      return replyHtml(res, 200, contactPage({ ok: true }));
    }
    if (parsed.error) return fail(400, parsed.error, values);
    if (!limiter.allow(key)) return fail(429, 'For mange meldinger nå. Vent en stund og prøv igjen.');

    const mail = buildMail({ env, fields: parsed });
    if (!mail) {
      console.error('Contact form is not configured');
      return fail(503, 'Skjemaet er ikke klart ennå.');
    }

    try {
      await sendMail(mail, fetchImpl);
    } catch (err) {
      console.error('contact mail failed', err && err.status ? err.status : 'error');
      return fail(502, 'Meldingen ble ikke sendt. Prøv igjen om litt.', values);
    }

    if (json) return replyJson(res, 200, { ok: true });
    return replyHtml(res, 200, contactPage({ ok: true }));
  };
}

module.exports = createHandler();
module.exports.config = { api: { bodyParser: false } };
module.exports.createHandler = createHandler;
