# Studyroom

A bilingual Mongolian/English IELTS, TOEFL and SAT study website built from the six supplied study guides and mock-test PDFs. The three collections have their own pages and red, purple and blue accents.

## What works

- Free timed samples for every skill and a combined sample for all three exams, with no login required.
- Five protected practice sets per exam, containing 411 questions/tasks. Each can be taken by section or as a full practice test. SAT has Reading & Writing and Math; IELTS and TOEFL have Reading, Listening, Writing and Speaking. Full-test navigation and results are grouped by section.
- Mongolian question and answer-choice hints, independently of the interface language. Correct answers remain hidden until submission. Results also translate answer choices and IELTS completion answers.
- Server-enforced deadlines, automatic submission, saved answers, resume without resetting the clock, question navigation, review marks, scoring and answer review. Section and full-test attempts have independent clocks and saved answers. Full tests use one continuous timer with suggested time allocations for each section. During an outage, the client retries saving; after the deadline, only answers already received by the server count.
- Essay responses with word counts and speaking notes are saved with the result. Optional microphone recordings stay in the current browser (IndexedDB), can be replayed in results and downloaded, and are limited to five minutes per recording. They are not uploaded or synced between devices. Keyed sentence exercises are scored; essays and speaking are explicitly self-reviewed.
- Listening uses the supplied scripts, with optional device-generated read-aloud voices. English adaptations accompany the original Mongolian IELTS listening scripts. Voice/microphone availability depends on the browser; recording needs HTTPS or localhost.
- Three free study guides, presented as lessons inside the website, with the original Mongolian text and English introductions. All six source PDFs are used; PDFs are never served or embedded in the site.
- Google OAuth login, persistent sessions and personal result history.
- Per-exam access requests and an admin page to approve, decline or revoke access. No bank API, checkout or payment processing is configured.

The full-test option combines **all sections of a numbered practice set**. These are the shorter sets in the PDFs, not official full-length or adaptive exam simulations. The two separate bonus full-length tests remain outside the interactive library. There are no supplied audio recordings, automatic essay/speaking grading or official scaled scores. Original source answer keys have a few ambiguities; see [content notes](content/README.md).

## Practice timing

| Exam  | Section limits                                                    | Full practice set |
| ----- | ----------------------------------------------------------------- | ----------------- |
| SAT   | Reading & Writing 13 min; Math 16 min                             | 29 min            |
| IELTS | Listening 16 min; Reading 20 min; Writing 60 min; Speaking 14 min | 110 min           |
| TOEFL | Reading 20 min; Listening 10 min; Writing 23 min; Speaking 8 min  | 61 min            |

Limits are practice allocations suited to the supplied tasks. Each section also has a shorter free sample. A full sample combines those samples under one clock. One exam access grant unlocks every section and full set for that exam. Existing attempt IDs continue to work, so earlier saved results and unfinished tests are preserved.

## Run on Linux

Use Node.js **24 or later** (includes the SQLite driver) and npm. No separate database server is required.

From this project directory:

```bash
npm ci
npm run dev
```

The development web server uses port **5173** and proxies `/api` to port **3001**. The application runs without Google credentials so the free samples and study guides can be used immediately. `npm ci` installs pinned dependencies without changing the lockfile. On a restricted cloud machine use `npm ci --cache /workspace/.npm-cache` if the normal npm cache is not writable.

If this repository has not been pushed to GitHub yet, copy this project directory to your Linux machine first, excluding `node_modules`, `dist`, `.data` and `.env`. The six PDFs and prepared content are included. This task built the app in the cloud workspace; it did not install anything on your personal computer.

## Enable Google login

