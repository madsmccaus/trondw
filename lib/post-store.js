/**
 * Where email posts are kept (all in the GitHub repo, one commit per email):
 *  - data/YYYY-MM.json  the month file the site reads (via api/data.js)
 *  - data/entries.json  append-only log of every email entry, one JSON object
 *                       per line inside an array (valid JSON, readable diffs)
 * No deploy is needed: the site reads these files at request time.
 */

const { githubFromEnv } = require('./github');

const ENTRIES_PATH = 'data/entries.json';

function parseEntries(text) {
  if (!text || !text.trim()) return [];
  const list = JSON.parse(text);
  return Array.isArray(list) ? list : [];
}

function formatEntries(list) {
  if (!list.length) return '[]\n';
  return '[\n' + list.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n';
}

/** Add a post to a month file's text. Returns { text, id }. */
function addToMonth(monthText, post) {
  const posts = monthText ? JSON.parse(monthText) : [];
  const id = posts.length ? Math.max(...posts.map((p) => p.i)) + 1 : 0;
  posts.push({ ...post, i: id });
  posts.sort((a, b) => a.d.localeCompare(b.d));
  return { text: JSON.stringify(posts, null, 2), id };
}

/** Log entry for data/entries.json. */
function toEntry(post, { emailId = null, receivedAt = null, images = [] } = {}, month, id) {
  return {
    email_id: emailId,
    received_at: receivedAt,
    date: post.d,
    title: post.t,
    body: post.x,
    category: post.c,
    images,
    post: `${month}#${id}`
  };
}

/**
 * Commit one email post (month file + log) in a single commit.
 * Idempotent on email_id: a webhook retry of the same email is a no-op.
 */
async function storePost(post, meta = {}, gh = githubFromEnv()) {
  const month = post.d.slice(0, 7);
  const file = `data/${month}.json`;
  let out = null;

  await gh.commitFiles(async (read) => {
    const [monthFile, logFile] = await Promise.all([read(file), read(ENTRIES_PATH)]);
    const entries = parseEntries(logFile && logFile.text);
    const dupe = meta.emailId && entries.find((e) => e.email_id === meta.emailId);
    if (dupe) {
      const [m, i] = String(dupe.post || '').split('#');
      out = { duplicate: true, postId: Number(i), file: `data/${m}.json` };
      return null;
    }
    const { text, id } = addToMonth(monthFile && monthFile.text, post);
    entries.push(toEntry(post, meta, month, id));
    out = { postId: id, file };
    return {
      message: `Add email post: ${post.t}`,
      files: { [file]: text, [ENTRIES_PATH]: formatEntries(entries) }
    };
  });

  return { success: true, ...out };
}

module.exports = { storePost, addToMonth, toEntry, parseEntries, formatEntries, ENTRIES_PATH };
