/**
 * Derived site data (homepage latest posts, /arkiv year index, meta).
 *
 * The archive (2016–2022) is frozen and built into the deployment as static
 * files. Posts from LIVE_FROM onwards arrive by email and are read from the
 * GitHub repo at request time by api/data.js, so a new post needs no redeploy.
 * Both paths use these functions, so the output is identical either way.
 */

const { filterArchivePosts } = require('./archive-junk');
const { buildArkiv } = require('./arkiv');
const { sanitizeEmailContent, sanitizeSubject } = require('./sanitize');

const LIVE_FROM = '2026-01';
const LATEST_COUNT = 5;
const MONTH_RE = /^\d{4}-\d{2}$/;

const isLiveMonth = (m) => MONTH_RE.test(m) && m >= LIVE_FROM;
const isLiveYear = (y) => /^\d{4}$/.test(y) && y >= LIVE_FROM.slice(0, 4);

/** Kept (non-junk) posts of one month file, tagged with their month. */
function keptPosts(month, posts) {
  const { kept, removed } = filterArchivePosts(posts);
  return { posts: kept.map((p) => ({ ...p, _m: month })), removed };
}

function toLatest(p) {
  return {
    m: p.d.slice(0, 7), i: p.i, d: p.d, c: p.c,
    t: sanitizeSubject(p.t) || 'Uten tittel',
    x: sanitizeEmailContent(p.x)
  };
}

/**
 * Newest email posts for the homepage. Falls back to the newest archive posts
 * (passed in as `fallback`, already in latest shape) while there are fewer
 * than LATEST_COUNT email posts. Preview/dev tops up with labeled samples.
 */
function buildLatest(livePosts, { fallback = [], env = 'production', samples = [] } = {}) {
  let latest = livePosts
    .filter((p) => p.src === 'email')
    .map(toLatest)
    .filter((p) => p.x)
    .sort((a, b) => b.d.localeCompare(a.d) || b.i - a.i);
  if (latest.length < LATEST_COUNT) {
    const seen = new Set(latest.map((p) => `${p.m}:${p.i}`));
    latest = latest.concat(fallback.filter((p) => !seen.has(`${p.m}:${p.i}`)).slice(0, LATEST_COUNT - latest.length));
  }
  if (env !== 'production' && latest.length < LATEST_COUNT) {
    latest = latest.concat(samples.map((p, n) => ({ ...p, m: p.d.slice(0, 7), i: `sample-${n}`, sample: true })));
  }
  return latest.slice(0, LATEST_COUNT);
}

/** Newest archive (pre-email) posts in latest shape, for the homepage fallback. */
function archiveFallback(staticPosts) {
  return staticPosts
    .filter((p) => p.src !== 'email' && p.d < '2026' && p.x)
    .map(toLatest)
    .filter((p) => p.x)
    .sort((a, b) => b.d.localeCompare(a.d) || b.i - a.i)
    .slice(0, LATEST_COUNT);
}

/**
 * Base numbers of the frozen archive, written to lib/archive-base.json at build
 * time so the live endpoint can combine them with the email posts.
 */
function buildBase(staticPosts) {
  const sorted = [...staticPosts].sort((a, b) => a.d.localeCompare(b.d));
  const { years } = buildArkiv(sorted);
  return {
    liveFrom: LIVE_FROM,
    total: sorted.length,
    first: sorted.length ? sorted[0].d : null,
    last: sorted.length ? sorted[sorted.length - 1].d : null,
    years,
    fallback: archiveFallback(sorted)
  };
}

/** years.json: frozen archive years + live years. */
function mergeYears(base, liveYears) {
  const map = new Map(base.years.map(([y, n]) => [y, n]));
  for (const [y, n] of liveYears) map.set(y, (map.get(y) || 0) + n);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** meta.json with total_posts and date_range covering the live posts too. */
function mergeMeta(staticMeta, base, livePosts) {
  const meta = { ...staticMeta };
  const dates = livePosts.map((p) => p.d).sort();
  meta.total_posts = base.total + livePosts.length;
  const first = [base.first, dates[0]].filter(Boolean).sort()[0];
  const last = [base.last, dates[dates.length - 1]].filter(Boolean).sort().pop();
  if (first) meta.date_range = [first, last];
  return meta;
}

module.exports = {
  LIVE_FROM, LATEST_COUNT, isLiveMonth, isLiveYear,
  keptPosts, buildLatest, archiveFallback, buildBase, mergeYears, mergeMeta, toLatest
};