1. In Google Cloud, configure the Google Auth Platform consent screen and create an OAuth client of type **Web application**. Request only `openid`, `email` and `profile`. For an app in testing mode, add your account and intended test accounts as test users.
2. Register the exact development callback: `http://localhost:5173/api/auth/google/callback`. Use that same hostname in your browser; `localhost` and `127.0.0.1` are different origins. For deployment, register the HTTPS callback on your own domain instead.
3. Copy `.env.example` to `.env` without overwriting an existing `.env`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN`, `GOOGLE_REDIRECT_URI` and `ADMIN_EMAILS`. Put your own Google account email in `ADMIN_EMAILS`; separate multiple administrators with commas.
4. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and place it in `SESSION_SECRET`. Keep `.env` private and outside version control. In cloud settings, enter values through the secure configuration UI, never in chat.
5. Restart `npm run dev`. Sign in, open **My learning → Manage access**, and review incoming requests.

Development without a supplied session secret uses a randomly generated, ignored `.data/session.key`. Production requires a configured secret with at least 32 characters.

The server verifies Google ID tokens and verified email, checks OAuth state and nonce, uses PKCE, regenerates the session after login, and enforces administrator permissions on the server. Browser tests use an isolated mock OAuth provider; a real Google login still needs to be validated with your OAuth client.

## Manual access / Khan Bank later

A student signs in and requests access for one exam. The request does not charge them and does not grant access. You arrange payment separately, verify it yourself, and approve the correct email and exam in `/admin`. Revoking access immediately blocks new test loads and results for that exam. An audit table records approvals, declines and revocations. There is deliberately no fabricated bank account, price or automatic payment confirmation.

## Production

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

Set `APP_ORIGIN` to your real HTTPS origin, configure the matching Google callback and a strong `SESSION_SECRET`, and run behind an HTTPS reverse proxy. Set `TRUST_PROXY=1` only when a trusted proxy handles the connection. The server serves **only `dist`**, not the project directory. Vite also denies access to source PDFs, question keys, server code, tests, scripts and database files during development.

With no `DATABASE_URL`, sessions, accounts, access grants, requests and test results stay in SQLite at `DATABASE_PATH` (default `.data/studyroom.sqlite`). Persist that directory between restarts, and keep this SQLite setup on one server process. Use SQLite's online backup, or stop the process before copying the database and its WAL files.

## Supabase and Vercel

The local SQLite file cannot be the shared database on Vercel. Serverless instances do not share a disk, and the project directory is read-only, so a `.data` file would be empty or rejected on the next instance. Set `DATABASE_URL` and the API opens Supabase Postgres instead. `GET /api/health` reports `"database": "postgres"` when that connection is open.

1. In Supabase, create a project. Click **Connect**, choose **Transaction pooler**, and copy the URI. It uses port **6543** and a username like `postgres.[project-ref]`. Replace `[YOUR-PASSWORD]` and percent-encode any `&`, `#`, `?`, or space in the password.
2. In Vercel, import this project and set the Node.js version to **24**. Add environment variables: `DATABASE_URL` (the pooler URI), `SESSION_SECRET` (at least 32 random characters), `APP_ORIGIN` (`https://your-domain`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (`https://your-domain/api/auth/google/callback`), and `ADMIN_EMAILS`. Do not add a `VITE_` copy of the database URL. `TRUST_PROXY` is enabled when Vercel sets `VERCEL=1`.
3. Register that exact Google callback on the OAuth client. `APP_ORIGIN` must match the site origin with no trailing slash, or login and answer saves are rejected.
4. Deploy. On startup the API runs `server/schema.postgres.sql`: it creates the tables if they are missing, enables row-level security, and revokes `anon` and `authenticated`. The Express server connects as the database owner, which can still read and write. The Supabase Data API cannot. Do not put the service-role key or the database password in the browser.
5. Open `/api/health`. `"database": "postgres"` means the connection is open. Sign in once and confirm the user appears in the Supabase table editor under `users`.

The pool uses one connection per warm instance and does not use prepared statements, which transaction mode cannot keep. Leave the local `npm run dev` path unchanged by keeping `DATABASE_URL` empty; samples and guides still use SQLite.

## Verify

```bash
npm test
npm run build
npm run test:e2e
```

The browser suite uses Chromium at `/usr/bin/chromium` on this cloud machine. Set `CHROMIUM_PATH` to another Chromium installation if necessary. It starts an isolated app on port 4173 with an in-memory database and test-only OAuth adapter. These mocks are never imported by the production server.

Backend tests cover source structure, equivalent answers, protected content, result ownership, CSRF, OAuth state, expiry, resume, manual approval, per-exam isolation and revocation. Browser tests cover all skill selectors, bilingual UI and hints, section/full sample completion, essay word counts and persistence, recording and playback across reload, section results, account/admin workflow and mobile layouts. Media tests use a fake microphone device; browser read-aloud voices vary by OS.

## Content and project structure

- `src/`: React UI and bilingual labels; styles and fonts are bundled locally.
- `server/`: Express API, Google OAuth, sessions, SQLite and grading. Correct answers remain here/on the server.
- `content/tests.json`: the original curated bilingual reading/math question bank.
- `content/sections.json`: the additional listening, writing, speaking and TOEFL word-completion tasks.
- `server/tests.mjs`: section/full variants, sample selection, timing and grading.
- `content/guides.json`: lessons from all three guides.
- `content/source/`: the original six PDFs, private source material.
- `scripts/import-tests.py`, `scripts/translate-tests.py`, `scripts/import-sections.py`, `scripts/prepare-guides.py`: optional content regeneration (requires Python 3 and PyMuPDF). Run in that order. Regeneration is unnecessary for installation because the prepared JSON is included with the app.

“Studyroom” is the initial site name. The project is intentionally usable on both this cloud environment and a Linux computer.
