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
4. Run `npm start`. This loads the local `.env` when it exists.
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

## Launch on a persistent Node host

Set the application root to the directory containing `package.json`, select Node.js
24, start with `npm start`, and configure the host's HTTP health check at `/healthz`.
Let the host supply `PORT`. Use `HOST=0.0.0.0` on a container or managed web service.
Set `PUBLIC_ORIGIN` to the exact HTTPS address you are testing. Switch it to the custom
domain once that domain serves the application. POST and PATCH requests require a
matching origin.

For a direct Render deployment, create a Node Web Service and select the directory
containing `package.json` as the root. Use `node --check server.mjs` as the build
command and `npm start` as the start command. Select a paid service with a
persistent disk mounted at `/var/data` and set the health check path to `/healthz`.

Set these values in the host's environment:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24.x` on Render |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PUBLIC_ORIGIN` | `https://360degreeimpact.in` for production |
| `DATA_FILE` | `/var/data/impact.sqlite` when the disk is mounted at `/var/data` |
| `ADMIN_PASSWORD_HASH` | Generate a fresh, unique production password with `npm run admin:hash --silent` |

Use the host-provided `PORT`. Keep the plaintext password in your password manager.
Add `360degreeimpact.in` as the primary custom domain using the host's DNS
instructions. Redirect `www.360degreeimpact.in` to `https://360degreeimpact.in`
so form and admin requests use the same origin. Update only the website DNS records
required by the host and preserve existing mail DNS records during cutover.

On the final HTTPS domain, check `/healthz`, submit a test enquiry, sign in at
`/admin`, confirm the enquiry arrived, and verify it still exists after a restart.
If you enable Gemini or Gmail, test those integrations separately. Confirm the
published contact details and any privacy notice required for your business before launch.

The current SQLite backend needs a persistent writable filesystem. Vercel Functions'
scratch filesystem is temporary and unsuitable for storing CRM data. Use a persistent
Node.js host, or migrate the backend to a managed database before deploying as a
function. Keep `.env` and `data/` out of the deployment source. To bring existing CRM
records over, restore a SQLite-consistent backup privately to the configured data path.

### Keep Netlify in front of the Node server

Deploy the Node server on a host with persistent storage first. Set the backend's
`PUBLIC_ORIGIN=https://360degreeimpact.in` when routing that domain through Netlify.
In Netlify, point the base directory at this application folder. Use the included
`netlify.toml` or set the build command to `node build-netlify.mjs` and publish
directory to `netlify-dist`. Set Netlify's `BACKEND_ORIGIN` build variable to the
Node server's separate HTTPS origin. The generated `_redirects` file forwards
pages, assets, admin and API requests to Node. It also redirects old `.html`
URLs to their clean equivalents.

### Deploy the public domain through Vercel

Set the Vercel project's Root Directory to `360-Degree-Impact-Full-Stack/impact`
in the GitHub repository, or `impact` when importing this workspace directly.
Use the included `vercel.mjs` as the only Vercel configuration file.
Set `BACKEND_ORIGIN` in Vercel to the separate deployed Node.js HTTPS origin.
The Vercel deployment forwards pages and API requests to that host, while the
Node host writes SQLite records to its persistent disk. Set `PUBLIC_ORIGIN`
on the Node host to the exact public origin used for login and form submissions.
Keep admin, Gemini, and Gmail secrets on the Node host. Verify `/healthz`,
a clean service URL, enquiry submission, and admin login through Vercel before
switching the public domain.

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
