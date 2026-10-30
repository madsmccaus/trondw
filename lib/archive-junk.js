/**
 * Detect scraped WordPress junk and title-only stubs in archive posts.
 * Used by lib/site-data.js and scripts/prune-archive-junk.js.
 */

const WP_404_TITLE = 'Fant ikke siden';
const WP_404_BODY = /Oops!\s*Denne siden ble ikke funnet/i;

const JUNK_TITLE = /^(?:logg inn|login|sign in)$/i;
const JUNK_BODY = [
  /wp-login\.php/i,
  /error establishing a database connection/i,
  /briefly unavailable for scheduled maintenance/i,
  /denne siden ble ikke funnet/i,
];

function plainTextBody(input) {
  return String(input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#*_~>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasArchiveMedia(post) {
  if (post.img?.length) return true;
  if (post.dr?.length) return true;
  if (post.pdf) return true;
  if (post.attach?.length) return true;
  const x = post.x || '';
  return /!\[[^\]]*]\([^)]+\)|<img\b|<iframe\b|<embed\b|<object\b|drive\.google\.com\/file/i.test(x);
}

function isWordPress404Page(post) {
  if (post.t === WP_404_TITLE) return true;
  const x = post.x || '';
  return WP_404_BODY.test(x) && /ble ikke funnet noe her/i.test(x);
}

function isOtherScrapeJunk(post) {
  const t = String(post.t || '').trim();
  if (JUNK_TITLE.test(t)) return true;
  const x = post.x || '';
  if (isWordPress404Page(post)) return false;
  return JUNK_BODY.some((re) => re.test(x));
}

function isEmptyArchiveStub(post) {
  if (isWordPress404Page(post) || isOtherScrapeJunk(post)) return false;
  return !plainTextBody(post.x) && !hasArchiveMedia(post);
}

/** @returns {'wp404'|'scrape'|'empty'|null} */
function archiveJunkReason(post) {
  if (isWordPress404Page(post)) return 'wp404';
  if (isOtherScrapeJunk(post)) return 'scrape';
  if (isEmptyArchiveStub(post)) return 'empty';
  return null;
}

function isArchiveJunk(post) {
  return archiveJunkReason(post) !== null;
}

function filterArchivePosts(posts) {
  const kept = [];
  const removed = { wp404: [], scrape: [], empty: [] };
  for (const post of posts) {
    const reason = archiveJunkReason(post);
    if (reason) removed[reason].push(post);
    else kept.push(post);
  }
  return { kept, removed };
}

module.exports = {
  plainTextBody,
  hasArchiveMedia,
  isWordPress404Page,
  isOtherScrapeJunk,
  isEmptyArchiveStub,
  archiveJunkReason,
  isArchiveJunk,
  filterArchivePosts,
};
