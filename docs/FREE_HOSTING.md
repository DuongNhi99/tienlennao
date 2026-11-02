# Free hosting (no server, no credit card)

Put Tiến Lên Online on the internet for free in about 30 minutes, using three free services
that you sign in to with your GitHub account. Every push to `main` then redeploys by itself.

| Part                    | Service                          | Free plan                                     |
| ----------------------- | -------------------------------- | --------------------------------------------- |
| Web app (what you open) | [Vercel](https://vercel.com)     | Hobby plan (for personal, non-commercial use) |
| API (game server)       | [Render](https://render.com)     | 1 free web service + 1 free Key Value (Redis) |
| Database                | [Supabase](https://supabase.com) | 500 MB PostgreSQL                             |

How it fits together: players only ever open the Vercel address. Vercel serves the pages and
forwards everything under `/api/v1` to the API on Render, so the login cookie and live updates
work as if it were one site. All three run in Singapore, close to players in Vietnam.

Write down three values as you go; later steps ask for them:

- **DATABASE** — the database connection string (step 1)
- **SITE** — your Vercel address, like `https://tienlen-online.vercel.app` (step 2)
- **API** — your Render address, like `https://tienlen-api.onrender.com` (step 3)

## 1. Database (Supabase)

1. Open <https://supabase.com>, **Start your project**, sign in with GitHub.
2. **New project**: name `tienlen`; **Database Password** → click **Generate a password** and
   copy it somewhere safe; **Region**: _Southeast Asia (Singapore)_. Create it and wait for
   the green "healthy" status (1–2 minutes).
3. Click **Connect** (top of the project page). Under **Session pooler**, copy the URI. It
   looks like
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
4. Replace `[YOUR-PASSWORD]` (including the brackets) with your password and add
   `?connection_limit=5` at the end. This is **DATABASE**:
   `postgresql://postgres.abcdefgh:MyPassword123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?connection_limit=5`

   If the password contains symbols other than letters and digits, generate a new one
   (Project Settings → Database → Reset database password); symbols break the URI.

## 2. Web app (Vercel)

1. Open <https://vercel.com/signup>, choose **Hobby**, continue with GitHub.
2. **Add New… → Project**, and **Import** the `tienlennao` repository (allow Vercel to see it
   if asked).
3. **Project Name**: for example `tienlen-online`. **Root Directory**: click **Edit** and
   choose `apps/web`. Leave everything else as it is and click **Deploy**.
4. When it finishes, open the project's **Settings → Domains**: the `….vercel.app` address
   there, with `https://` in front, is **SITE**. (The site opens, but signing in fails until
   step 4.)

## 3. API (Render)

1. Open <https://dashboard.render.com/register> and sign up with GitHub.
2. Open <https://render.com/deploy?repo=https://github.com/DuongNhi99/tienlennao> (or
   **New → Blueprint** and pick the repository). Render reads `render.yaml` and shows
   `tienlen-api` and `tienlen-redis`, both on the Free plan.
3. Fill in the three values it asks for, then **Deploy Blueprint**:

   | Key              | Value                          |
   | ---------------- | ------------------------------ |
   | `DATABASE_URL`   | **DATABASE**                   |
   | `WEB_ORIGIN`     | **SITE** (no `/` at the end)   |
   | `API_PUBLIC_URL` | **SITE** followed by `/api/v1` |

4. The first build takes about 10 minutes. When `tienlen-api` shows **Live**, the address at
   the top of its page is **API**. Check it: **API**`/api/v1/health/ready` should show
   `"status":"ok"`.

## 4. Connect the web app to the API (Vercel)

1. Vercel → your project → **Settings → Environment Variables**. Add `API_PROXY_ORIGIN` with
   the value **API** (no `/` at the end), for all environments, and save.
2. **Deployments** → the newest deployment → **⋯ → Redeploy**.
3. Open **SITE**, register an account and start playing. 🎉

## 5. Keep it awake (GitHub, recommended)

Render stops a free API after 15 minutes without visitors; the next visitor then waits about a
minute. The `Keep awake` workflow pings it every 10 minutes instead (744 of the 750 free hours a
month, so it never runs out), which also keeps the database from pausing.

GitHub → the repository → **Settings → Secrets and variables → Actions → Variables → New
repository variable**: name `KEEP_AWAKE_URL`, value **API**`/api/v1/health/live`.

GitHub turns scheduled workflows off after 60 days without any commit; re-enable it under
**Actions → Keep awake** if that happens.

## 6. Make yourself administrator (once)

Register on the site first. Then, on your own computer in the project folder (PowerShell):

```powershell
$env:DATABASE_URL = "DATABASE"   # paste the real value
pnpm db:set-role you@example.com ADMIN
Remove-Item Env:DATABASE_URL
```

Sign out and in again; the admin area is at **SITE**`/admin`.

## 7. Email (optional)

Without email the game works fully; only "verify email" and "forgot password" messages are not
sent. Render's free plan blocks the usual mail ports, so use a provider that offers port 2525,
for example [Brevo](https://www.brevo.com) (300 emails a day free):

1. Sign up, verify a sender address (Senders, Domains & Dedicated IPs → Senders).
2. SMTP & API → **SMTP**: note the login (like `8a1b2c001@smtp-brevo.com`) and create an SMTP
   key.
3. Render → `tienlen-api` → **Environment** → add, then **Save, rebuild, and deploy**:
   - `SMTP_URL` = `smtp://LOGIN:KEY@smtp-relay.brevo.com:2525`, writing the `@` inside the
     login as `%40` (for example `smtp://8a1b2c001%40smtp-brevo.com:xsmtpsib-…@smtp-relay.brevo.com:2525`)
   - `MAIL_FROM` = `Tiến Lên Online <the sender address you verified>`

## Updating, limits and troubleshooting

- **Updates**: push to `main`. Vercel and Render both rebuild automatically (the API applies
  database migrations when it starts).
- **Avatars** are stored on the API's disk, which Render's free plan wipes on every redeploy
  or restart: uploaded pictures disappear then (players can upload again).
- **Backups**: Supabase's free plan has no downloadable backups. Occasionally run
  `pg_dump --format=custom --file=tienlen.dump "DATABASE"` (PostgreSQL client tools) and keep
  the file.
- **Live updates** use HTTP long-polling through Vercel (Vercel cannot forward WebSockets);
  moves still appear within a moment.
- **Free limits**: Vercel Hobby allows 1 million requests a month, and each connected player
  makes roughly 150 an hour while idle on a page — plenty for friends and small groups.
- **"Sign-in fails" / "Không kết nối được"**: check `API_PROXY_ORIGIN` on Vercel (step 4, and
  redeploy after changing it) and `WEB_ORIGIN` on Render (exactly **SITE**).
- **API won't start**: Render → `tienlen-api` → **Logs**. "Invalid environment configuration"
  names the variable that is wrong; a database error usually means the **DATABASE** password.
- **Supabase project paused** (after a week with no activity if step 5 is skipped): Supabase →
  the project → **Restore**.

When you outgrow this (more players, permanent avatars, your own domain), see
[DEPLOYMENT.md](DEPLOYMENT.md) for running everything on one rented server.
