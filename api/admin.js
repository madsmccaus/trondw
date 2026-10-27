/**
 * Private visitor page.
 *
 * - ADMIN_PASSWORD: the password. If it is missing, the counts stay locked.
 * A signed httpOnly cookie remembers a successful login for a week.
 */

const { readBody, sameOrigin, clientIp, replyHtml, setHeader } = require('../lib/http');
const { createRateLimiter, sharedLimiter, rateKey } = require('../lib/rate-limit');
const { passwordOk, signSession, sessionValid, readCookie, cookieHeader } = require('../lib/admin-auth');
const { dashboard, loginPage } = require('../lib/admin-page');
const { createVisitStore } = require('../lib/visit-store');
const { summarize } = require('../lib/visits');
const { osloDay } = require('../lib/day');

const ROBOTS = { 'X-Robots-Tag': 'noindex, nofollow' };
const FIFTEEN_MIN = 15 * 60 * 1000;

function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || Date.now;
  const limiter = deps.limiter || sharedLimiter('admin-login', { limit: 8, windowMs: FIFTEEN_MIN, now });
  const store = deps.store !== undefined ? deps.store : createVisitStore(env);

  function status() {
    return {
      store: !!store,
      salt: !!String(env.VISIT_SALT || '').trim(),
    };
  }

  async function renderDashboard(res) {
    const ready = status();
    if (!ready.store || !ready.salt) {
      return replyHtml(res, 200, dashboard({ status: ready }), ROBOTS);
    }
    try {
      const loaded = await store.load();
      const summary = summarize(loaded.doc, osloDay(new Date(now())));
      return replyHtml(res, 200, dashboard({ status: ready, summary }), ROBOTS);
    } catch (err) {
      console.error('admin stats failed', err && (err.code || err.name) || 'error');
      return replyHtml(res, 200, dashboard({ status: ready, loadError: true }), ROBOTS);
    }
  }

  return async function handler(req, res) {
    const password = String(env.ADMIN_PASSWORD || '');
    const signedIn = sessionValid(readCookie(req), password, now());

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!password) return replyHtml(res, 200, loginPage({ unconfigured: true }), ROBOTS);
      if (!signedIn) return replyHtml(res, 200, loginPage(), ROBOTS);
      if (req.method === 'HEAD') return replyHtml(res, 200, '', ROBOTS);
      return renderDashboard(res);
    }

    if (req.method !== 'POST') return replyHtml(res, 405, loginPage(), ROBOTS);
    if (!sameOrigin(req)) return replyHtml(res, 400, loginPage({ error: 'Prøv igjen.' }), ROBOTS);

    let body = {};
    try { body = await readBody(req); } catch { return replyHtml(res, 400, loginPage({ error: 'Prøv igjen.' }), ROBOTS); }

    if (body && body.action === 'logout') {
      setHeader(res, 'Set-Cookie', cookieHeader('', req, 0));
      setHeader(res, 'Location', '/admin');
      return replyHtml(res, 303, '', ROBOTS);
    }

    if (!password) return replyHtml(res, 503, loginPage({ unconfigured: true }), ROBOTS);

    const given = typeof body.password === 'string' ? body.password : '';
    if (!passwordOk(given, password)) {
      const key = rateKey(clientIp(req), env.VISIT_SALT || password);
      if (!limiter.allow(key)) {
        return replyHtml(res, 429, loginPage({ error: 'For mange forsøk. Vent litt.' }), ROBOTS);
      }
      return replyHtml(res, 401, loginPage({ error: 'Feil passord.' }), ROBOTS);
    }

    setHeader(res, 'Set-Cookie', cookieHeader(signSession(password, now()), req, 7 * 24 * 60 * 60));
    setHeader(res, 'Location', '/admin');
    return replyHtml(res, 303, '', ROBOTS);
  };
}

module.exports = createHandler();
module.exports.config = { api: { bodyParser: false } };
module.exports.createHandler = createHandler;
