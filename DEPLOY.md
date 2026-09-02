# Deploying to a subdomain on xneelo

This app is a **Next.js server application** (SSR, server actions, auth cookies,
middleware). It is **not** a static site, so it cannot run on xneelo's standard
shared hosting (Apache/PHP). Pick one of the two options below.

---

## ✅ Option A (recommended): Host on Vercel, point the subdomain via xneelo DNS

xneelo keeps hosting your main `mediarocket.co.za` site and DNS. You simply add a
DNS record so `leave.mediarocket.co.za` resolves to the app running on Vercel
(free, zero-config, built by the Next.js team). ~15 minutes.

### 1. Deploy the app to Vercel

- Go to https://vercel.com and sign in with the **GitHub** account (`Dewald45`).
- **Add New → Project → Import** `Dewald45/leave-dashboard`.
- Framework preset auto-detects **Next.js**. Leave build settings as default.
- Add the **Environment Variables** (copy the values from your `.env.local`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
  - `RESEND_FROM`
  - `APP_URL`  → set to `https://leave.mediarocket.co.za`
- Click **Deploy**. You'll get a temporary `*.vercel.app` URL.

### 2. Add the custom subdomain in Vercel

- Project → **Settings → Domains** → add `leave.mediarocket.co.za`.
- Vercel shows the DNS record to create — for a subdomain it's a **CNAME**:
  - **Name/Host:** `leave`
  - **Value/Target:** `cname.vercel-dns.com`

### 3. Add the DNS record in xneelo (konsoleH)

- Log in to **konsoleH** (xneelo's control panel).
- Select the `mediarocket.co.za` domain → **DNS / Zone Editor** (sometimes under
  "Advanced DNS" or "Manage DNS").
- **Add a new record:**
  - Type: `CNAME`
  - Host/Name: `leave`
  - Destination/Value: `cname.vercel-dns.com`  (a trailing dot is fine)
  - TTL: default (e.g. 3600)
- Save. DNS usually propagates in minutes (can take up to a few hours).

> If konsoleH won't accept a CNAME on a subdomain, use Vercel's **A record**
> alternative instead: Type `A`, Host `leave`, Value `76.76.21.21`.

Vercel auto-issues a free SSL certificate once the record resolves — the site
will be live at **https://leave.mediarocket.co.za**.

### 4. Point Supabase Auth at the subdomain

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://leave.mediarocket.co.za`
- Add it under **Redirect URLs** too.

That's it. Every `git push` to `main` now auto-deploys.

---

## Option B: Run on an xneelo VPS / Cloud server (all-on-xneelo)

Only if you specifically want everything hosted at xneelo. You need a VPS/Cloud
plan with **Node.js** (shared hosting won't do).

```bash
# On the server (Node 18+ installed):
git clone https://github.com/Dewald45/leave-dashboard.git
cd leave-dashboard
npm install
cp .env.example .env.local     # fill in the same values as local
npm run build

# Keep it running with a process manager:
npm i -g pm2
pm2 start "npm start" --name leave-dashboard   # serves on port 3000
pm2 save && pm2 startup
```

Then put **nginx** in front as a reverse proxy for `leave.mediarocket.co.za`
(proxy_pass to `http://localhost:3000`) and issue SSL with **Let's Encrypt**
(`certbot`). Point the `leave` DNS A record at the server's IP in konsoleH.
Set `APP_URL` and the Supabase Auth URLs to the subdomain as in Option A step 4.

---

## Why not xneelo shared hosting / a static export?

`next export` (static HTML) would drop the login, approval flow, RLS-backed data
access and email actions — all of which need a Node server. Shared hosting can't
run that server, so Option A or B is required.
