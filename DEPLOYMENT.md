## Deployment & Email-to-Blog Setup

The archive is a static site on Vercel (project `trondw`). Trond publishes by
emailing an address at **`post.trondworren.net`**. Resend receives the mail
and calls `/api/inbound-email`, which commits the post to GitHub. The
commit then triggers a Vercel redeploy.

```
Trond's mail ─▶ MX post.trondworren.net (Resend) ─▶ webhook email.received
  ─▶ /api/inbound-email (verify signature, allowlist, fetch body, sanitize)
  ─▶ commit data/YYYY-MM.json on GITHUB_BRANCH ─▶ Vercel redeploy
```

### Why a subdomain?

`trondworren.net` already hosts Trond's WordPress site and mail (`MX 0 trondworren.net`,
DNS at Hyp.net). Adding Resend's MX to the root would break his inbox.
Only `post.trondworren.net` gets an MX record, so the root domain is untouched.

### 1. Resend

1. Create a Resend account.
2. **Domains → Add domain** → `post.trondworren.net`.
3. On the domain page, turn **Enable Receiving** on and **Enable Sending** off.
   Sending is not needed, so Resend's SPF records can be skipped, but the DKIM TXT
   record must stay published.
4. Resend shows the DNS records to add. Note the **receiving MX** value from the
   dashboard. Do not use `feedback-smtp.*.amazonses.com`, which is the
   *sending* bounce MX.
5. **API Keys → Create** a key (full access, or one that can read received emails).
   This is `RESEND_API_KEY`.
6. **Webhooks → Add endpoint**:
   - URL: `https://trondw.vercel.app/api/inbound-email`
     (or the production custom domain once one is attached)
   - Event: `email.received`
   - Copy the signing secret (`whsec_...`). This is `RESEND_WEBHOOK_SECRET`.

### 2. DNS at Hyp.net (trondworren.net)

Log in to the Hyp.net control panel for `trondworren.net` and add **only** the
records Resend shows for `post.trondworren.net`:

| Type | Host / Name | Value | Priority |
|------|-------------|-------|----------|
| MX   | `post` | *(receiving MX from Resend)* | 10 (it must be the only, lowest MX on `post`) |
| TXT  | `resend._domainkey.post` | *(DKIM value from Resend)* | – |

Do **not** change the existing root `MX`, `A`, or SPF `TXT` records.
Then click **"I've added the record"** in Resend and wait for it to show **Verified**.

### 3. GitHub token

Create a **fine-grained personal access token**:
- Repository access: only `madsmccaus/trondw`
- Permissions: **Contents → Read and write**
- This is `GITHUB_TOKEN`.

### 4. Vercel environment variables (Production)

```
RESEND_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
ALLOWED_SENDERS=trond@example.no,other@example.com   # comma-separated, case-insensitive
GITHUB_TOKEN=github_pat_...
GITHUB_OWNER=madsmccaus
GITHUB_REPO=trondw
GITHUB_BRANCH=<the Vercel production branch>
POST_TIMEZONE=Europe/Oslo                            # optional (default)
```

The handler **fails closed**. If the secret, API key or allowlist is missing, it
returns 500 and stores nothing. Mail from senders that aren't on the allowlist
is acknowledged (200) but ignored.

### 5. Git integration

New posts reach the site only if Vercel redeploys on push. In Vercel, go to
**Project → Settings → Git** and connect `madsmccaus/trondw`. Set the production branch
to the same branch as `GITHUB_BRANCH`, then redeploy so the env vars take effect.

### 6. Test

1. Run `npm test` locally. The unit tests cover signature, allowlist and fail-closed handling.
2. Send a mail from an allowlisted address to `blogg@post.trondworren.net`.
   Any local part works.
3. Check that the email shows up in **Resend → Emails → Receiving**, that the webhook
   delivery succeeded, that a new commit `Add email post: ...` exists, and that the
   post appears on the site after the redeploy.

### Setup checklist

- [ ] Resend account created
- [ ] `post.trondworren.net` added, Receiving on, Sending off
- [ ] Hyp.net: MX for `post` added (receiving MX from Resend)
- [ ] Hyp.net: DKIM TXT for `resend._domainkey.post` added
- [ ] Resend shows the domain and receiving record as Verified
- [ ] Resend API key created
- [ ] Webhook `email.received` → `/api/inbound-email` created; secret copied
- [ ] GitHub fine-grained token (Contents RW, trondw only) created
- [ ] Trond's sending address(es) confirmed for `ALLOWED_SENDERS`
- [ ] Vercel env vars set (Production)
- [ ] Vercel Git integration connected; production branch = `GITHUB_BRANCH`
- [ ] Redeployed
- [ ] Test email published end to end

### Troubleshooting

- **401 Invalid signature**: wrong `RESEND_WEBHOOK_SECRET`, or the request didn't come from Resend.
- **500 Server not configured**: one of `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY` or `ALLOWED_SENDERS` is missing.
- **200 "Sender not allowed"**: add the address to `ALLOWED_SENDERS` and redeploy.
- **Mail never reaches Resend**: check `dig MX post.trondworren.net` and the domain status in Resend.
- **Post committed but not on the site**: the Vercel Git integration or production branch is wrong.
