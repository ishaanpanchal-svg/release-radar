# Release Radar

A weekly digest of what shipped across the open-source repositories a product depends on. Built for the MESA Cohort C4 final exam, Problem Statement 12 ("Open Source Release Radar").

**Live dashboard:** https://release-radar-red.vercel.app  
**Components Map:** [docs/COMPONENTS_MAP.md](docs/COMPONENTS_MAP.md) ([picture](docs/components-map.png))

## What it does

Keerthi tracks 20+ repositories. GitHub Watch buries releases under comments and pull requests, so this app reads **only releases**, summarises them with **Gemini Flash**, and tells her what needs attention:

- 🔴 **Needs attention now:** a security fix or breaking change
- 🟡 **Worth a look:** new features, deprecations, new requirements
- 🟢 **Routine:** small fixes, docs, dependency bumps
- ⚠ **Not sure, please check:** anything the AI or the rules could not settle. These are shown, never hidden, and never green.

Every Monday at 08:00 IST it builds the digest for the last 7 days and emails it. A **Run now** button does the same any day, and the dashboard shows when the last email went out. The tracked list is edited on the dashboard by pasting a GitHub link; no code changes.

## Run it yourself

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev                  # http://localhost:3000
npm test                     # unit tests for the rules and link parsing
```

1. Create a Supabase project and run [supabase/schema.sql](supabase/schema.sql) in its SQL editor.
2. Fill `.env.local` (GitHub token with no scopes, Gemini key, Supabase URL and secret key, Resend key, your email).
3. Deploy to Vercel and add the same variables, plus `CRON_SECRET` (any long random string).

## How it decides colours

1. **Fixed rules** read every release: CVE and GHSA ids, "security fix", attack-class words (XSS, SSRF, RCE, auth bypass…), "BREAKING", dropped support, a major version bump.
2. **Gemini Flash** returns a summary, key changes, security/breaking verdicts, a confidence level and quoted evidence as validated JSON. The release notes are treated as untrusted text.
3. **Merge:** security or breaking from either source is red. Disagreement, empty notes, low confidence, or an AI failure marks the item "not sure". The "Why this colour?" link shows the evidence.

## Stack

Next.js 16 · React 19 · Tailwind 4 · Supabase (Postgres) · Gemini Flash (`@google/genai`) · Resend · Vercel (hosting and Cron) · GitHub REST API.

## Project layout

```
src/lib/github.ts    live data: releases, tags, advisories, link parsing
src/lib/rules.ts     fixed security / breaking rules
src/lib/gemini.ts    Gemini Flash calls, model fallback, JSON schema
src/lib/classify.ts  merge rules + AI, "not sure" logic
src/lib/digest.ts    the pipeline, AI result cache, history
src/lib/email.ts     email template and Resend sending
src/app/api/*        run, cron, repos, digests
src/components/*     dashboard UI
supabase/schema.sql  database tables
tests/               unit tests
```
