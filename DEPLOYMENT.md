## Vercel Deployment Guide

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/madsmccaus/trondw&branch=feat/vercel-archive-demo)

Or manually:

1. **Import Project**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Select "Import Git Repository"
   - Enter: `https://github.com/madsmccaus/trondw`
   - Choose branch: `feat/vercel-archive-demo`

2. **Configure Build**
   - Vercel will auto-detect the configuration from `vercel.json`
   - Build command: `node build-index.js` (runs automatically)
   - Output directory: `.` (current directory)

3. **Add Environment Variables** (for email-to-blog)
   ```
   RESEND_WEBHOOK_SECRET=whsec_...
   GITHUB_TOKEN=ghp_...
   GITHUB_OWNER=madsmccaus
   GITHUB_REPO=trondw
   GITHUB_BRANCH=feat/vercel-archive-demo
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (~1-2 minutes)
   - Get your live URL: `https://trondw-xxx.vercel.app`

### Testing the Deployment

Once deployed, test these endpoints:

```bash
# View the archive
https://your-deployment.vercel.app/

# Test data loading
https://your-deployment.vercel.app/data/index.json

# Test email simulation
curl -X POST https://your-deployment.vercel.app/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"subject": "Test", "body": "Test content"}'
```

### Troubleshooting

**Build fails:**
- Check that Node.js version is 18.x or higher in Vercel settings
- Verify `build-index.js` runs successfully locally

**API routes don't work:**
- Ensure `api/` folder is included in git
- Check function logs in Vercel dashboard

**Email-to-blog doesn't work:**
- Verify all environment variables are set
- Check webhook signature matches Resend dashboard
- Test with `/api/test-email` first
