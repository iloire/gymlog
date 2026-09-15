import type { Metadata } from 'next'
import Link from 'next/link'

import { WeekStrip } from '@/components/admin/week-strip'
import { adminOverview } from '@/lib/admin'
import { formatAgo, formatDay } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  const { users, totals } = await adminOverview()

  const figures = [
    { value: totals.accounts, label: totals.accounts === 1 ? 'account' : 'accounts' },
    { value: totals.activeThisWeek, label: 'trained this week' },
    { value: totals.workouts, label: 'workouts logged' },
    { value: totals.sets, label: 'sets logged' },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-8 pb-16">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="figure text-4xl">Admin</h1>
        <Link href="/" className="text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline">
          Back to the app
        </Link>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
        {figures.map(({ value, label }) => (
          <div key={label}>
            <dt className="sr-only">{label}</dt>
            <dd className="figure text-3xl leading-none">{value.toLocaleString('en-GB')}</dd>
            <dd className="mt-1.5 text-sm text-ink-dim">{label}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <p className="text-sm text-ink-dim">Last 12 weeks, oldest first</p>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-[15px]">
            <thead className="text-sm text-ink-dim">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Account</th>
                <th className="py-2 pr-4 font-normal">Training</th>
                <th className="py-2 pr-4 text-right font-normal">Workouts</th>
                <th className="py-2 pr-4 text-right font-normal">Sets</th>
                <th className="py-2 pr-4 font-normal">Last active</th>
                <th className="py-2 font-normal">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((user) => (
                <tr key={user.id} className="group">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift"
                    >
                      <span className="text-ink group-hover:underline group-hover:underline-offset-4">
                        {user.name ?? user.email}
                      </span>
                      {user.role === 'admin' && (
                        <span className="ml-2 rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink-dim">
                          admin
                        </span>
                      )}
                      {user.name && <span className="block text-sm text-ink-dim">{user.email}</span>}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <WeekStrip weeks={user.weeks} />
                  </td>
                  <td className="figure py-3 pr-4 text-right">{user.workouts}</td>
                  <td className="figure py-3 pr-4 text-right">{user.sets}</td>
                  <td className="py-3 pr-4 text-ink-dim">{formatAgo(user.lastActiveAt) ?? 'Never'}</td>
                  <td className="py-3 text-ink-dim">{formatDay(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export const dynamic = 'force-dynamic'
