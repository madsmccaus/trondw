/**
 * Quiet page explaining a Vipps gift.
 * 404 unless VIPPS_NUMBER or VIPPS_LINK is set. No payment is taken here.
 */

const { vippsConfig, vippsPage } = require('../lib/vipps');
const { notFoundPage } = require('../lib/page');
const { replyHtml } = require('../lib/http');

function createHandler(deps = {}) {
  const env = deps.env || process.env;
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return replyHtml(res, 405, notFoundPage(), { 'X-Robots-Tag': 'noindex' });
    }
    const config = vippsConfig(env);
    if (!config) return replyHtml(res, 404, notFoundPage(), { 'X-Robots-Tag': 'noindex, nofollow' });
    const html = await vippsPage(config);
    if (req.method === 'HEAD') return replyHtml(res, 200, '');
    return replyHtml(res, 200, html);
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
