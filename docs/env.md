# Environment variables

Validated centrally with Zod. Never read `process.env` directly — import `env` from
`lib/env.ts` (server) or `publicEnv` from `lib/env.public.ts` (client).

Only `.env.local` (development) and `.env.prod` (production) exist. There is no `.env`.

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
  `.env.local` and appends `.env*` to `.gitignore`, which would stop `.env.prod` being committed.

## git-crypt

`.env.local` and `.env.prod` are committed **encrypted** with the shared git-crypt key
(`f43bdfc3`, stored only in 1Password — the same key as the other repos). `.gitattributes` lists
them with `-text`, which is required: eol normalisation would otherwise strip CR bytes out of the
ciphertext.

On a fresh clone the env files read as binary until the repo is unlocked. Export the key from
1Password to `~/Downloads/git-crypt-key`, run `git-crypt unlock ~/Downloads/git-crypt-key`, then
delete the download. Never `git-crypt init` — it would silently generate a new key and fork this
repo off the shared one.

`.env.example` is committed in plain text and documents every variable.
