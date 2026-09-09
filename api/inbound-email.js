/**
 * Email Inbound Webhook Handler
 * 
 * Receives email webhooks from Resend Inbound Email API and creates blog posts.
 * Strips all email metadata, recipient lists, and sensitive information.
 * 
 * Required environment variables:
 * - RESEND_WEBHOOK_SECRET: Webhook signature secret from Resend
 * - GITHUB_TOKEN: Personal access token with repo write access
 * - GITHUB_OWNER: Repository owner (e.g., 'madsmccaus')
 * - GITHUB_REPO: Repository name (e.g., 'trondw')
 * - GITHUB_BRANCH: Branch to commit to (e.g., 'feat/vercel-archive-demo')
 */

const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');

// Email content sanitization - strips all recipient info and metadata
function sanitizeEmailContent(text) {
  if (!text) return '';
  
  return text
    // Remove forwarded message headers
    .replace(/———-\s*Forwarded message\s*———\s*/gi, '')
    .replace(/------\s*Forwarded message\s*------\s*/gi, '')
    .replace(/[-–—]+\s*Videresendt melding\s*[-–—]+\s*/gi, '')
    
    // Remove English email headers
    .replace(/^From:.*$/gm, '')
    .replace(/^To:.*$/gm, '')
    .replace(/^Cc:.*$/gm, '')
    .replace(/^Bcc:.*$/gm, '')
    .replace(/^Subject:.*$/gm, '')
    .replace(/^Date:.*$/gm, '')
    .replace(/^Sent:.*$/gm, '')
    
    // Remove Norwegian email headers
    .replace(/^Sendt:.*$/gm, '')
    .replace(/^Fra:.*$/gm, '')
    .replace(/^Til:.*$/gm, '')
    .replace(/^Kopi:.*$/gm, '')
    
    // Remove email addresses
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/\[e-post fjernet\]/gi, '')
    .replace(/mailto:[^\s\]>)]+/gi, '')
    
    // Remove common email footers
    .replace(/Med vennlig hilsen\s*/gi, '')
    .replace(/Best regards\s*/gi, '')
    .replace(/--\s*$/gm, '')
    
    // Remove recipient lists (lines with multiple commas)
    .replace(/^[^:\n]*,\s*[^:\n]*,.*$/gm, '')
    
    // Remove List-Unsubscribe and similar headers
    .replace(/^List-[^:]+:.*$/gm, '')
    .replace(/^X-[^:]+:.*$/gm, '')
    
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Verify webhook signature (Resend uses HMAC SHA-256)
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

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

// Store post in GitHub via API
async function storePost(post) {
  const octokit = new Octokit({
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
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `Add email post: ${post.t}`,
      content: Buffer.from(JSON.stringify(currentPosts, null, 2)).toString('base64'),
      branch,
      sha
    });
    
    // Trigger index rebuild by updating a timestamp file
    const buildTriggerPath = 'data/.last-update';
    let buildSha = null;
    
    try {
      const { data: buildData } = await octokit.repos.getContent({
        owner,
        repo,
        path: buildTriggerPath,
        ref: branch
      });
      buildSha = buildData.sha;
    } catch (err) {
      // File doesn't exist
    }
    
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: buildTriggerPath,
      message: 'Trigger rebuild',
      content: Buffer.from(new Date().toISOString()).toString('base64'),
      branch,
      sha: buildSha
    });
    
    return { success: true, postId: post.i, file: filePath };
  } catch (error) {
    console.error('Error storing post:', error);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Verify webhook signature
  const signature = req.headers['x-resend-signature'] || req.headers['resend-signature'];
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  
  if (secret) {
    const rawBody = JSON.stringify(req.body);
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    console.warn('WARNING: RESEND_WEBHOOK_SECRET not set, skipping signature verification');
  }
  
  try {
    const { type, data } = req.body;
    
    // Handle Resend email.received event
    if (type !== 'email.received') {
      return res.status(200).json({ message: 'Event ignored', type });
    }
    
    const email = data;
    
    // Extract and sanitize content
    const subject = email.subject || 'Uten tittel';
    const rawContent = email.text || email.html?.replace(/<[^>]+>/g, '\n') || '';
    const cleanContent = sanitizeEmailContent(rawContent);
    
    // Extract date (use email date or current date)
    const emailDate = email.date ? new Date(email.date) : new Date();
    const dateStr = emailDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Create post object
    const post = {
      i: 0, // Will be set when storing
      d: dateStr,
      t: subject,
      s: generateSlug(subject),
      c: detectCategory(subject, cleanContent),
      x: cleanContent,
      u: '', // No original URL for email posts
      img: [],
      dr: []
    };
    
    // Store post
    const result = await storePost(post);
    
    return res.status(200).json({
      message: 'Email processed successfully',
      post: {
        id: result.postId,
        title: post.t,
        date: post.d,
        category: post.c,
        file: result.file
      }
    });
    
  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
