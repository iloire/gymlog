# Changelog

## 2026-09-15 11:40

- Scaffold: Next.js 16 (App Router), TypeScript strict, Tailwind v4, shadcn/ui (base-nova, neutral).
- Drizzle + Turso schema for users, exercises, templates, programs, sessions, set logs, bodyweight;
  first migration generated and applied.
- NextAuth v5 credentials auth with JWT sessions; route protection in `proxy.ts` (Next 16 renamed
  `middleware.ts`).
- Zod env modules (`lib/env.ts`, `lib/env.public.ts`), `.vercelignore`, docs and plan.
