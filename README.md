# Trond Worren Arkiv

Live demo of the Trond Worren archive with email-to-blog functionality.

## 🌐 Live Site

**Live URL:** Deploy manually to Vercel (see deployment instructions below)

To deploy: 
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository: `madsmccaus/trondw`
3. Select branch: `feat/vercel-archive-demo`
4. Click "Deploy"
5. Vercel will auto-detect the setup and deploy

## 📖 About

This is a browsable archive of Trond Worren's writings from 2016-2022, containing 4,486 posts across categories like diary entries (dagbok), poems (dikt), prayers (forbønn), and more.

The archive includes:
- **Interactive frontend** with search, filtering by category and year
- **Email-to-blog functionality** allowing Trond to publish by emailing a dedicated address
- **Automatic sanitization** that strips all recipient lists, CC/BCC, and email metadata

## 🚀 Local Development

### View the archive locally

```bash
# Install dependencies
npm install

# Generate index from monthly data files
npm run build

# Start local server
npm run dev
```

Open `http://localhost:3000` to view the archive.

## 📧 Email-to-Blog Setup

The email-to-blog feature converts incoming emails into published blog posts, automatically stripping all email metadata and recipient information.

### Architecture

```
Inbound Email Provider (Resend)
    ↓ webhook
Vercel API Route (/api/inbound-email)
    ↓ sanitize content
GitHub API (commits to data/ folder)
    ↓ triggers rebuild
Updated Archive Site
```

### Setup Steps

#### 1. Configure Inbound Email Provider (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains** and add your domain (e.g., `trondworren.net`)
3. Configure DNS records as shown by Resend:
   - MX record: `10 feedback-smtp.us-east-1.amazonses.com`
   - TXT records for SPF, DKIM
4. Go to **Inbound** and create a new inbound route:
   - **Email:** `blog@trondworren.net` (or any address you want)
   - **Forward to:** `https://your-vercel-deployment.vercel.app/api/inbound-email`
5. Copy the **Webhook Secret** for signature verification

#### 2. Configure Environment Variables

In your Vercel project dashboard, add these environment variables:

```bash
# Resend webhook signature (from Resend dashboard)
RESEND_WEBHOOK_SECRET=whsec_...

# GitHub credentials for committing new posts
GITHUB_TOKEN=ghp_...  # Personal access token with repo write access
GITHUB_OWNER=madsmccaus
GITHUB_REPO=trondw
GITHUB_BRANCH=feat/vercel-archive-demo  # or main after merging
```

**To create a GitHub token:**
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Copy the token and add it to Vercel

#### 3. Test the Email Pipeline

You can test without configuring real email:

```bash
# POST to the test endpoint
curl -X POST https://your-vercel-deployment.vercel.app/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test innlegg fra email",
    "body": "Dette er innholdet i e-posten som skal bli en bloggpost."
  }'
```

This will create a sanitized post and commit it to the repository.

#### 4. Send a Real Email

Once DNS is configured, simply email `blog@trondworren.net` with:
- **Subject:** Becomes the post title
- **Body:** Becomes the post content (all email headers and addresses stripped)

The system will:
1. Receive the webhook from Resend
2. Extract subject and body
3. Strip all email metadata (To/CC/BCC, addresses, signatures)
4. Detect category based on keywords
5. Commit to appropriate `data/YYYY-MM.json` file
6. Trigger automatic rebuild and deployment

## 🔒 Security & Privacy

The email sanitization system removes:
- ✅ All recipient lists (To, CC, BCC)
- ✅ Email addresses
- ✅ Email headers (From, To, Subject, Date)
- ✅ Forwarded message markers
- ✅ Common email signatures
- ✅ List-Unsubscribe and X-headers

Only the actual content is published.

## 📁 Data Structure

Posts are stored in monthly JSON files: `data/YYYY-MM.json`

```json
{
  "i": 0,           // Post ID within month
  "d": "2024-09-09", // Date (YYYY-MM-DD)
  "t": "Post title",
  "s": "post-slug",
  "c": "dagbok",    // Category
  "x": "Content...",
  "u": "",          // Original URL (empty for email posts)
  "img": [],        // Images
  "dr": []          // Additional data
}
```

Categories: `dagbok`, `dikt`, `forkynnelse`, `plakat`, `annet`, `mirakel`, `bok`, `forbonn`

## 🛠 Tech Stack

- **Frontend:** Pure HTML/CSS/JavaScript (no framework)
- **Backend:** Vercel Serverless Functions (Node.js)
- **Storage:** GitHub as database (commits to JSON files)
- **Email:** Resend Inbound Email API
- **Deployment:** Vercel

## 📝 Manual Tasks After Deployment

To make the email-to-blog feature fully operational:

1. ✅ **Deploy to Vercel** (link GitHub repo)
2. ⚙️ **Add environment variables** in Vercel dashboard
3. 🌐 **Configure DNS/MX records** for email receiving
4. 📧 **Set up Resend inbound route** with webhook URL
5. 🧪 **Test with `/api/test-email`** endpoint
6. ✉️ **Send real test email** to verify end-to-end

## 🤝 Contributing

To add posts manually:
1. Edit the appropriate `data/YYYY-MM.json` file
2. Run `npm run build` to regenerate the index
3. Commit and push changes

## 📄 License

MIT
