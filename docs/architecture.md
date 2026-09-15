# Architecture

## Shape

```
Browser (PWA)                          Vercel                    Turso
┌────────────────────────┐             ┌──────────────┐          ┌─────────┐
│ React components       │             │ /api/sync    │          │ SQLite  │
│   ↓ useLiveQuery       │             │  push + pull │          │         │
│ Dexie (IndexedDB)  ────┼── outbox ──▶│  one txn     │─────────▶│ 10 tbls │
│   + outbox + meta   ◀──┼── changes ──│              │◀─────────│         │
└────────────────────────┘             └──────────────┘          └─────────┘
        ▲                                     ▲
        └── every screen reads here           └── NextAuth JWT supplies userId
```

Components never fetch. The sync engine is the only network caller, and it runs on app focus, the
`online` event, `visibilitychange`, after each set log, and a 30s timer while online.

## Directories

| Path | Contents |
|---|---|
| `app/` | Routes. Gym-facing screens are client components reading Dexie. |
| `db/` | Drizzle schema, migrations, migrate/seed scripts. Server only. |
| `lib/db/` | Dexie schema + typed accessors. Client only. |
| `lib/sync/` | Outbox, flush loop, merge rules. |
| `lib/` | `env`, `env.public`, `auth`, `id`, `users`, `utils`. |
| `scripts/` | One-off tooling (exercise import). Excluded from the Vercel build. |
| `data/` | Config data files, e.g. `exercise-filter.json`. |
| `public/exercise-media/` | Exercise photos, `<id>/{0,1}.webp`. |

## Sync protocol

`POST /api/sync` — push and pull in one round trip, one SQLite transaction.

```jsonc
// request
{ "cursor": 0, "clientId": "…", "mutations": [ { "id": "…", "table": "setLogs",
  "rowId": "…", "op": "upsert", "row": { … } } ] }

// response
{ "cursor": 412, "serverTime": 1757937600000,
  "changes": { "setLogs": [ … ] }, "applied": ["…"], "rejected": [ … ] }
```

- **Cursor** is `users.syncRev`, a server-assigned monotonic counter bumped once per written row.
  Delta pull is `WHERE user_id = ? AND rev > ?` — immune to clock skew. `cursor: 0` is the
  bootstrap snapshot, so there is no separate bootstrap endpoint.
- **Conflict resolution** is last-write-wins per row on `updatedAt`, ties broken by the
  lexicographically larger `clientId`. This is acceptable *only* because the conflict grain is one
  set, not one workout: two devices touching different sets both win.
- **Clock offset**: the response carries `serverTime`; the client stores
  `clockOffset = serverTime - Date.now()` in `meta` and stamps every `updatedAt` as
  `Date.now() + clockOffset`. Without this a phone four minutes fast wins every conflict forever.
- **Deletes** are ordinary upserts with `deletedAt` set, so the same rule decides delete-vs-edit.
- `userId` is always taken from the JWT and overwritten on every incoming row.

## Why no CRDTs

A training log is not collaborative text. Rows are small and independently addressable, ids for
naturally-keyed rows are deterministic, and the realistic "conflict" is correcting a number you
just typed. Last-write-wins at row grain is the whole of it.
