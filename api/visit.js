/**
 * One quiet count per real reader per day.
 *
 * - VISIT_SALT: secret mixed into the daily hash. Without it, nothing is stored.
 * - BLOB_READ_WRITE_TOKEN: private Vercel Blob store. Without it, nothing is stored.
 *
 * The response is always empty. The address is never written down.
 */

const { readBody, clientIp, sameOrigin, replyEmpty } = require('../lib/http');
const { createVisitStore } = require('../lib/visit-store');
const { recordVisit } = require('../lib/visits');

function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const store = deps.store !== undefined ? deps.store : createVisitStore(env);

  return async function handler(req, res) {
    if (req.method !== 'POST') return replyEmpty(res, 405);
    const purpose = String((req.headers && (req.headers['sec-purpose'] || req.headers.purpose)) || '');
    if (purpose.toLowerCase().includes('prefetch')) return replyEmpty(res, 204);
    if (!sameOrigin(req)) return replyEmpty(res, 204);

    let body = {};
    try { body = await readBody(req, 2000); } catch { return replyEmpty(res, 204); }
    if (!body || typeof body !== 'object') return replyEmpty(res, 204);

    try {
      await recordVisit(store, {
        salt: env.VISIT_SALT,
        ip: clientIp(req),
        ua: req.headers && req.headers['user-agent'],
        path: body.path,
        referrer: body.referrer,
        host: req.headers && req.headers.host,
        now: deps.now ? deps.now() : new Date(),
      });
    } catch (err) {
      console.error('visit store failed', err && (err.code || err.name) || 'error');
    }
    return replyEmpty(res, 204);
  };
}

module.exports = createHandler();
module.exports.config = { api: { bodyParser: false } };
module.exports.createHandler = createHandler;
