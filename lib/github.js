/**
 * Minimal GitHub REST client (no dependencies) for the post store.
 * Reads: directory listing + blobs by sha (blobs are immutable, so cached).
 * Writes: several files in ONE commit via the Git Data API.
 */

const API = 'https://api.github.com';

function createGitHub({ token, owner, repo, branch = 'main', fetchImpl = fetch } = {}) {
  const blobCache = new Map();

  async function gh(method, path, body) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'trondw-site'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${API}/repos/${owner}/${repo}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = new Error(`GitHub ${method} ${path.split('?')[0]} returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /** Files in a directory: [{ name, path, sha, size }] */
  async function listDir(dir, ref = branch) {
    const items = await gh('GET', `/contents/${dir}?ref=${encodeURIComponent(ref)}`);
    return (items || []).filter((x) => x.type === 'file').map(({ name, path, sha, size }) => ({ name, path, sha, size }));
  }

  async function readBlob(sha) {
    if (blobCache.has(sha)) return blobCache.get(sha);
    const blob = await gh('GET', `/git/blobs/${sha}`);
    if (!blob) return null;
    const text = Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    if (blobCache.size > 200) blobCache.clear();
    blobCache.set(sha, text);
    return text;
  }

  /** Read one file at the branch head (any size up to 100 MB). */
  async function readFile(path, ref = branch) {
    const slash = path.lastIndexOf('/');
    const dir = slash > 0 ? path.slice(0, slash) : '';
    const entry = (await listDir(dir, ref)).find((f) => f.path === path);
    if (!entry) return null;
    return { text: await readBlob(entry.sha), sha: entry.sha };
  }

  /**
   * Commit files atomically. `build(read)` receives a reader for the current
   * branch head and returns { message, files: { path: text } } or null to skip.
   * Retries when another commit landed in between.
   */
  async function commitFiles(build, { attempts = 4 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const ref = await gh('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
      if (!ref) throw new Error(`Branch ${branch} not found`);
      const headSha = ref.object.sha;
      const read = (path) => readFile(path, headSha);
      const change = await build(read);
      if (!change) return { skipped: true, head: headSha };
      const head = await gh('GET', `/git/commits/${headSha}`);
      const tree = await gh('POST', '/git/trees', {
        base_tree: head.tree.sha,
        tree: Object.entries(change.files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content }))
      });
      const commit = await gh('POST', '/git/commits', { message: change.message, tree: tree.sha, parents: [headSha] });
      try {
        await gh('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false });
        return { commit: commit.sha };
      } catch (err) {
        if (err.status !== 422 || attempt === attempts) throw err; // 422: not a fast-forward, retry
      }
    }
    throw new Error('commit failed');
  }

  return { listDir, readBlob, readFile, commitFiles };
}

function githubFromEnv(env = process.env, fetchImpl) {
  return createGitHub({
    token: env.GITHUB_TOKEN,
    owner: env.GITHUB_OWNER || 'madsmccaus',
    repo: env.GITHUB_REPO || 'trondw',
    branch: env.GITHUB_BRANCH || 'main',
    fetchImpl
  });
}

module.exports = { createGitHub, githubFromEnv };
