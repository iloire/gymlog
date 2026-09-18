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
| `lib/` | `env`, `env.public`, `auth`, `id`, `users`, `utils`; `api*` for the token API. |
| `scripts/` | One-off tooling (exercise import). Excluded from the Vercel build. |
| `data/` | Config data files: exercise import filter, sign in pictures, equipment and premade programmes. Schemas in `data/README.md`. |
| `public/exercise-media/` | Exercise photos, `<id>/{0,1}.webp`. |
| `public/auth-media/` | Sign in pictures, public to signed-out visitors. See `docs/login-images.md`. |

## Sync protocol

`POST /api/sync` — push and pull in one round trip, one SQLite transaction.

```jsonc
// request
{ "cursor": 0, "clientId": "…", "mutations": [ { "id": "…", "table": "setLogs",
  "rowId": "…", "op": "upsert", "row": { … } } ], "unit": "lb" }   // unit only when chosen since last push

// response
{ "cursor": 412, "serverTime": 1757937600000, "unit": "lb",
  "changes": { "setLogs": [ … ] }, "applied": ["…"], "rejected": [ … ] }
```

- **Cursor** is `users.syncRev`, a server-assigned monotonic counter bumped once per written row.
  Delta pull is `WHERE user_id = ? AND rev > ?` — immune to clock skew. `cursor: 0` is the
  bootstrap snapshot, so there is no separate bootstrap endpoint.
- **Conflict resolution** is last-write-wins per row on `updatedAt`, with two exceptions:
  - An exact tie is the same write arriving again (the reply to the first push was lost and the
    device retried), so it counts as applied and the stored row stands. Nobody is told their own
    change was "overwritten".
  - A **fresh row never overwrites a stored one**. Fresh means `createdAt === updatedAt`: the
    device's first write, made without knowing the row existed. Opening a workout pre-creates
    every set with a deterministic id, so a laptop opening today's workout after the phone logged
    it mints the same 22 rows, empty and newer. Under plain last-write-wins they would blank the
    logged sets; instead they lose, and the device takes the logged ones (`isFreshRow()` in
    `lib/sync/types.ts`).

  This is acceptable *only* because the conflict grain is one set, not one workout: two devices
  touching different sets both win.
- **Rejections** come back as `stale` (the stored row stood), `forbidden` (the row belongs to
  another user, or to the read-only global library) or `invalid` (the database refused it, e.g. a
  row referencing one that does not exist). A forbidden rejection never echoes the other user's
  row back. Every rejection is final — the client drops it from the outbox — so one bad row can
  never block the changes queued behind it. On `stale` the client **writes the winner into its
  local table**, so the two devices agree instead of one keeping a version the server will never
  hold.
- **Nothing a device sent is thrown away.** Every rejected row is kept whole in `sync_conflicts`
  (server only: user, device, table, row id, reason, the losing row as JSON, the winner's
  `updatedAt`), unless it was blank — a pre-created set nobody did, a session with nothing in it
  (`isBlankRow()`). Blank losers are also left out of the badge's "overwritten" count. Nothing
  in the app reads the table yet; it is the record to recover a lost set from by hand.
- **One-time repair.** Before winners were applied, a device that lost a push kept its losing
  rows and pulled nothing to replace them, so its copy drifted from the server's for good. The
  first sync after this fix pulls with `cursor: 0`; any row from before the device's real cursor
  whose local copy differs is re-queued instead of overwritten, so the next push logs it as a
  conflict and brings back the winner. `meta.repaired` marks it done.
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
- **The display unit** (`users.unit`, kg or lb) is the one account setting a device can change,
  and it is not a row: it rides beside the mutations. The Units page writes it to `meta` (`unit`,
  plus `unitPending`) in one transaction, so every figure changes at once, offline or not; the
  next push sends `unit`, the server stores it as given (last device to choose wins, no rev) and
  every response carries the current value, which the client keeps unless a newer choice was made
  while the request was in flight. Weights stay kilograms on disk and on the wire; `lib/units.ts`
  converts at the edge — `displayWeight`/`formatWeight` to show, `fromUnit` to store what was
  typed (to the gram, so two phones write the same row), `tidyWeight` to move a prescription or
  history written in the other unit onto a weight the plates make (an empty 20 kg bar is 44.1 lb,
  which becomes 45). Steps and plates have a table per unit (`lib/weights.ts`, `lib/plates.ts`).

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

## Export and import

`/profile/data` writes the account out as one JSON file and reads one back. Both run entirely
against Dexie (`lib/backup.ts`): the export is what is on the device, and an import is an ordinary
batch of local writes whose outbox entries reach the server the same way a logged set does. Neither
direction talks to `/api/sync` itself, so both work with no signal.

- **What the file holds**: every user-owned row of the nine synced tables, minus tombstones, minus
  the global exercise library — every account already has it, it is read-only, and writing those
  rows back would be `forbidden`. Your own exercises are in, since they are the same table with a
  `userId`. Per-row `userId` and `rev` are stripped: the account is decided on import and the
  revision by the server.
