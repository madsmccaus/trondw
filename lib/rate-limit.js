/**
 * Per-key sliding window. Keys are hashes, never raw addresses.
 * The in-memory window lives on one server instance; that is enough
 * to slow form abuse on a quiet site, and it needs no extra service.
 */

const crypto = require('crypto');

function rateKey(ip, salt) {
  return crypto.createHmac('sha256', salt || 'tw-rate').update(String(ip || 'unknown')).digest('hex').slice(0, 32);
}

function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return {
    allow(key) {
      const t = now();
      const fresh = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
      if (fresh.length >= limit) {
        hits.set(key, fresh);
        return false;
      }
      fresh.push(t);
      hits.set(key, fresh);
      if (hits.size > 5000) hits.delete(hits.keys().next().value);
      return true;
    }
  };
}

const shared = new Map();

function sharedLimiter(name, opts) {
  if (!shared.has(name)) shared.set(name, createRateLimiter(opts));
  return shared.get(name);
}

module.exports = { createRateLimiter, sharedLimiter, rateKey };
