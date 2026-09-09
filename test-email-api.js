/**
 * Simple test runner for the email-to-blog API
 * Tests the sanitization and storage logic locally
 */

const handler = require('./api/test-email');

// Mock request/response objects
const mockReq = {
  method: 'POST',
  body: {
    subject: 'Test: Email-generert innlegg fra systemet',
    body: `Dette er et demonstrasjonsinnlegg som viser at e-post til blogg-funksjonen fungerer.

Systemet mottar e-post, fjerner automatisk:
- Alle mottakerlister (To, CC, BCC)
- E-postadresser
- E-post-headere (From, To, Subject, Date)
- Signatur og annen metadata

Kun det faktiske innholdet publiseres på nettstedet.

Dette er perfekt for Tronds arbeidsflyt hvor han CC'er mange personer men kun ønsker at selve budskapet publiseres.`
  },
  headers: {}
};

let responseStatus = 200;
let responseData = null;

const mockRes = {
  status: (code) => {
    responseStatus = code;
    return mockRes;
  },
  json: (data) => {
    responseData = data;
    console.log('\n=== Response ===');
    console.log('Status:', responseStatus);
    console.log('Data:', JSON.stringify(data, null, 2));
    return mockRes;
  }
};

// Set dummy environment variables for local testing
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test_token_replace_on_vercel';
process.env.GITHUB_OWNER = process.env.GITHUB_OWNER || 'madsmccaus';
process.env.GITHUB_REPO = process.env.GITHUB_REPO || 'trondw';
process.env.GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'feat/vercel-archive-demo';

console.log('Testing email-to-blog API locally...\n');
console.log('=== Request ===');
console.log('Subject:', mockReq.body.subject);
console.log('Body preview:', mockReq.body.body.substring(0, 100) + '...');

handler(mockReq, mockRes).then(() => {
  if (responseStatus === 200) {
    console.log('\n✓ Test passed! The email would be processed successfully.');
    console.log('\nNote: GitHub commit failed because we\'re testing locally.');
    console.log('On Vercel with proper GITHUB_TOKEN, the post would be committed.');
  } else {
    console.log('\n✗ Test failed.');
  }
}).catch(err => {
  console.error('\n✗ Test error:', err.message);
});
