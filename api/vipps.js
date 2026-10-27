/**
 * Tells the footer whether the Vipps page should be linked.
 * The number itself is not included. Set VIPPS_NUMBER or VIPPS_LINK.
 */

const { vippsConfig } = require('../lib/vipps');
const { replyEmpty } = require('../lib/http');

function createHandler(deps = {}) {
  const env = deps.env || process.env;
  return function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return replyEmpty(res, 405);
    if (!vippsConfig(env)) return replyEmpty(res, 404);
    return replyEmpty(res, 204);
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
