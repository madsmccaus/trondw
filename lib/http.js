/**
 * Small helpers for the Node serverless routes.
 * Handlers use Vercel's res.status().json()/send() helpers.
 */

const MAX_DEFAULT = 32 * 1024;

function setHeader(res, name, value) {
  if (typeof res.setHeader === 'function') res.setHeader(name, value);
}

function clientIp(req) {
  const headers = req.headers || {};
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.trim()) return raw.split(',')[0].trim().slice(0, 80);
  if (req.socket && req.socket.remoteAddress) return String(req.socket.remoteAddress);
  return '';
}

function sameOrigin(req) {
  const host = String((req.headers && req.headers.host) || '').toLowerCase();
  if (!host) return false;
  const origin = req.headers.origin;
  if (origin) {
    try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
  }
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) {
    try { return new URL(referer).host.toLowerCase() === host; } catch { return false; }
  }
  const site = String(req.headers['sec-fetch-site'] || '');
  return site === 'same-origin' || site === 'same-site';
}

function wantsJson(req) {
  return String((req.headers && req.headers['content-type']) || '').includes('application/json');
}

async function readRaw(req, limit) {
  if (typeof req.body === 'string') return req.body.slice(0, limit + 1);
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8').slice(0, limit + 1);
  if (req.body && typeof req.body === 'object') return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) {
      const err = new Error('too large');
      err.code = 'LIMIT';
      throw err;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(req, limit = MAX_DEFAULT) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRaw(req, limit);
  if (raw == null) return {};
  if (raw.length > limit) {
    const err = new Error('too large');
    err.code = 'LIMIT';
    throw err;
  }
  const type = String((req.headers && req.headers['content-type']) || '');
  const text = raw.trim();
  if (!text) return {};
  if (type.includes('application/json') || text.startsWith('{') || text.startsWith('[')) {
    try { return JSON.parse(text); } catch (err) {
      const error = new Error('invalid json');
      error.code = 'JSON';
      throw error;
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

function applyNoStore(res) {
  setHeader(res, 'Cache-Control', 'private, no-store');
  setHeader(res, 'CDN-Cache-Control', 'no-store');
}

function replyJson(res, status, body, headers) {
  if (headers) for (const [k, v] of Object.entries(headers)) setHeader(res, k, v);
  applyNoStore(res);
  return res.status(status).json(body);
}

function replyHtml(res, status, html, headers) {
  if (headers) for (const [k, v] of Object.entries(headers)) setHeader(res, k, v);
  applyNoStore(res);
  setHeader(res, 'Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(html);
}

function replyEmpty(res, status, headers) {
  if (headers) for (const [k, v] of Object.entries(headers)) setHeader(res, k, v);
  applyNoStore(res);
  res.status(status);
  if (typeof res.end === 'function') return res.end();
  return res.send('');
}

module.exports = {
  clientIp,
  sameOrigin,
  wantsJson,
  readBody,
  replyJson,
  replyHtml,
  replyEmpty,
  setHeader,
};
