/**
 * Live site data for posts that arrive by email (2026 onwards).
 *
 * Rewrites in vercel.json send these paths here when no static file exists:
 *   /data/latest.json, /data/meta.json, /data/arkiv/years.json,
 *   /data/arkiv/YYYY.json (live years), /data/YYYY-MM.json (live months)
 * Posts are read from the GitHub repo (data/YYYY-MM.json on GITHUB_BRANCH),
 * so a new post shows up within about a minute without a redeploy.
 * The CDN caches each response for 60 s and serves stale copies while it
 * refreshes, so GitHub is asked at most about once a minute per path.
 */

const { githubFromEnv } = require('../lib/github');
const site = require('../lib/site-data');
const base = require('../lib/archive-base.json');
const staticMeta = require('../data/meta.json');
const samples = require('../fixtures/sample-posts.json');

const MEMO_MS = 20 * 1000;
let memo = null; // { at, months: { 'YYYY-MM': rawPosts[] } }

async function loadLiveMonths(gh) {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.months;
  const files = (await gh.listDir('data')).filter((f) => {
    const m = f.name.replace(/\.json$/, '');
    return f.name.endsWith('.json') && site.isLiveMonth(m);
  });
  const months = {};
  await Promise.all(files.map(async (f) => {
    const text = await gh.readBlob(f.sha);
    months[f.name.replace(/\.json$/, '')] = JSON.parse(text || '[]');
  }));
  memo = { at: Date.now(), months };
  return months;
}

function livePostsFrom(months) {
  const all = [];
  for (const m of Object.keys(months).sort()) all.push(...site.keptPosts(m, months[m]).posts);
  return all.sort((a, b) => a.d.localeCompare(b.d));
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const gh = deps.github || githubFromEnv(env);
    const url = new URL(req.url, 'http://x');
    const f = url.searchParams.get('f');

    const send = (status, body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (status === 200) {
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.setHeader('Vercel-CDN-Cache-Control', 'max-age=60, stale-while-revalidate=86400, stale-if-error=86400');
      } else {
        res.setHeader('Cache-Control', 'no-store');
      }
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    try {
      if (f === 'month') {
        const m = url.searchParams.get('m') || '';
        if (!site.isLiveMonth(m)) return send(404, { error: 'Not found' });
        const months = await loadLiveMonths(gh);
        if (!months[m]) return send(404, { error: 'Not found' });
        return send(200, months[m]);
      }

      const live = livePostsFrom(await loadLiveMonths(gh));
      const vercelEnv = env.VERCEL_ENV || 'development';

      if (f === 'latest') {
        return send(200, site.buildLatest(live, { fallback: base.fallback, env: vercelEnv, samples }));
      }
      if (f === 'meta') return send(200, site.mergeMeta(staticMeta, base, live));

      const { buildArkiv } = require('../lib/arkiv');
      const arkiv = buildArkiv(live);
      if (f === 'years') return send(200, site.mergeYears(base, arkiv.years));
      if (f === 'arkiv') {
        const y = url.searchParams.get('y') || '';
        if (!site.isLiveYear(y) || !arkiv.byYear[y]) return send(404, { error: 'Not found' });
        return send(200, arkiv.byYear[y]);
      }
      return send(404, { error: 'Not found' });
    } catch (err) {
      console.error('live data failed:', err.message);
      return send(502, { error: 'Upstream unavailable' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports._resetMemo = () => { memo = null; };
