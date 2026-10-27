/**
 * Known non-browser clients. A short or empty user agent counts as a bot
 * so scanners that send nothing are not stored as readers.
 */

const SNIPPETS = [
  'bot', 'crawl', 'spider', 'slurp', 'mediapartners', 'facebookexternalhit',
  'whatsapp/', 'telegrambot', 'twitterbot', 'linkedinbot', 'slackbot',
  'discordbot', 'embedly', 'quora link preview', 'pinterestbot', 'vkshare',
  'wget', 'curl/', 'python-requests', 'python-urllib', 'go-http-client',
  'headless', 'phantomjs', 'selenium', 'lighthouse', 'pagespeed', 'pingdom',
  'ahrefs', 'semrush', 'mj12bot', 'dotbot', 'petalbot', 'bytespider',
  'gptbot', 'claudebot', 'anthropic-ai', 'ccbot', 'amazonbot', 'bingbot',
  'googlebot', 'duckduckbot', 'yandex', 'baiduspider', 'sogou',
  'ia_archiver', 'archive.org_bot', 'applebot', 'scrapy', 'libwww',
  'httpclient', 'java/', 'axios/', 'node-fetch', 'uptimerobot', 'statuscake',
  'site24x7', 'vercel-screenshot',
];

function isBot(ua) {
  if (!ua || typeof ua !== 'string') return true;
  const s = ua.trim().toLowerCase();
  if (s.length < 12 || s.length > 400) return true;
  return SNIPPETS.some((part) => s.includes(part));
}

module.exports = { isBot };
