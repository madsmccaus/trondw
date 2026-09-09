/**
 * Test Email Simulation Endpoint
 * 
 * Simulates receiving an email for testing purposes.
 * Call this endpoint to create a test blog post without setting up real email.
 * 
 * Usage:
 * POST /api/test-email
 * Body: {
 *   "subject": "Test Post Title",
 *   "body": "This is the email body content..."
 * }
 * 
 * Or use default test content by sending empty POST.
 */

const handler = require('./inbound-email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Create simulated Resend webhook payload
  const { subject, body } = req.body || {};
  
  const testSubject = subject || 'Test: Email-generert innlegg';
  const testBody = body || `Dette er et testinnlegg opprettet via e-post.

Dette viser at systemet kan motta e-post og publisere innhold automatisk.

Alle mottakerlister, CC/BCC og e-postadresser er fjernet automatisk.`;
  
  // Add some noise that should be stripped
  const noisyBody = `From: trond@example.com
To: blog@example.com, recipient1@example.com, recipient2@example.com
Cc: someone@example.com
Subject: ${testSubject}
Date: ${new Date().toISOString()}

${testBody}

--
Med vennlig hilsen
Trond Worren
trond.worren@example.com`;
  
  // Create Resend-style webhook payload
  const simulatedWebhook = {
    type: 'email.received',
    data: {
      from: 'trond@example.com',
      to: ['blog@trondworren.net'],
      subject: testSubject,
      text: noisyBody,
      date: new Date().toISOString(),
      headers: {}
    }
  };
  
  // Modify request to look like it came from Resend
  req.body = simulatedWebhook;
  
  // Remove signature check for test endpoint
  delete req.headers['x-resend-signature'];
  delete req.headers['resend-signature'];
  
  // Call the real handler
  return handler(req, res);
};
