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
- **Conflict resolution** is last-write-wins per row on `updatedAt`; on an exact tie the stored
  row stands. (The plan proposed a `clientId` tie-break; a same-millisecond edit of the same row
  from two devices is vanishingly rare and either answer is fine, so it wasn't worth a column on
  every table.) This is acceptable *only* because the conflict grain is one set, not one workout:
  two devices touching different sets both win.
- **Rejections** come back as `stale` (a newer version is stored), `forbidden` (the row belongs to
  another user, or to the read-only global library) or `invalid` (the database refused it, e.g. a
  row referencing one that does not exist). A forbidden rejection never echoes the other user's
  row back. Every rejection is final — the client drops it from the outbox — so one bad row can
  never block the changes queued behind it.
- **Parents first.** The server sorts each push into schema dependency order (`SYNC_TABLES`, which
  a test keeps identical to `syncedTables` in `db/schema.ts`) before applying it. Turso enforces
  foreign keys, and the client's order cannot be trusted: re-editing a row moves its outbox entry
  to the back, so logging sets offline and then tapping Finish sends the session *after* its sets.
  Before this, that push failed as a whole and the user's sync stalled for good.
- **Clock offset**: the response carries `serverTime`; the client stores
  `clockOffset = serverTime - Date.now()` in `meta` and stamps every `updatedAt` as
  `Date.now() + clockOffset`. Without this a phone four minutes fast wins every conflict forever.
- **Deletes** are ordinary upserts with `deletedAt` set, so the same rule decides delete-vs-edit.
- `userId` is always taken from the JWT and overwritten on every incoming row.

## Deterministic ids

Sessions, set logs, weigh-ins and exercise notes hash their natural key into a UUIDv5
(`lib/id.ts`), so two devices that create the same thing offline create the same row. The hashed
name is a JSON array (`["session", userId, date, templateId]`), not delimiter-joined text, which
would let `('a|b', 'c')` and `('a', 'b|c')` collide. **The namespace and this encoding are
permanent** — changing either gives every existing row a new id.

## The outbox

One entry per row, keyed `${table}:${rowId}`. Editing a set five times replaces its queued
mutation rather than stacking five behind it — an earlier version appended one entry per edit, so
superseded copies were re-sent and rejected on every sync and the "changes waiting" count never
reached zero. After a sync, an entry is removed only if its `queuedAt` still matches what was sent,
so an edit made while a request is in flight survives.

## Working offline

Three things have to hold for the app to open in a gym basement, and each was found by actually
turning the network off:

1. **A service worker** (`public/sw.js`) serves the app shell. Without it, Next's client router
   fetches the route payload and a navigation falls through to the browser's offline page.
2. **The user id is remembered on the device.** NextAuth resolves the session by fetching
   `/api/auth/session`, which fails offline, leaving the app with no user and therefore no access
   to its own local data. `components/session-boot.tsx` stores the signed-in id and uses it when
   the session is unreachable. This grants no server access — the JWT still has to satisfy the
   server on the next sync; it only unlocks data already on the device. Signing out clears it and
   deletes the local database.
3. **The session screen is `/session?id=…`, not `/session/[id]`.** The service worker caches one
   document for the route and serves it for every id (`ignoreSearch`), so a workout never opened
   before still loads. A path segment would need a cached document per session.

`/workouts/[id]` and `/exercises/[id]` are still path segments, so each needs to have been opened
once online before it works offline. Both are used on the sofa rather than at the bar; converting
them is a known follow-up if that changes.

### Testing offline

Test against a production build (`npm run build && npm start`), not `next dev`. In dev, build
chunks are not content-hashed and hot reload patches the running page over a websocket, so a
service worker ends up serving pre-edit code offline while the online page looks correct.
`NEXT_PUBLIC_SW_IN_DEV=true` registers the worker in dev in network-first mode, but a production
build is the only honest test.

## Admin

`/admin` lists every account and `/admin/users/[id]` shows one account's programme, workouts,
recent sessions with their sets, bodyweight and own exercises. It is read-only.

- **Server-rendered, on purpose.** The panel is used at a desk, so it is the one place that reads
  from the server instead of Dexie. It never writes to IndexedDB or the outbox, and `public/sw.js`
  skips `/admin` so other people's data never lands in a device cache (sign-out does not clear
  caches).
- **`users.role` is the only switch** (`user` | `admin`). Every function in `lib/admin.ts` checks it
  against the database before reading anything, so a role change applies on the next request with
  no sign-out, and a check does not depend on the layout re-rendering. Anyone who is not an admin
  gets a 404.
- **Sync never reads the role.** An admin's `/api/sync` is filtered on their own `userId` like
  everyone else's, so an admin's phone holds only their own log.
- **No admin in code or seed data.** Grant it from the command line:
  `npm run user:role -- <email> admin` (or `user:role:prod`).

## Why no CRDTs

A training log is not collaborative text. Rows are small and independently addressable, ids for
naturally-keyed rows are deterministic, and the realistic "conflict" is correcting a number you
just typed. Last-write-wins at row grain is the whole of it.
