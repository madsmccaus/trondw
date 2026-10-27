/**
 * Visit log storage.
 *
 * The archive keeps posts in git, which is the wrong place for page views:
 * every write would publish a new version of the site. There is no database
 * on the project today. This file is the seam. A private Vercel Blob store
 * is used when BLOB_READ_WRITE_TOKEN is set. Until then, nothing is stored.
 *
 * Local preview can set VISIT_STORE=memory. That is ignored on Vercel.
 */

const PATHNAME = 'analytics/visits.json';

function emptyDoc() {
  return { version: 1, days: {} };
}

function createMemoryVisitStore(initial) {
  let doc = initial || emptyDoc();
  let etag = 0;
  return {
    kind: 'memory',
    async load() {
      return { doc: structuredClone(doc), etag: String(etag) };
    },
    async save(next, opts = {}) {
      if (opts.etag != null && opts.etag !== String(etag)) {
        const err = new Error('conflict');
        err.code = 'conflict';
        throw err;
      }
      doc = structuredClone(next);
      etag += 1;
    }
  };
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function createBlobVisitStore(token, api) {
  const blob = api || require('@vercel/blob');
  return {
    kind: 'blob',
    async load() {
      const result = await blob.get(PATHNAME, { access: 'private', token, useCache: false });
      if (!result || result.statusCode === 404 || !result.stream) {
        return { doc: emptyDoc(), etag: null };
      }
      let parsed;
      try { parsed = JSON.parse(await readStream(result.stream)); } catch (err) {
        const error = new Error('visit log unreadable');
        error.code = 'corrupt';
        throw error;
      }
      return { doc: parsed, etag: (result.blob && result.blob.etag) || null };
    },
    async save(doc, opts = {}) {
      try {
        await blob.put(PATHNAME, JSON.stringify(doc), {
          access: 'private',
          token,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
          cacheControlMaxAge: 60,
          ...(opts.etag ? { ifMatch: opts.etag } : {}),
        });
      } catch (err) {
        if (err && err.name === 'BlobPreconditionFailedError') {
          const error = new Error('conflict');
          error.code = 'conflict';
          throw error;
        }
        throw err;
      }
    }
  };
}

let memorySingleton = null;

function createVisitStore(env = process.env) {
  if (env.BLOB_READ_WRITE_TOKEN) return createBlobVisitStore(env.BLOB_READ_WRITE_TOKEN);
  if (!env.VERCEL && env.VISIT_STORE === 'memory') {
    if (!memorySingleton) memorySingleton = createMemoryVisitStore();
    return memorySingleton;
  }
  return null;
}

function resetMemoryVisitStore() {
  memorySingleton = null;
}

module.exports = {
  PATHNAME,
  emptyDoc,
  createMemoryVisitStore,
  createBlobVisitStore,
  createVisitStore,
  resetMemoryVisitStore,
};
