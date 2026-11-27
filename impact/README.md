# 360° Impact

Responsive business communication website with a Node.js 24 HTTP backend and SQLite.
Visitors can send a service enquiry or leave feedback. The admin inbox tracks enquiries
and moderates feedback. Published feedback exposes the display name, company, rating and
message. An email address is never included in the public review API.

## Run locally

1. Install Node.js 24 or later and extract this archive.
2. Run `npm run admin:hash --silent`. Enter a unique password of at least 16 characters
   on stdin and end input with Ctrl+D (Unix) or Ctrl+Z followed by Enter (Windows).
   The command prints a salted password hash. Save the password in your password manager.
3. Copy `.env.example` to `.env` and paste the generated hash into `ADMIN_PASSWORD_HASH`.
4. Run `node --env-file=.env server.mjs`.
5. Open http://127.0.0.1:3000 and visit http://127.0.0.1:3000/admin for the inbox.

There are no packages to install. The SQLite database is created automatically.
Keep a regular SQLite-consistent backup of the persistent database.

## Optional Gemini chat

Set `GEMINI_API_KEY` in the server's `.env` or hosting environment and restart the
Node process. The chatbot offers Gemini 3.1 Flash-Lite for questions outside the
local FAQ and service catalog after the visitor opts in. The server sends the question,
up to three recent AI questions from that conversation, and public service descriptions.
It blocks recognizable phone numbers, codes, and other sensitive patterns before contacting
Google. Use a Gemini project without billing enabled if you want free-tier-only usage.

## Client Mail

Enable Gmail API in your Google Cloud project and authorize the mailbox
`Shatakshidigitechpvtltd@gmail.com` with offline access and the
`https://www.googleapis.com/auth/gmail.modify` scope. Follow Google's
[server-side authorization guide](https://developers.google.com/workspace/gmail/api/auth/web-server)
to obtain a refresh token for your OAuth client. Set `GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in the server environment,
then restart the Node process. Use the Client Mail link from the signed-in dashboard.

Client Mail opens plain-text messages, supports Gmail search and inbox filters, and
lets you mark messages read or unread and archive them. Use Open in Gmail for
replies, HTML-only messages, and attachments. Gmail data is requested on demand
and is not stored in the CRM database or sent to Gemini.

## Host

Use a Node.js 24 runtime with a persistent writable volume and an HTTPS reverse proxy.
Set `NODE_ENV=production`, `PUBLIC_ORIGIN` to the exact HTTPS origin without trailing
slash, and `ADMIN_PASSWORD_HASH` in your host's environment. Set `DATA_FILE` to a file
on the persistent volume. The default bind address is loopback. Configure `HOST` and
`PORT` for your hosting environment. Set `TRUST_PROXY=1` only if the last value in
X-Forwarded-For is supplied by your trusted reverse proxy. Configure the proxy to limit
JSON bodies to 16 KB and forward requests to the Node server.

Default contact details are the published business email and address from the existing
site. Verify them before cutover. The original public phone entry appeared to be
placeholder data. The app stores leads for admin follow-up. It has no outbound email or
messaging-provider integration and does not import historical submissions.
