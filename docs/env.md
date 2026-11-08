# Environment variables

Validated centrally with Zod. Never read `process.env` directly — import `env` from
`lib/env.ts` (server) or `publicEnv` from `lib/env.public.ts` (client).

Only `.env.local` (development) and `.env.prod` (production) exist. There is no `.env`. Neither is
in git — see [Where the values live](#where-the-values-live).

| Variable | Required | Where | Notes |
|---|---|---|---|
| `TURSO_DATABASE_URL` | yes | server | `file:./local.db` for local dev; `libsql://…` for Turso |
| `TURSO_AUTH_TOKEN` | no | server | Not needed for a local file DB |
| `AUTH_SECRET` | yes | server | NextAuth v5 signing key. `openssl rand -base64 32` |
| `VERCEL_GIT_COMMIT_SHA` | auto | server | Injected by Vercel; renders the SHA in the footer |
| `NEXT_PUBLIC_APP_NAME` | no | client | Defaults to `gymlog` |
| `NEXT_PUBLIC_SW_IN_DEV` | no | client | `true` registers the service worker under `next dev`. Off by default — test offline against a production build instead |
| `NEXT_PUBLIC_COMMIT_SHA` | auto | client | Not set by hand: `next.config.ts` maps it from `VERCEL_GIT_COMMIT_SHA` |

`.vercelignore` excludes every env file from the build context.

## Vercel

Production reads `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET` (all Secret) and
`NEXT_PUBLIC_APP_NAME` (plain — a public value cannot be a Secret). They mirror `.env.prod`.
`NEXT_PUBLIC_SW_IN_DEV` is deliberately **not** set: it is a dev-only flag.

- **Set values from the file, not by hand.** Pasting into the dashboard can carry quotes or a
  trailing newline; the public env module rejects a malformed flag and fails the build, but a
  quoted database URL only fails at runtime. To (re)set one without printing it:
  `npx dotenv -e .env.prod -- bash -c 'printf "%s" "$TURSO_AUTH_TOKEN" | vercel env add TURSO_AUTH_TOKEN production --force --sensitive'`
- **Only Production has variables.** A Preview deploy (any non-main branch) will fail env
  validation until the same variables are added for Preview.
- **Never run `vercel link` without checking afterwards** — it pulls development variables into
  `.env.local`, overwriting the local file.

## Where the values live

The repo is meant to be public, so no env file is committed — not even encrypted. `.gitignore`
ignores every `.env*` except `.env.example`, the placeholder template that documents each
variable.

The real `.env.local` and `.env.prod` are kept in 1Password, item **gymlog env** (both files as
attachments or notes). On a fresh clone, restore them from there into the repo root. Production
also holds its values in Vercel, but they are Sensitive and cannot be pulled back out, so
1Password is the copy of record.

Until 2026-11-08 both files were committed git-crypt encrypted. That history was rewritten with
`git filter-repo` to drop them; a mirror of the old history is in
`~/code/_archive/gymlog-mirror-2026-11-08.tar.gz`.