- **Your own backup keeps its ids.** Every row lands back on itself, so a restore is exact and
  importing twice is a no-op.
- **Another account's backup cannot.** Those ids belong to someone else on the server, which would
  reject every row as `forbidden` — the rows would sit on the device and never sync. Each row is
  given `importedId(userId, oldId)` (`lib/id.ts`) and every reference between them is remapped to
  match; being deterministic, a second import updates the same rows instead of copying the log
  again. Two rows take their natural-key id instead, because a unique index would otherwise refuse
  them: a weigh-in is (user, date) and an exercise note is (user, exercise). An imported exercise
  whose slug is already here is not written at all — references point at the exercise you have.
- **A missing parent drops the row** rather than writing one the server will reject as `invalid`
  and that then sits on the device forever. A session's programme and workout are optional, so a
  missing one is cleared instead. **An exercise never drops a row**: the shared library is not on a
  device until the first sync finishes, and dropping on that basis would throw away every set on a
  phone restored before it had synced.
- **A whole import is one Dexie transaction**, rows and outbox entries together — the invariant
  `lib/db/write.ts` keeps for a single write. Every row is stamped `updatedAt = now`, so it wins
  last-write-wins: an import is deliberate, and the file is what you asked for.
- **A push carries at most `MAX_PUSH` rows** (`lib/sync/types.ts`), the limit the server enforces on
  the same constant. An import can queue thousands at once, and a batch the server refuses outright
  would never drain; a full batch simply means the next sync takes the rest.

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
- **The Admin link on Profile shows for admins only.** The role is not on the device, so Profile
  asks `GET /api/admin/me` (`useIsAdmin()` in `components/admin/`), which answers
  `{ "admin": true | false }` from the same database check (`adminUserId()` in `lib/admin.ts`). It
  is a hint for one link: with no signal the link is simply absent, and `/admin` checks again
  itself. The role is deliberately *not* carried in the auth JWT — every session read re-signs the
  cookie, so a refreshed role loses a race with any session fetch already in flight.
- **No admin in code or seed data.** Grant it from the command line:
  `npm run user:role -- <email> admin` (or `user:role:prod`).

## API for LLMs

`/api/v1` lets a user hand their log to ChatGPT, Claude or a script. It is described by an OpenAPI
3.1 schema at `/api/v1/openapi.json` (public, no data), whose descriptions are written for the
model reading them.

| | Read token | Read and write token |
|---|---|---|
| `GET /profile`, `/workouts`, `/workouts/{id}`, `/exercises`, `/history`, `/bodyweight` | ✓ | ✓ |
| `POST /workouts`, `PUT` / `DELETE /workouts/{id}` | | ✓ |
| `PUT /programme/week`, `PUT /bodyweight` | | ✓ |

- **Tokens** (`api_tokens`, server only, never synced) are created and revoked on `/profile/api`,
  a server-rendered page with server actions. The secret is `gymlog_` + 32 random bytes, shown
  once; only its SHA-256 is stored (a random 256-bit secret needs no bcrypt). Revoked tokens stay
  as a record. At most 10 active per user; `lastUsedAt` is updated at most once a minute.
- **Tenancy**: `tokenOwner()` finds the token by hash, and its row supplies `userId`. Every read
  and write filters on it, like `/api/sync` does with the JWT. Tokens never authenticate
  `/api/sync`.
- **Reads** (`lib/api.ts`) return names next to ids, drop tombstones and sync columns, and keep
  weights in kg. History is summarised by `summariseSession()` (`lib/session-summary.ts`), the same
  function the History screen uses, so an LLM quotes the numbers the app shows.
- **Writes** (`lib/api-write.ts`) make the server one more of the user's devices. `commit()` bumps
  `users.syncRev` by the number of rows as the transaction's first statement, then upserts each row
  with the next `rev` and `updatedAt = now`. Phones pull the rows on their next sync and
  last-write-wins decides any clash with an edit still in a phone's outbox. The write rules match
  the app: deletes are tombstones, bodyweight uses the app's deterministic id for the day, and a
  cleared weekday's `programDays` row is brought back rather than re-created, because the unique
  index on (programme, weekday) counts tombstoned rows. Logged sessions and sets cannot be written.
- **Revs under concurrency.** libSQL transactions take the write lock at `BEGIN`, and `/api/sync`
  re-reads `syncRev` inside its transaction. Reusing a rev another writer had just handed out would
  let a device whose cursor was already past it skip a row for good.
- `public/sw.js` skips `/profile/api`, and Profile links to it with a plain `<a>`, so the page
  holding token names is never cached or prefetched.

## Why no CRDTs

A training log is not collaborative text. Rows are small and independently addressable, ids for
naturally-keyed rows are deterministic, and the realistic "conflict" is correcting a number you
just typed. Last-write-wins at row grain is the whole of it.
