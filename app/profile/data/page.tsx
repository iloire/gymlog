'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'

import { Nav } from '@/components/nav'
import { useSync, useUserId } from '@/components/session-boot'
import {
  backupFilename,
  countRows,
  exportBackup,
  importBackup,
  readBackup,
  type Backup,
  type BackupCounts,
  type ImportSummary,
} from '@/lib/backup'
import { formatDay } from '@/lib/format'
import type { SyncTable } from '@/lib/sync/types'

/**
 * Export and import, both of them ordinary local work: the file is written from
 * IndexedDB and read back into it, and the outbox carries an import to the
 * server the same way logging a set does. It works with no signal.
 */

/** Reading order — what you did first, then what you built it from. */
const TABLES: [SyncTable, string, string][] = [
  ['sessions', 'logged workout', 'logged workouts'],
  ['setLogs', 'set', 'sets'],
  ['bodyWeights', 'weigh-in', 'weigh-ins'],
  ['workoutTemplates', 'workout', 'workouts'],
  ['templateItems', 'exercise in a workout', 'exercises in workouts'],
  ['programs', 'programme', 'programmes'],
  ['programDays', 'scheduled day', 'scheduled days'],
  ['exercises', 'exercise of your own', 'exercises of your own'],
  ['exerciseNotes', 'exercise note', 'exercise notes'],
]

function lines(counts: BackupCounts): string[] {
  return TABLES.filter(([table]) => counts[table] > 0).map(
    ([table, one, many]) => `${counts[table].toLocaleString('en-GB')} ${counts[table] === 1 ? one : many}`,
  )
}

type Picked = { backup: Backup; counts: BackupCounts; name: string }

export default function DataPage() {
  const userId = useUserId()
  const { syncNow } = useSync()
  const fileInput = useRef<HTMLInputElement>(null)

  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  async function download() {
    if (!userId) return
    setBusy(true)
    try {
      const backup = await exportBackup(userId)
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = backupFilename(backup.exportedAt)
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  async function pick(file: File | undefined) {
    setPicked(null)
    setError(null)
    setSummary(null)
    if (!file) return

    const result = readBackup(await file.text())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPicked({ backup: result.backup, counts: countRows(result.backup), name: file.name })
  }

  async function apply() {
    if (!userId || !picked) return
    setBusy(true)
    try {
      const result = await importBackup(userId, picked.backup)
      setSummary(result)
      setPicked(null)
      // Straight out to the server, so the phone in your pocket has it too.
      void syncNow()
    } catch {
      setError('Something in that backup could not be written. Nothing else was changed.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Profile
        </Link>
        <h1 className="figure mt-2 text-4xl">Your data</h1>

        <section className="mt-8">
          <h2 className="mb-1 text-xl font-semibold">Export</h2>
          <p className="mb-4 text-sm text-ink-dim">
            One JSON file with every workout, session, set and weigh-in on this device — a backup,
            and something you can hand to an assistant to read. The shared exercise library is left
            out; the exercises you added yourself are in.
          </p>
          <button
            type="button"
            onClick={download}
            disabled={!userId || busy}
            className="h-12 w-full rounded-md border border-line text-sm disabled:opacity-40"
          >
            Download backup
          </button>
        </section>

        <section className="mt-10">
          <h2 className="mb-1 text-xl font-semibold">Import</h2>
          <p className="mb-4 text-sm text-ink-dim">
            Read a backup back in. Nothing is deleted: rows in the file are added, or updated where
            they are already here.
          </p>

          <input
            ref={fileInput}
            id="backup-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void pick(event.target.files?.[0])}
            className="sr-only"
          />
          <label
            htmlFor="backup-file"
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-md border border-line text-sm"
          >
            Choose a backup file
          </label>

          {error && <p className="mt-3 text-sm text-plate-red">{error}</p>}

          {picked && (
            <div className="mt-4 rounded-md border border-plate-blue-lift bg-surface p-4">
              <p className="text-sm font-semibold [overflow-wrap:anywhere]">{picked.name}</p>
              <p className="mt-1 text-xs text-ink-dim">
                Exported {formatDay(picked.backup.exportedAt)}
              </p>

              {lines(picked.counts).length > 0 ? (
                <ul className="mt-3 text-sm text-ink-dim">
                  {lines(picked.counts).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-dim">There is nothing in it.</p>
              )}

              {picked.backup.userId !== userId && (
                <p className="mt-3 text-sm">
                  This backup is from another account, so its rows come in as new ones here rather
                  than replacing yours. Importing it twice is still safe.
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy}
                  className="h-12 flex-1 rounded-md bg-plate-blue text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? 'Importing…' : 'Import'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null)
                    if (fileInput.current) fileInput.current.value = ''
                  }}
                  className="h-12 shrink-0 rounded-md border border-line px-4 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {summary && (
            <div className="mt-4 rounded-md border border-line p-4">
              <p className="text-sm font-semibold">
                {summary.total > 0
                  ? `Imported ${summary.total.toLocaleString('en-GB')} rows.`
                  : 'Nothing to import — it is all already here.'}
              </p>
              {lines(summary.written).length > 0 && (
                <ul className="mt-2 text-sm text-ink-dim">
                  {lines(summary.written).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {summary.merged > 0 && (
                <p className="mt-2 text-sm text-ink-dim">
                  {summary.merged} exercise{summary.merged === 1 ? '' : 's'} matched
                  {summary.merged === 1 ? ' one' : ' ones'} you already have.
                </p>
              )}
              {summary.skipped > 0 && (
                <p className="mt-2 text-sm text-ink-dim">
                  {summary.skipped} row{summary.skipped === 1 ? '' : 's'} left out — what{' '}
                  {summary.skipped === 1 ? 'it belongs' : 'they belong'} to was not in the file.
                </p>
              )}
            </div>
          )}
        </section>
      </main>
      <Nav />
    </>
  )
}
