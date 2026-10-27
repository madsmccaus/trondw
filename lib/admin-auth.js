/**
 * Password gate for /admin.
 * The password lives only in ADMIN_PASSWORD. The cookie is httpOnly and
 * signed with that password, so changing the password signs everyone out.
 */

const crypto = require('crypto');

const COOKIE = 'tw_admin';
const WEEK = 7 * 24 * 60 * 60;

function passwordOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function signSession(password, nowMs) {
  const exp = Math.floor(nowMs / 1000) + WEEK;
  const payload = Buffer.from(JSON.stringify({ v: 1, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', password).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function sessionValid(token, password, nowMs) {
  if (!password || typeof token !== 'string' || !token.includes('.')) return false;
  const i = token.lastIndexOf('.');
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', password).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return false; }
  if (!data || data.v !== 1 || typeof data.exp !== 'number') return false;
  const now = Math.floor(nowMs / 1000);
  if (data.exp < now || data.exp > now + 8 * 24 * 60 * 60) return false;
  return true;
}

function readCookie(req, name = COOKIE) {
  const raw = String((req.headers && req.headers.cookie) || '');
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i) !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1)); } catch { return ''; }
  }
  return '';
}

function cookieHeader(value, req, maxAge) {
  const proto = String((req.headers && req.headers['x-forwarded-proto']) || '');
  const first = proto.split(',')[0].trim();
  // Secure on https. If Vercel did not say, still mark it Secure so the
  // cookie is not offered back over plain http. Local http leaves it off.
  const secure = first === 'https' || (!first && !!process.env.VERCEL);
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  COOKIE,
  WEEK,
  passwordOk,
  signSession,
  sessionValid,
  readCookie,
  cookieHeader,
};
