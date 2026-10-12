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

## 📧 Email-to-Blog

Trond publishes by emailing any address at `post.trondworren.net`. Resend receives
the mail and sends a signed `email.received` webhook to `/api/inbound-email`. The
handler then:

1. verifies the Resend (Svix) signature over the raw request body, and fails closed if not configured;
2. checks that the sender is on the `ALLOWED_SENDERS` allowlist;
3. fetches the body from Resend's Receiving API (`RESEND_API_KEY`);
4. strips headers, addresses and recipient lists, then dates the post in Europe/Oslo time;
5. commits it to `data/YYYY-MM.json` on `GITHUB_BRANCH`, which triggers a Vercel redeploy.

The root `trondworren.net` mail and website are untouched. Only the `post` subdomain
gets an MX record.

**Full setup steps and checklist: see [DEPLOYMENT.md](DEPLOYMENT.md).**

Run the tests with `npm test`.

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
5. 🧪 **Send a test email** (see DEPLOYMENT.md)
6. ✉️ **Send real test email** to verify end-to-end

## 🤝 Contributing

To add posts manually:
1. Edit the appropriate `data/YYYY-MM.json` file
2. Run `npm run build` to regenerate the index
3. Commit and push changes

## 📄 License

MIT
