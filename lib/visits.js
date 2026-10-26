/**
 * Privacy-friendly counts.
 * A reader is counted once per Oslo day. The id is a salted hash of the
 * day, the address and the browser. The address itself is not stored.
 * The same reader is counted once per page per day, and their first
 * referrer of the day is the one we keep.
 */

const crypto = require('crypto');
const { isBot } = require('./bots');
const { osloDay, shiftDay } = require('./day');

const PAGES = new Set(['/', '/arkiv', '/boker', '/om', '/kontakt', '/stott']);
const MAX_PER_DAY = 5000;
const OWN_HOSTS = new Set(['trondworren.net', 'www.trondworren.net']);

function emptyDoc() {
  return { version: 1, days: {} };
}

function cleanCounts(obj) {
  const out = Object.create(null);
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const n = Number(value);
    if (Number.isInteger(n) && n > 0 && n < 1e7 && key.length <= 180) out[key] = n;
  }
  return out;
}

function normalizeDoc(raw) {
  const doc = emptyDoc();
  if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object') return doc;
  for (const [day, bucket] of Object.entries(raw.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !bucket || typeof bucket !== 'object') continue;
    doc.days[day] = {
      ids: Array.isArray(bucket.ids) ? bucket.ids.filter((x) => typeof x === 'string' && x.length <= 64).slice(0, MAX_PER_DAY) : [],
      pages: cleanCounts(bucket.pages),
      refs: cleanCounts(bucket.refs),
      pageKeys: Array.isArray(bucket.pageKeys) ? bucket.pageKeys.filter((x) => typeof x === 'string').slice(0, MAX_PER_DAY * 8) : [],
      refKeys: Array.isArray(bucket.refKeys) ? bucket.refKeys.filter((x) => typeof x === 'string').slice(0, MAX_PER_DAY) : [],
    };
  }
  return doc;
}

function visitorId(salt, day, ip, ua) {
  return crypto.createHmac('sha256', salt).update(`${day}\n${ip}\n${ua}`).digest('hex').slice(0, 32);
}

function normalizePath(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw.startsWith('/') || raw.length > 180) return null;
  if (raw.includes('\\') || raw.includes('@') || raw.includes('..')) return null;
  let url;
  try { url = new URL(raw, 'https://trondworren.net'); } catch { return null; }
  let path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path.includes('//')) return null;
  if (path === '/') {
    const month = url.searchParams.get('m') || '';
    const id = url.searchParams.get('i') || '';
    if (!month && !id) return '/';
    if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{1,6}$/.test(id)) return null;
    return `/?m=${month}&i=${id}`;
  }
  if (!PAGES.has(path)) return null;
  return path;
}

function referrerHost(raw, selfHost) {
  if (!raw || typeof raw !== 'string') return 'Direkte';
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch { return 'Direkte'; }
  if (!host || host.length > 80) return 'Direkte';
  const bare = host.replace(/^www\./, '');
  const self = String(selfHost || '').split(':')[0].toLowerCase().replace(/^www\./, '');
  if (bare === self || OWN_HOSTS.has(host) || OWN_HOSTS.has(bare) || host.endsWith('.vercel.app')) return 'Direkte';
  return bare;
}

function prune(doc, today) {
  const start = shiftDay(today, -29);
  for (const day of Object.keys(doc.days)) {
    if (day < start) delete doc.days[day];
  }
}

function bucketFor(doc, day) {
  if (!doc.days[day]) {
    doc.days[day] = { ids: [], pages: Object.create(null), refs: Object.create(null), pageKeys: [], refKeys: [] };
  }
  return doc.days[day];
}

function applyVisit(doc, { day, id, path, ref }) {
  const next = normalizeDoc(doc);
  prune(next, day);
  const bucket = bucketFor(next, day);
  let counted = false;
  if (!bucket.ids.includes(id)) {
    if (bucket.ids.length >= MAX_PER_DAY) return { doc: next, counted: false };
    bucket.ids.push(id);
    counted = true;
  }
  const pageKey = `${id}|${path}`;
  if (!bucket.pageKeys.includes(pageKey)) {
    bucket.pageKeys.push(pageKey);
    bucket.pages[path] = (bucket.pages[path] || 0) + 1;
  }
  if (!bucket.refKeys.includes(id)) {
    bucket.refKeys.push(id);
    bucket.refs[ref] = (bucket.refs[ref] || 0) + 1;
  }
  return { doc: next, counted };
}

async function updateDoc(store, mutator) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    const loaded = await store.load();
    const { doc, counted } = mutator(normalizeDoc(loaded.doc));
    try {
      await store.save(doc, { etag: loaded.etag });
      return { doc, counted };
    } catch (err) {
      lastErr = err;
      if (err && err.code !== 'conflict' && err.name !== 'BlobPreconditionFailedError') throw err;
    }
  }
  throw lastErr;
}

async function recordVisit(store, input) {
  if (!store) return { stored: false, reason: 'store' };
  const salt = String(input.salt || '').trim();
  if (!salt) return { stored: false, reason: 'salt' };
  if (isBot(input.ua)) return { stored: false, reason: 'bot' };
  if (!input.ip) return { stored: false, reason: 'ip' };
  const path = normalizePath(input.path);
  if (!path) return { stored: false, reason: 'path' };
  const day = osloDay(input.now || new Date());
  const id = visitorId(salt, day, input.ip, input.ua);
  const ref = referrerHost(input.referrer, input.host);
  const result = await updateDoc(store, (doc) => applyVisit(doc, { day, id, path, ref }));
  return { stored: true, counted: result.counted, day, path };
}

function topCounts(map, limit = 12) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'nb'))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function summarize(doc, today) {
  const safe = normalizeDoc(doc);
  const start = shiftDay(today, -29);
  const daily = [];
  const pages = Object.create(null);
  const refs = Object.create(null);
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const day = shiftDay(start, i);
    const bucket = safe.days[day];
    const visitors = bucket ? bucket.ids.length : 0;
    daily.push({ date: day, visitors });
    total += visitors;
    if (!bucket) continue;
    for (const [path, count] of Object.entries(bucket.pages)) pages[path] = (pages[path] || 0) + count;
    for (const [ref, count] of Object.entries(bucket.refs)) refs[ref] = (refs[ref] || 0) + count;
  }
  return {
    today: safe.days[today] ? safe.days[today].ids.length : 0,
    total,
    daily: daily.reverse(),
    pages: topCounts(pages),
    referrers: topCounts(refs),
  };
}

module.exports = {
  normalizePath,
  referrerHost,
  visitorId,
  applyVisit,
  normalizeDoc,
  recordVisit,
  summarize,
  updateDoc,
};
