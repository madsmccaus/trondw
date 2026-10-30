const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeReq, makeRes } = require('./helpers');
const { createGitHub } = require('../lib/github');
const store = require('../lib/post-store');
const dataApi = require('../api/data');

const post = (d, t, extra = {}) => ({ i: 0, d, t, s: 'x', c: 'dagbok', x: `${t} tekst om dagen`, u: '', img: [], dr: [], src: 'email', ...extra });

/** In-memory GitHub repo implementing the REST calls lib/github.js uses. */
function fakeRepo(files) {
  let n = 0;
  const blobs = new Map();
  const put = (text) => { const sha = `b${n++}`; blobs.set(sha, text); return sha; };
  const tree = new Map(Object.entries(files).map(([p, t]) => [p, put(t)]));
  let head = 'c0';
  const commits = new Map([['c0', { tree: new Map(tree) }]]);
  const log = [];
  const json = (status, body) => ({ status, ok: status < 300, json: async () => body });
  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    const p = u.pathname.replace('/repos/o/r', '');
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    log.push(`${method} ${p}`);
    if (p.startsWith('/contents/')) {
      const dir = p.slice('/contents/'.length);
      const t = commits.get(u.searchParams.get('ref')) || commits.get(head);
      return json(200, [...t.tree].filter(([f]) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'))
        .map(([f, sha]) => ({ type: 'file', name: f.split('/').pop(), path: f, sha, size: blobs.get(sha).length })));
    }
    if (p.startsWith('/git/blobs/')) return json(200, { encoding: 'base64', content: Buffer.from(blobs.get(p.split('/').pop())).toString('base64') });
    if (p.startsWith('/git/ref/heads/')) return json(200, { object: { sha: head } });
    if (p.startsWith('/git/commits/') && method === 'GET') return json(200, { tree: { sha: p.split('/').pop() } });
    if (p === '/git/trees') {
      const t = new Map(commits.get(body.base_tree).tree);
      for (const e of body.tree) t.set(e.path, put(e.content));
      const id = `t${n++}`; commits.set(id, { tree: t }); return json(201, { sha: id });
    }
    if (p === '/git/commits') { const id = `c${n++}`; commits.set(id, { tree: commits.get(body.tree).tree, message: body.message }); return json(201, { sha: id }); }
    if (p.startsWith('/git/refs/heads/')) { head = body.sha; return json(200, {}); }
    return json(404, {});
  }
  const read = (f) => blobs.get(commits.get(head).tree.get(f));
  return { fetchImpl, read, log, commitCount: () => [...commits.values()].filter((c) => c.message).length };
}

test('an email post lands in the month file and the entries log in ONE commit, no rebuild trigger', async () => {
  const repo = fakeRepo({ 'data/2026-10.json': JSON.stringify([post('2026-10-29', 'Før', { i: 7 })], null, 2), 'data/entries.json': '[]\n' });
  const gh = createGitHub({ owner: 'o', repo: 'r', branch: 'main', fetchImpl: repo.fetchImpl });
  const images = [{ id: 'a1', filename: 'bilde.jpg', content_type: 'image/jpeg', size: 1234 }];
  const r = await store.storePost(post('2026-10-30', 'Ny'), { emailId: 'em_1', receivedAt: '2026-10-30T08:00:00Z', images }, gh);
  assert.deepEqual(r, { success: true, postId: 8, file: 'data/2026-10.json' });
  assert.equal(repo.commitCount(), 1);
  const month = JSON.parse(repo.read('data/2026-10.json'));
  assert.deepEqual(month.map((p) => [p.i, p.t]), [[7, 'Før'], [8, 'Ny']]);
  const log = JSON.parse(repo.read('data/entries.json'));
  assert.equal(log.length, 1);
  assert.deepEqual(log[0], { email_id: 'em_1', received_at: '2026-10-30T08:00:00Z', date: '2026-10-30', title: 'Ny', body: 'Ny tekst om dagen', category: 'dagbok', images, post: '2026-10#8' });
  assert.equal(repo.read('data/.last-update'), undefined);
  assert.ok(!repo.log.some((l) => l.includes('.last-update')));

  // Webhook retry of the same email: no second post, no new commit
  const again = await store.storePost(post('2026-10-30', 'Ny'), { emailId: 'em_1' }, gh);
  assert.equal(again.duplicate, true);
  assert.equal(again.postId, 8);
  assert.equal(repo.commitCount(), 1);

  // New month file gets created; log keeps appending
  await store.storePost(post('2026-11-01', 'November'), { emailId: 'em_2' }, gh);
  assert.equal(JSON.parse(repo.read('data/2026-11.json'))[0].i, 0);
  assert.equal(JSON.parse(repo.read('data/entries.json')).length, 2);
  assert.match(repo.read('data/entries.json'), /^\[\n\{.*\},\n\{.*\}\n\]\n$/);
});

test('live data endpoint serves email-era files from the repo with CDN caching', async () => {
  const months = {
    'data/2026-10.json': JSON.stringify([post('2026-10-22', 'Første', { i: 0 }), post('2026-10-30', 'Siste', { i: 1 })]),
    'data/2019-03.json': '[]',
    'data/entries.json': '[]\n'
  };
  const repo = fakeRepo(months);
  const gh = createGitHub({ owner: 'o', repo: 'r', fetchImpl: repo.fetchImpl });
  const call = async (url) => {
    dataApi._resetMemo();
    const res = makeRes();
    await dataApi.createHandler({ github: gh, env: { VERCEL_ENV: 'production' } })(makeReq({ url }), res);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, headers: res.headers };
  };
  const latest = await call('/api/data?f=latest');
  assert.equal(latest.status, 200);
  assert.equal(latest.body[0].t, 'Siste');
  assert.equal(latest.body[0].m, '2026-10');
  assert.match(latest.headers['vercel-cdn-cache-control'], /max-age=60/);
  const month = await call('/api/data?f=month&m=2026-10');
  assert.equal(month.body.length, 2);
  assert.equal((await call('/api/data?f=month&m=2019-03')).status, 404); // frozen months are not live
  const years = await call('/api/data?f=years');
  assert.ok(years.body.some(([y]) => y === '2026'));
  assert.ok(years.body.some(([y]) => y === '2019'));
  assert.equal((await call('/api/data?f=arkiv&y=2026')).status, 200);
  const meta = await call('/api/data?f=meta');
  assert.equal(meta.body.date_range[1], '2026-10-30');
});

test('the build output is small and leaves heavy files to trondw-assets', () => {
  const root = path.join(__dirname, '..');
  execFileSync('node', ['scripts/build.js'], { cwd: root, stdio: 'ignore' });
  const out = path.join(root, 'public');
  let bytes = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } })(out);
  assert.ok(bytes < 2e6, `public/ is ${bytes} bytes`);
  assert.ok(fs.existsSync(path.join(out, 'flip', 'manifest.json')));
  assert.ok(!fs.existsSync(path.join(out, 'covers')));
  assert.ok(!fs.existsSync(path.join(out, 'data', 'latest.json')));
  const boker = fs.readFileSync(path.join(out, 'boker.html'), 'utf8');
  assert.match(boker, /const ASSETS="https:\/\/trondw-assets\.vercel\.app"/);
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(vercel.outputDirectory, 'public');
  assert.ok(!vercel.headers.some((h) => h.source === '/data/(.*)'), 'a blanket /data cache header would pin live data');
});
