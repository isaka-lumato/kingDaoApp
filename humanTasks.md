# Human Tasks — Things Only Baraka Can Do

Claude cannot sign up for services, click confirmation emails, enter payment info, or run interactive prompts on your machine. Anything that requires *you* lives here.

**How this file works:**
- Tasks are ordered. Earlier ones usually unblock later ones.
- Each task explains: what to do, why, the exact commands or links, and what Claude needs from you when it's done (e.g. paste a URL into `.env.local`).
- Mark complete with `[x]` and add the date. Add notes if you ran into trouble.

---

## H-001 — Install local dev tooling

**Why:** You can't run the project or apply migrations without these.
**Status:** [x] done — 2026-05-18

**Installed and verified:**
- ✅ Node.js v24.14.1
- ✅ npm 11.13.0
- ✅ pnpm 10.33.3
- ✅ Git 2.54.0
- ✅ Supabase CLI 2.98.2 (installed via Scoop)

**Docker Desktop is NOT required** — per D-019 we use two cloud Supabase projects instead of a local Docker-based stack.

---

## H-002 — Create two Supabase Cloud projects (dev + prod)

**Why:** Per D-019, we use a cloud "dev" project for development and a separate "prod" project for the live system. Same workflow, no Docker.
**Status:** [ ]

### Step 1 — Sign up
Sign up: https://supabase.com/dashboard (free tier is enough to start).

### Step 2 — Create the DEV project
1. **New Project**:
   - **Name:** `kdl-tracker-dev`
   - **Database password:** generate a strong one, save in your password manager.
   - **Region:** **EU West (Ireland)** or **EU Central (Frankfurt)** — closest to Tanzania.
   - **Pricing plan:** Free.
2. Wait ~2 minutes for provisioning.

