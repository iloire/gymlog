import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { WeekStrip } from '@/components/admin/week-strip'
import { adminUserDetail, type AdminUserDetail } from '@/lib/admin'
import { formatDay } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin' }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Weights are stored in kg; the admin view shows them as stored. */
function kg(value: number): string {
  return `${Number(value.toFixed(1)).toLocaleString('en-GB')} kg`
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <p className="text-sm text-ink-dim">{aside}</p>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-[15px] text-ink-dim">{children}</p>
}

export default async function AdminUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const { id } = await params
  const detail = await adminUserDetail(id)
  const { user } = detail
  const trainedWeeks = detail.weeks.filter((week) => week.days > 0).length

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-8 pb-16">
      <Link href="/admin" className="text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline">
        All accounts
      </Link>

      <header className="mt-4">
        <h1 className="figure text-4xl leading-[1.05] break-words">{user.name ?? user.email}</h1>
        <p className="mt-2 text-[15px] text-ink-dim">
          {user.name && <>{user.email}, </>}
          {user.role === 'admin' ? 'admin' : 'regular account'}, joined {formatDay(user.createdAt)}.
          Displays {user.unit}; sync revision {user.syncRev}.
        </p>
      </header>

      <div className="mt-8 overflow-x-auto pb-1">
        <WeekStrip weeks={detail.weeks} size="lg" />
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        Trained {trainedWeeks} of the last {detail.weeks.length} weeks
      </p>

      <div className="grid gap-x-12 lg:grid-cols-2">
        <Section title="Current programme" aside={detail.program?.stage ?? undefined}>
          {detail.program ? (
            <>
              <p className="pt-3 text-[15px]">
                {detail.program.name}
                <span className="text-ink-dim">, since {formatDay(detail.program.startedOn)}</span>
              </p>
              <ol className="mt-3 divide-y divide-line">
                {WEEKDAYS.map((day, index) => (
                  <li key={day} className="flex gap-4 py-2 text-[15px]">
                    <span className="w-10 text-ink-dim">{day}</span>
                    <span className={detail.program?.week.find((d) => d.dayOfWeek === index) ? '' : 'text-ink-dim'}>
                      {detail.program?.week.find((d) => d.dayOfWeek === index)?.template ?? 'Rest'}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <Empty>No active programme.</Empty>
          )}
        </Section>

        <Section title="Workouts" aside={`${detail.templates.length}`}>
          {detail.templates.length ? (
            <ul className="divide-y divide-line">
              {detail.templates.map((template) => (
                <li key={template.id} className="flex items-baseline justify-between gap-4 py-2 text-[15px]">
                  <span className={template.archivedAt ? 'text-ink-dim' : ''}>
                    {template.name}
                    {template.archivedAt && ' (archived)'}
                  </span>
                  <span className="text-sm text-ink-dim">
                    {template.exercises} {template.exercises === 1 ? 'exercise' : 'exercises'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No workouts built yet.</Empty>
          )}
        </Section>
      </div>

      <Section title="Recent sessions" aside={detail.sessions.length ? `Latest ${detail.sessions.length}` : undefined}>
        {detail.sessions.length ? (
          <ul className="divide-y divide-line">
            {detail.sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        ) : (
          <Empty>No sessions logged.</Empty>
        )}
      </Section>

      <div className="grid gap-x-12 lg:grid-cols-2">
        <Section title="Bodyweight">
          {detail.weights.length ? (
            <ul className="divide-y divide-line">
              {detail.weights.map((entry) => (
                <li key={entry.measuredOn} className="flex justify-between py-2 text-[15px]">
                  <span className="text-ink-dim">{formatDay(entry.measuredOn)}</span>
                  <span className="figure">{kg(entry.weightKg)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No bodyweight entries.</Empty>
          )}
        </Section>

        <Section title="Their own exercises" aside={`${detail.ownExercises.length}`}>
          {detail.ownExercises.length ? (
            <ul className="divide-y divide-line">
              {detail.ownExercises.map((exercise) => (
                <li key={exercise.id} className="flex justify-between gap-4 py-2 text-[15px]">
                  <span>{exercise.name}</span>
                  {exercise.equipment && <span className="text-sm text-ink-dim">{exercise.equipment}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Only uses the shared library.</Empty>
          )}
        </Section>
      </div>
    </main>
  )
}

function SessionRow({ session }: { session: AdminUserDetail['sessions'][number] }) {
  const exercises = Map.groupBy(session.sets, (set) => `${set.position}:${set.exerciseName}`)

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 rounded-sm py-3 outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift [&::-webkit-details-marker]:hidden">
          <span className="w-28 text-sm text-ink-dim">{formatDay(session.scheduledFor)}</span>
          <span className="flex-1 text-[15px]">{session.templateName}</span>
          <span className="figure text-[15px]">
            {session.setsDone}/{session.sets.length}
            <span className="ml-1 font-normal text-ink-dim [font-variation-settings:'wdth'_100]">sets</span>
          </span>
          <span className="figure w-28 text-right text-[15px]">
            {session.volumeKg > 0 ? kg(session.volumeKg) : <span className="text-ink-dim">—</span>}
          </span>
        </summary>

        <div className="overflow-x-auto pb-4">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <tbody>
              {[...exercises.values()].map((sets) => (
                <tr key={`${sets[0]?.position}:${sets[0]?.exerciseName}`} className="align-top">
                  <th scope="row" className="w-1/3 py-1.5 pr-4 font-normal text-ink-dim">
                    {sets[0]?.exerciseName}
                  </th>
                  <td className="py-1.5">
                    <ol className="flex flex-wrap gap-x-4 gap-y-1">
                      {sets.map((set) => (
                        <li
                          key={set.setIndex}
                          className={`figure font-semibold ${set.completedAt === null ? 'text-ink-dim' : ''}`}
                        >
                          {set.completedAt === null
                            ? 'not done'
                            : `${set.weightKg ?? 0}×${set.reps ?? 0}${set.isWarmup ? ' w' : ''}`}
                        </li>
                      ))}
                    </ol>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  )
}

export const dynamic = 'force-dynamic'
