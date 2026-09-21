'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { useLocale } from '@/components/locale-provider'
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
  type ReadError,
} from '@/lib/backup'
import { formatDay } from '@/lib/format'
import { SYNC_TABLES } from '@/lib/sync/types'

/**
 * Export and import, both of them ordinary local work: the file is written from
 * IndexedDB and read back into it, and the outbox carries an import to the
 * server the same way logging a set does. It works with no signal.
 */

/** Reading order — what you did first, then what you built it from. */
const TABLES = [
  'sessions',
  'setLogs',
  'bodyWeights',
  'workoutTemplates',
  'templateItems',
  'programs',
  'programDays',
  'exercises',
  'exerciseNotes',
] as const satisfies readonly (typeof SYNC_TABLES)[number][]

type Picked = { backup: Backup; counts: BackupCounts; name: string }

/** What the file could not be read for, or what went wrong writing it. */
type DataError = ReadError | 'writeFailed'

export default function DataPage() {
  const userId = useUserId()
  const { syncNow } = useSync()
  const fileInput = useRef<HTMLInputElement>(null)
  const t = useTranslations('profile')
  const locale = useLocale()

  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<{ code: DataError; detail?: string } | null>(null)
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
      setError({ code: result.error, detail: result.detail })
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
      setError({ code: 'writeFailed' })
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  /** One line per table with rows in it: '12 logged workouts', '3 weigh-ins'. */
  const lines = (counts: BackupCounts) =>
    TABLES.filter((table) => counts[table] > 0).map((table) => t(`data.counts.${table}`, { count: counts[table] }))

  const errorText = (e: { code: DataError; detail?: string }) =>
    e.code === 'writeFailed'
      ? t('data.import.writeFailed')
      : e.code === 'damaged' && e.detail
        ? t('data.errors.damagedAt', { detail: e.detail })
        : t(`data.errors.${e.code}`)

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>
        <h1 className="figure mt-2 text-4xl">{t('data.title')}</h1>

        <section className="mt-8">
          <h2 className="mb-1 text-xl font-semibold">{t('data.export.title')}</h2>
          <p className="mb-4 text-sm text-ink-dim">{t('data.export.intro')}</p>
          <button
            type="button"
            onClick={download}
            disabled={!userId || busy}
            className="h-12 w-full rounded-md border border-line text-sm disabled:opacity-40"
          >
            {t('data.export.download')}
          </button>
        </section>

        <section className="mt-10">
          <h2 className="mb-1 text-xl font-semibold">{t('data.import.title')}</h2>
          <p className="mb-4 text-sm text-ink-dim">{t('data.import.intro')}</p>

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
            {t('data.import.choose')}
          </label>

          {error && <p className="mt-3 text-sm text-plate-red">{errorText(error)}</p>}

          {picked && (
            <div className="mt-4 rounded-md border border-plate-blue-lift bg-surface p-4">
              <p className="text-sm font-semibold [overflow-wrap:anywhere]">{picked.name}</p>
              <p className="mt-1 text-xs text-ink-dim">
                {t('data.import.exportedOn', { date: formatDay(picked.backup.exportedAt, locale) })}
              </p>

              {lines(picked.counts).length > 0 ? (
                <ul className="mt-3 text-sm text-ink-dim">
                  {lines(picked.counts).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-dim">{t('data.import.empty')}</p>
              )}

              {picked.backup.userId !== userId && (
                <p className="mt-3 text-sm">{t('data.import.otherAccount')}</p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy}
                  className="h-12 flex-1 rounded-md bg-plate-blue text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? t('data.import.applying') : t('data.import.apply')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null)
                    if (fileInput.current) fileInput.current.value = ''
                  }}
                  className="h-12 shrink-0 rounded-md border border-line px-4 text-sm"
                >
                  {t('data.import.cancel')}
                </button>
              </div>
            </div>
          )}

          {summary && (
            <div className="mt-4 rounded-md border border-line p-4">
              <p className="text-sm font-semibold">
                {summary.total > 0
                  ? t('data.import.imported', { count: summary.total })
                  : t('data.import.nothingNew')}
              </p>
              {lines(summary.written).length > 0 && (
                <ul className="mt-2 text-sm text-ink-dim">
                  {lines(summary.written).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {summary.merged > 0 && (
                <p className="mt-2 text-sm text-ink-dim">{t('data.import.merged', { count: summary.merged })}</p>
              )}
              {summary.skipped > 0 && (
                <p className="mt-2 text-sm text-ink-dim">{t('data.import.skipped', { count: summary.skipped })}</p>
              )}
            </div>
          )}
        </section>
      </main>
      <Nav />
    </>
  )
}