### Step 3 — Switch to the new API key system (per D-020)
Inside the dev project:
1. **Project Settings → API Keys** (or **API → API Keys** depending on dashboard version).
2. If you see a banner / button to **"Migrate to new API keys"** or **"Enable new keys"**, click it. This creates a default publishable key and one secret key. (If the project was created after this rolled out for new projects, the new keys may already be the default — in that case you're done with this step.)
3. Once the new keys exist, **disable the legacy `anon` and `service_role` keys** from the same page. We don't need them.
4. Copy:
   - `Project URL` (under Settings → API → Project URL)
   - **Publishable key** (`sb_publishable_...`)
   - **Secret key** (`sb_secret_...`)  **(SECRET — never paste in chat or commit)**
5. **Project Settings → General** → copy the `Project Ref` (short ID like `abcdefghijklmno`).

### Step 4 — Create the PROD project
Repeat Steps 2 and 3 with:
- **Name:** `kdl-tracker-prod`
- **Same region** as dev.
- Same key migration (disable legacy keys; use publishable + secret).
- Save its URL, publishable key, secret key, and project ref separately.

### Step 5 — Authenticate the CLI
Run this in PowerShell — it opens a browser to log you in:
```powershell
supabase login
```

**Tell Claude when done:** Send the **dev** project URL, publishable key (`sb_publishable_...`), and project ref. Send the **prod** project ref. Keep both **secret keys** (`sb_secret_...`) to yourself — Claude will tell you exactly where to paste them locally in `.env.local` (never in a commit, never in chat).

---

## H-003 — Create a Vercel account

**Why:** Production hosting for the Next.js app.
**Status:** [ ]

1. Sign up: https://vercel.com/signup (Hobby tier is free).
2. Install the Vercel CLI globally: `npm install -g vercel`
3. Log in once: `vercel login` — follow the email link.

**Tell Claude when done:** "H-003 done" — Claude will deploy when we reach T-083.

---

## H-004 — Create a Resend account (email alerts)

**Why:** PRD §6.8 requires admin notifications for stuck jobs. Resend is the simplest, free for ~3,000 emails/month.
**Status:** [ ]

1. Sign up: https://resend.com
2. **API Keys → Create API Key** with "Sending access" only. Save as `RESEND_API_KEY`.
3. Verify a sender email. For testing you can use Resend's onboarding sandbox; for production you'll want to verify a domain you own (e.g. `alerts@kingdao.co.tz`) — DNS records required.
   - If you don't yet own a domain, skip the domain verification and tell Claude — we'll proceed with the sandbox sender for now.

**Tell Claude when done:** Confirm the API key is saved, and tell Claude the verified sender email address.

---

## H-005 — Decide on a Git host & create the repo

**Why:** Code needs to live somewhere; Vercel deploys from Git.
**Status:** [ ]

Recommended: **GitHub**.

1. Sign in or sign up at https://github.com.
2. Install GitHub CLI: https://cli.github.com/ (or `winget install GitHub.cli`).
3. Create a private repo:
   ```powershell
   gh auth login
   gh repo create kingdao-logistics-tracker --private --source . --remote origin
   ```
   (Run this from `C:\Users\Baraka\Pictures\kingdaoLogistics` after Claude has done `git init`.)

**Tell Claude when done:** "H-005 done, repo at <URL>"

---

## H-006 — Save the existing Excel tracker into the repo for import testing

**Why:** We need a copy of `TRACKER_--_KDL.xlsx` to develop & test the importer against.
**Status:** [ ]

1. Copy the latest version of `TRACKER_--_KDL.xlsx` into `C:\Users\Baraka\Pictures\kingdaoLogistics\fixtures\` (Claude will create the folder).
2. **Do not commit it to git** — it has live operational data. Claude will add `fixtures/` to `.gitignore`.
3. If the file contains client PII you'd rather not share with Claude verbatim, redact sensitive contact info first.

**Tell Claude when done:** "H-006 done."

---

## H-007 — Authenticate Supabase CLI & link to dev project

**Why:** Claude can't run `supabase login` (it's an interactive browser OAuth flow). The CLI needs to be authenticated before we can push migrations or generate types from the cloud schema. We block Phase 1 (database) on this.
**Status:** [ ]

Run these two commands in PowerShell:

```powershell
# 1. Opens a browser; click Authorize.
supabase login

# 2. Link this repo to the dev project. Will prompt for the DB password
#    you set when creating kdl-tracker-dev (the one in your password manager).
supabase link --project-ref vmkhiahoytuqnjpcxwrb
```

When done, you should see a file `supabase/.temp/project-ref` containing your dev project ref.

**Tell Claude when done:** "H-007 done" — Claude will start Phase 1 (database migrations).

---

## H-008 — Decide the production sender email & domain (later, before launch)

**Why:** For credible-looking alerts, emails should come from `@kingdao.co.tz` (or whatever domain you control), not Resend's sandbox.
**Status:** [ ] (defer until ready to deploy)

When ready:
1. In Resend → Domains → Add Domain.
2. Add the DNS records they give you to your domain registrar.
3. Wait for verification (usually < 10 minutes).
4. Tell Claude the verified domain so we can switch the sender in code.

---

## H-009 — Add team members (after deploy)

**Why:** Operators need accounts.
**Status:** [ ] (defer until app is deployed and you've tested it yourself)

Once the app is live and you (as admin) can log in:
1. Go to `/settings/users` in the deployed app.
2. Invite each operator by email and assign a role.
3. They'll get a Supabase magic-link email to set their password.

---

## H-010 — Deploy the alerts edge function (T-053b)

**Why:** The alerts edge function (`supabase/functions/alerts/`) is built and ready, but Claude can't deploy it. You need (1) a Resend account, (2) to set 3 secrets on the dev Supabase project, (3) to deploy the function, (4) to enable the 30-min cron schedule.
**Status:** [ ]

### Prerequisites
- H-004 done (Resend account + `RESEND_API_KEY`). If you haven't done H-004 yet, do that first — the steps are at the top of this file.
- A verified sender in Resend. For dev/testing you can use Resend's sandbox sender; for production we'll switch to a verified `@kingdao.co.tz` domain in H-008.

### Step 1 — Generate a cron secret
The function is protected by a bearer token so nobody can hit the public URL and trigger emails. Generate a random 32+ character string:

```powershell
# PowerShell — generates a 48-char URL-safe random string
$bytes = New-Object Byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes) -replace '\+','-' -replace '/','_' -replace '=',''
```

Save the output as `ALERTS_CRON_SECRET` (you'll need it twice: once when setting the secret, once when configuring the cron schedule).

### Step 2 — Set the function secrets

```powershell
# From the repo root. Substitute real values for the three placeholders.
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx --project-ref vmkhiahoytuqnjpcxwrb
supabase secrets set ALERTS_FROM="alerts@yourdomain.com" --project-ref vmkhiahoytuqnjpcxwrb
supabase secrets set ALERTS_CRON_SECRET="<the string from Step 1>" --project-ref vmkhiahoytuqnjpcxwrb
supabase secrets set APP_URL="https://your-vercel-deploy.vercel.app" --project-ref vmkhiahoytuqnjpcxwrb
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the Functions runtime automatically — do not set them yourself.

