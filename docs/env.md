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

## git-crypt

This repo does **not** yet have git-crypt configured, so `.env.local` is gitignored rather than
committed encrypted. To join the existing key (`f43bdfc3`, shared by the other 12 repos), export
it from 1Password to `~/Downloads/git-crypt-key`, then `git-crypt unlock ~/Downloads/git-crypt-key`
— never `git-crypt init`, which forks the estate onto a new key. Add the env paths to
`.gitattributes` with `-text` (never `text`/`eol`, which corrupts ciphertext).
