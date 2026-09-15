import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/**
 * Columns carried by every synced table.
 *
 * - `updatedAt` is a client wall clock (corrected by the server clock offset)
 *   and decides last-write-wins conflicts.
 * - `rev` is a server-assigned monotonic counter per user; delta pull is
 *   `WHERE user_id = ? AND rev > ?`, which is immune to clock skew.
 * - `deletedAt` is a tombstone: an offline device has to learn about deletions,
 *   and a hard delete is invisible to a delta pull.
 */
const syncColumns = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  rev: integer('rev').notNull().default(0),
}

/** JSON-encoded `string[]`, stored as TEXT (SQLite has no array type). */
const stringArray = (name: string) => text(name, { mode: 'json' }).$type<string[]>()

// ---------------------------------------------------------------- auth

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  /** Display unit only — weights are always stored in kg. */
  unit: text('unit', { enum: ['kg', 'lb'] })
    .notNull()
    .default('kg'),
  /**
   * `admin` unlocks /admin and nothing else. It is read from this column on
   * every admin request, never from the JWT, and sync never looks at it — an
   * admin's own log syncs exactly like anyone else's.
   */
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  /** Monotonic sync counter, bumped once per written row. */
  syncRev: integer('sync_rev').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

// ---------------------------------------------------------- exercises

/**
 * `userId IS NULL` is the global seed library (read-only, shared by everyone);
 * a non-null `userId` is a user's own exercise. One table, one query path.
 */
export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    category: text('category'),
    level: text('level'),
    force: text('force'),
    mechanic: text('mechanic'),
    equipment: text('equipment'),
    primaryMuscles: stringArray('primary_muscles'),
    secondaryMuscles: stringArray('secondary_muscles'),
    instructions: stringArray('instructions'),
    /** Relative paths under /public, e.g. ["exercise-media/Barbell_Squat/0.webp", …]. */
    images: stringArray('images'),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex('ex_owner_slug').on(t.userId, t.slug),
    index('ex_user_rev').on(t.userId, t.rev),
  ],
)

/** A user's own cues on any exercise, including ones from the global library. */
export const exerciseNotes = sqliteTable(
  'exercise_notes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex('exn_user_exercise').on(t.userId, t.exerciseId),
    index('exn_user_rev').on(t.userId, t.rev),
  ],
)

// ---------------------------------------------------------- templates

export const workoutTemplates = sqliteTable(
  'workout_templates',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    archivedAt: integer('archived_at'),
    ...syncColumns,
  },
  (t) => [index('tpl_user_rev').on(t.userId, t.rev)],
)

export const templateItems = sqliteTable(
  'template_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: text('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    sets: integer('sets').notNull().default(3),
    targetReps: integer('target_reps').notNull().default(10),
    /** Non-null makes the prescription a range, e.g. 8–12. */
    targetRepsMax: integer('target_reps_max'),
    targetWeightKg: real('target_weight_kg'),
    restSec: integer('rest_sec').notNull().default(90),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    index('ti_template_position').on(t.templateId, t.position),
    index('ti_user_rev').on(t.userId, t.rev),
  ],
)

// ------------------------------------------------- program / schedule

/** A development stage. Progressing = end one program, start the next. */
export const programs = sqliteTable(
  'programs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    stage: text('stage'),
    /** Local calendar dates: 'YYYY-MM-DD'. */
    startedOn: text('started_on').notNull(),
    /** NULL = currently active. */
    endedOn: text('ended_on'),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    index('prog_user_started').on(t.userId, t.startedOn),
    index('prog_user_rev').on(t.userId, t.rev),
  ],
)

/** The whole "assign a workout to a day" feature: one row per weekday. */
export const programDays = sqliteTable(
  'program_days',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    programId: text('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    /** 0 = Monday … 6 = Sunday. */
    dayOfWeek: integer('day_of_week').notNull(),
    templateId: text('template_id')
      .notNull()
      .references(() => workoutTemplates.id),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex('pd_program_dow').on(t.programId, t.dayOfWeek),
    index('pd_user_rev').on(t.userId, t.rev),
  ],
)

// ------------------------------------------------- performed sessions

/**
 * `templateName` is a snapshot taken when the session starts, and
 * `templateId`/`programId` are nullable provenance links only — editing or
 * deleting a template next month must not rewrite what January says.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    programId: text('program_id').references(() => programs.id, { onDelete: 'set null' }),
    templateId: text('template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    templateName: text('template_name').notNull(),
    /** Local calendar date 'YYYY-MM-DD' — a timestamp makes "today" wrong abroad. */
    scheduledFor: text('scheduled_for').notNull(),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    index('sess_user_date').on(t.userId, t.scheduledFor),
    index('sess_user_rev').on(t.userId, t.rev),
  ],
)

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    exerciseName: text('exercise_name').notNull(),
    /** Order of the exercise within the session. */
    position: integer('position').notNull(),
    /** 1..n within that exercise. */
    setIndex: integer('set_index').notNull(),

    // Snapshot of the prescription, copied from template_items at session start.
    targetReps: integer('target_reps'),
    targetRepsMax: integer('target_reps_max'),
    targetWeightKg: real('target_weight_kg'),
    restSec: integer('rest_sec'),

    // What actually happened. NULL completedAt = the set is not done yet.
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at'),

    /**
     * Denormalised from `sessions.scheduledFor` (epoch ms) so "last time I
     * lifted X" is one index range scan — IndexedDB has no joins.
     * Keep in sync via `rescheduleSession()`, nowhere else.
     */
    performedAt: integer('performed_at').notNull(),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex('sl_natural').on(t.sessionId, t.exerciseId, t.setIndex),
    index('sl_last_lifted').on(t.userId, t.exerciseId, t.performedAt),
    index('sl_session').on(t.sessionId, t.position, t.setIndex),
    index('sl_user_rev').on(t.userId, t.rev),
  ],
)

// ---------------------------------------------------------- bodyweight

/** One row per day, so re-entering today's weight corrects it instead of duplicating. */
export const bodyWeights = sqliteTable(
  'body_weights',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    measuredOn: text('measured_on').notNull(),
    weightKg: real('weight_kg').notNull(),
    notes: text('notes'),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex('bw_user_date').on(t.userId, t.measuredOn),
    index('bw_user_rev').on(t.userId, t.rev),
  ],
)

// ------------------------------------------------------------- exports

/** Tables the sync engine mirrors to the client, in foreign-key-safe apply order. */
export const syncedTables = {
  exercises,
  exerciseNotes,
  workoutTemplates,
  templateItems,
  programs,
  programDays,
  sessions,
  setLogs,
  bodyWeights,
} as const

export type SyncedTableName = keyof typeof syncedTables

export type User = typeof users.$inferSelect
export type Exercise = typeof exercises.$inferSelect
export type ExerciseNote = typeof exerciseNotes.$inferSelect
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect
export type TemplateItem = typeof templateItems.$inferSelect
export type Program = typeof programs.$inferSelect
export type ProgramDay = typeof programDays.$inferSelect
export type Session = typeof sessions.$inferSelect
export type SetLog = typeof setLogs.$inferSelect
export type BodyWeight = typeof bodyWeights.$inferSelect
