# Working on My Shop App

Claude Code reads this file at the start of every session. It carries the owner's standing instructions.

## Start here
- Read `docs/HANDOFF.md` first: it covers status, how to run the app, and the backlog. Then `docs/SECURITY_FINDINGS.md`,
  which lists open items and accepted risks.
- The default branch is `main`. Make each change on a feature branch. Merge to `main` only when the owner asks.

## Owner's standing instructions
- **Product:** a Tally-style accounting, inventory and GST app for Indian shops (starting with Madhya Pradesh).
  - Website first; the Expo Android app is in `mobile/`.
  - Anyone can sign up and run one or many businesses. Each business's data is visible only to its own members.
- **No invented facts:** no made-up companies, statistics, customers, addresses or legal claims, in code, docs or the
  UI. If something is unknown, say so.
- **Security first:** keep row-level security, least privilege and validation, and test each new feature against abuse.
  Record every security finding in `docs/SECURITY_FINDINGS.md` with severity, fix and test.
- **Tests with every change:** `npm test` must stay green. Add regression tests for bugs. Run `npm run build`,
  `npm run smoke` and the relevant `e2e/*.cjs` walkthrough before saying something works.
- **Keep docs current:**
  - API changes go in `docs/API.md`.
  - Field rules go in `docs/FIELDS.md`.
  - Words and titles go in `docs/GLOSSARY.md`.
  - Things the owner must check on a real phone or browser go in `docs/MANUAL_TESTING.md`.
  - Status goes in `docs/HANDOFF.md`.
- **Reports to the owner:** plain English (they may use text-to-speech), short. Say what was done, what was tested,
  and what still needs them.
- **Commits:** author `VaibhavBansa1 <vaibhavbansalgwl@gmail.com>`. Use clear messages. Never put model names or ids in
  the repo.
- **Outward-facing actions:** never open pull requests or GitHub issues, or post anywhere, unless asked.
  Security testing runs only against a local server and test database: no attacks on other systems, no unbounded
  load runs.
- **Dependencies:** keep them minimal. Tooling for one-off jobs (e.g. the feature video) stays outside the repo.

## Quick commands
```bash
docker compose up -d && npm run db:setup     # Postgres (+ Redis, Mailpit) and schema
npm run dev                                  # http://localhost:3000
npm test                                     # needs the test database from db:setup
node scripts/security/probe.mjs && node scripts/security/probe2.mjs   # against a running local server
```
New database changes go in a NEW file in `db/migrations/`. Never edit a migration that was already applied.
