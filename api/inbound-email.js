/**
 * Email Inbound Webhook Handler (Resend Receiving)
 *
 * Resend receives mail for the receiving domain (post.trondworren.net), then
 * POSTs an `email.received` webhook here. The webhook only carries metadata,
 * so we fetch the body from the Receiving API, check the sender against an
 * allowlist, sanitize the content and commit the post to GitHub.
 *
 * Required environment variables:
 * - RESEND_WEBHOOK_SECRET: Signing secret of the Resend webhook (whsec_...)
 * - RESEND_API_KEY: Resend API key (re_...) used to fetch the email body
 * - ALLOWED_SENDERS: Comma-separated sender addresses allowed to post
 * - GITHUB_TOKEN: Fine-grained token with Contents read/write on the repo
 * - GITHUB_OWNER: Repository owner (e.g. 'madsmccaus')
 * - GITHUB_REPO: Repository name (e.g. 'trondw')
 * - GITHUB_BRANCH: Branch to commit to (the Vercel production branch)
 * Optional:
 * - POST_TIMEZONE: Timezone used for the post date (default Europe/Oslo)
 */

const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');

const { sanitizeEmailContent, sanitizeSubject, htmlToText } = require('../lib/sanitize');

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Detect category from content (simple heuristic)
function detectCategory(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  
  if (text.includes('dikt') || text.includes('poem')) return 'dikt';
  if (text.includes('forkynnelse') || text.includes('preaching')) return 'forkynnelse';
  if (text.includes('forbønn') || text.includes('prayer')) return 'forbonn';
  if (text.includes('mirakel') || text.includes('miracle')) return 'mirakel';
  if (text.includes('plakat') || text.includes('poster')) return 'plakat';
  if (text.includes('bok') || text.includes('book')) return 'bok';
  
  // Default to 'dagbok' (diary)
  return 'dagbok';
}

// Store post in GitHub via API (octokit optional for tests)
async function storePost(post, octokitInstance) {
  const octokit = octokitInstance || new Octokit({
    auth: process.env.GITHUB_TOKEN
  });
  
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'feat/vercel-archive-demo';
  
  // Determine which monthly file to update
  const yearMonth = post.d.slice(0, 7); // e.g., "2024-09"
  const filePath = `data/${yearMonth}.json`;
  
  try {
    // Get current file content
    let currentPosts = [];
    let sha = null;
    
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch
      });
      
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      currentPosts = JSON.parse(content);
      sha = fileData.sha;
    } catch (err) {
      // File doesn't exist yet, will create new
      if (err.status !== 404) throw err;
    }
    
    // Find the highest 'i' (post id) in current month
    const maxId = currentPosts.length > 0 
      ? Math.max(...currentPosts.map(p => p.i))
      : -1;
    
    post.i = maxId + 1;
    
    // Add post to array
    currentPosts.push(post);
    
    // Sort by date
    currentPosts.sort((a, b) => a.d.localeCompare(b.d));
    
    // Update file
    // One commit per post: Vercel rebuilds on push; build-index.js regenerates
    // index.json, data/arkiv/, and data/latest.json during the deploy build.
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `Add email post: ${post.t}`,
      content: Buffer.from(JSON.stringify(currentPosts, null, 2)).toString('base64'),
      branch,
      sha
    });

    return { success: true, postId: post.i, file: filePath };
  } catch (error) {
    console.error('Error storing post:', error);
    throw error;
  }
}


// Verify a Resend (Svix-format) webhook signature over the raw body.
// Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`; the key is the
// base64 part of the whsec_ secret; the header holds space-separated "v1,<sig>".
function verifyWebhookSignature(rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret) return false;
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

// Extract a bare lowercase address from "Name <addr@x>" or "addr@x"
function extractAddress(from) {
  if (!from) return '';
  const value = typeof from === 'string' ? from : from.email || from.address || '';
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function parseAllowedSenders(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// YYYY-MM-DD of the given instant in the post timezone
function formatPostDate(input, timeZone = process.env.POST_TIMEZONE || 'Europe/Oslo') {
  let date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) date = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

// Fetch the full received email (text/html/headers) from Resend
async function fetchReceivedEmail(emailId, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Resend receiving API returned ${response.status}`);
  }
  return response.json();
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function createHandler(deps = {}) {
  const fetchEmail = deps.fetchReceivedEmail || fetchReceivedEmail;
  const store = deps.storePost || storePost;

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const env = deps.env || process.env;
    const secret = env.RESEND_WEBHOOK_SECRET;
    const apiKey = env.RESEND_API_KEY;
    const allowed = parseAllowedSenders(env.ALLOWED_SENDERS);

    // Fail closed: never process mail without full configuration
    if (!secret || !apiKey || allowed.length === 0) {
      console.error('Inbound email misconfigured: RESEND_WEBHOOK_SECRET, RESEND_API_KEY and ALLOWED_SENDERS are required');
      return res.status(500).json({ error: 'Server not configured' });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (err) {
      return res.status(400).json({ error: 'Could not read body' });
    }

    if (!verifyWebhookSignature(rawBody, req.headers || {}, secret, deps.nowSeconds)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    if (event.type !== 'email.received') {
      return res.status(200).json({ message: 'Event ignored', type: event.type });
    }

    const meta = event.data || {};
    const sender = extractAddress(meta.from);
    if (!allowed.includes(sender)) {
      console.warn('Rejected inbound email from non-allowlisted sender');
      // 200 so Resend does not retry mail we will never accept
      return res.status(200).json({ message: 'Sender not allowed' });
    }

    try {
      if (!meta.email_id) throw new Error('Webhook payload missing email_id');
      const email = await fetchEmail(meta.email_id, apiKey);

      const subject = sanitizeSubject(email.subject || meta.subject || '') || 'Uten tittel';
      const rawContent = email.text || htmlToText(email.html) || '';
      const cleanContent = sanitizeEmailContent(rawContent);
      if (!cleanContent) {
        return res.status(200).json({ message: 'Empty email ignored' });
      }

      const post = {
        i: 0, // set when storing
        d: formatPostDate(email.created_at || meta.created_at || event.created_at),
        t: subject,
        s: generateSlug(subject),
        c: detectCategory(subject, cleanContent),
        x: cleanContent,
        u: '',
        img: [],
        dr: [],
        src: 'email'
      };

      const result = await store(post);

      return res.status(200).json({
        message: 'Email processed successfully',
        post: { id: result.postId, title: post.t, date: post.d, category: post.c, file: result.file }
      });
    } catch (error) {
      console.error('Error processing email:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = createHandler();
// Vercel: keep the raw body so the signature can be verified
module.exports.config = { api: { bodyParser: false } };
module.exports.createHandler = createHandler;
module.exports.storePost = storePost;
module.exports.verifyWebhookSignature = verifyWebhookSignature;
module.exports.sanitizeEmailContent = sanitizeEmailContent;
module.exports.sanitizeSubject = sanitizeSubject;
module.exports.htmlToText = htmlToText;
module.exports.extractAddress = extractAddress;
module.exports.parseAllowedSenders = parseAllowedSenders;
module.exports.formatPostDate = formatPostDate;