For dev/testing **before T-083** (Vercel deploy), `APP_URL` can be `http://localhost:3000` — links in the email won't be reachable from your phone but the function still works.

### Step 3 — Deploy the function

```powershell
supabase functions deploy alerts --project-ref vmkhiahoytuqnjpcxwrb
```

This uploads `supabase/functions/alerts/index.ts` to the dev project. The first deploy takes ~30 seconds.

`supabase/config.toml` has `[functions.alerts] verify_jwt = false` so the Supabase platform layer won't reject our custom bearer-token requests. (Without that flag, the platform expects every Authorization header to be a Supabase JWT and rejects everything else with `UNAUTHORIZED_INVALID_JWT_FORMAT`.) Auth is enforced *inside* the function via `ALERTS_CRON_SECRET`.

If you deployed before this config change landed, redeploy once (`supabase functions deploy alerts --project-ref vmkhiahoytuqnjpcxwrb`) — the CLI now reads the toml and skips JWT verification automatically.

### Step 4 — Smoke-test the function

Invoke the function manually to confirm it's reachable and the secrets are wired:

```powershell
$secret = "<the string from Step 1>"
$projectRef = "vmkhiahoytuqnjpcxwrb"
curl -X POST "https://$projectRef.supabase.co/functions/v1/alerts" `
  -H "Authorization: Bearer $secret"
```

Expected response (if nothing is stuck right now):

```json
{"sent":0,"claimed":0,"reset":0}
```

If you see `Unauthorized`, the bearer token doesn't match the secret. If you see `RESEND_API_KEY and ALERTS_FROM must be set`, redo Step 2.

### Step 5 — Acceptance test (the T-053 acceptance line)

1. In SQL (Supabase Studio → SQL editor on `kdl-tracker-dev`), pick any consignment that's currently in an Action state for some stage, and backdate it 49 hours:

   ```sql
   -- Replace <CID> with a real consignment_id from your data.
   -- Pick a stage that's currently in 'Action' on that row.
   update public.stage_history
     set occurred_at = now() - interval '49 hours'
     where consignment_id = '<CID>'
       and stage = 'tanesws'
       and to_value = 'Action'
     order by occurred_at desc
     limit 1;
   ```

2. Verify the row appears in the view:

   ```sql
   select consignment_id, stage, hours_stuck
   from public.v_stuck_stages
   where consignment_id = '<CID>';
   ```

3. Invoke the function (same curl as Step 4). You should see `"claimed": 1` and `"sent": <number-of-admins>`. Each admin should receive an email within ~10 seconds.

4. Invoke the function a second time **without** changing anything. You should see `"claimed": 0` — the dedup ledger is working.

### Step 6 — Schedule the cron

Supabase has a built-in scheduler for functions. Two options:

**Option A — Dashboard UI (recommended for now):**

1. Open Supabase Studio → **Edge Functions** → **alerts** → **Schedules** tab.
2. Click **Add schedule**.
3. **Name:** `alerts-30min`
4. **Schedule (cron):** `*/30 * * * *` (every 30 minutes)
5. **HTTP Headers:** add `Authorization: Bearer <the string from Step 1>`
6. Save.

**Option B — SQL (`pg_cron` + `pg_net`):** the same setup as a SQL block; deferred to a future task if you prefer everything-in-migrations.

### Step 7 — Confirm the schedule is live

After ~30 minutes, check the function logs in Studio → **Edge Functions** → **alerts** → **Logs**. You should see one invocation per half-hour, each returning a JSON body.

**Tell Claude when done:** "H-010 done — function deployed, cron scheduled, smoke test passed." Claude will mark T-053 fully done (currently `[~]` at the T-053a code-complete state).

---

## Notes / blockers

> Use this section to write down anything that didn't go to plan, errors you hit, decisions you want to revisit, etc. Claude will read this before suggesting fixes.
