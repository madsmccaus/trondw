#!/usr/bin/env node
/**
 * Make data/entries.json complete: add any email post (data/2026+ months) that
 * is missing from the log, and fill in email_id / received_at from Resend when
 * RESEND_API_KEY is set (matched on subject + Oslo date). Safe to re-run.
 *   node scripts/backfill-entries.js
 */
const fs = require('fs');
const path = require('path');
const { toEntry, parseEntries, formatEntries, ENTRIES_PATH } = require('../lib/post-store');
const { sanitizeSubject } = require('../lib/sanitize');
const { isLiveMonth } = require('../lib/site-data');

const root = path.join(__dirname, '..');
const file = path.join(root, ENTRIES_PATH);
const entries = parseEntries(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const byPost = new Map(entries.map((e) => [e.post, e]));
let added = 0;
for (const f of fs.readdirSync(path.join(root, 'data')).sort()) {
  const m = f.replace(/\.json$/, '');
  if (!isLiveMonth(m)) continue;
  for (const p of JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'))) {
    if (p.src !== 'email' || byPost.has(`${m}#${p.i}`)) continue;
    const e = toEntry(p, { images: [] }, m, p.i);
    entries.push(e); byPost.set(e.post, e); added++;
  }
}

async function enrich() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 0;
  const osloDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date(iso));
  const mail = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const url = `https://api.resend.com/emails/receiving?limit=100${after ? `&after=${after}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Resend list ${res.status}`);
    const body = await res.json();
    mail.push(...(body.data || []));
    if (!body.has_more || !body.data || !body.data.length) break;
    after = body.data[body.data.length - 1].id;
  }
  const used = new Set(entries.map((e) => e.email_id).filter(Boolean));
  let filled = 0;
  // oldest first, so repeated subjects on one day pair up in order
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date) || Number(a.post.split('#')[1]) - Number(b.post.split('#')[1]));
  const candidates = mail.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of ordered) {
    if (e.email_id) continue;
    const hit = candidates.find((x) => !used.has(x.id) && osloDate(x.created_at) === e.date &&
      (sanitizeSubject(x.subject || '') || 'Uten tittel') === e.title);
    if (!hit) continue;
    used.add(hit.id);
    e.email_id = hit.id;
    e.received_at = hit.created_at;
    e.images = (hit.attachments || []).map((a) => ({ id: a.id || null, filename: a.filename || null, content_type: a.content_type || null, size: a.size == null ? null : a.size }));
    filled++;
  }
  return filled;
}

enrich().then((filled) => {
  entries.sort((a, b) => a.date.localeCompare(b.date) || String(a.post).localeCompare(String(b.post), 'en', { numeric: true }));
  fs.writeFileSync(file, formatEntries(entries));
  console.log(`entries: ${entries.length} (added ${added}, email ids filled ${filled})`);
});
