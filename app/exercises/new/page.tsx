'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useMemo, useState } from 'react'

import { useLibraryLabel } from '@/components/exercise-filters'
import { useLocale } from '@/components/locale-provider'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { MUSCLES } from '@/lib/body-parts'
import { getDb } from '@/lib/db/dexie'
import { exerciseNames } from '@/lib/exercise-i18n'
import { createExercise, OWN_CATEGORIES, OWN_EQUIPMENT } from '@/lib/exercises'

const field =
  'h-12 w-full rounded-md border border-line bg-surface px-3 text-[15px] outline-none focus-visible:border-plate-blue-lift'

/**
 * An exercise the library lacks. Four fields: what it is called, what it
 * needs, what it mostly works and what kind of thing it is — enough for the
 * pickers, the body-part sections and the equipment filter to place it.
 * Photos and a how-to are the library's; yours shows its initial instead.
 */
function NewExercisePage() {
  const t = useTranslations('exercises.new')
  const nav = useTranslations('common.nav')
  const label = useLibraryLabel()
  const locale = useLocale()
  const userId = useUserId()
  const router = useRouter()
  const [name, setName] = useState(useSearchParams().get('name') ?? '')
  const [equipment, setEquipment] = useState<string>('body only')
  const [muscle, setMuscle] = useState('')
  const [category, setCategory] = useState<string>('strength')
  const [saving, setSaving] = useState(false)

  const exercises = useLiveQuery(async () => (userId ? getDb(userId).exercises.toArray() : []), [userId], [])

  // The same name as something already here, the library's or yours, is
  // named under the field: a second Kettlebell Swings would split its history.
  const existing = useMemo(() => {
    const wanted = name.trim().toLocaleLowerCase(locale)
    if (!wanted) return null
    return (
      exercises.find(
        (exercise) =>
          exercise.deletedAt === null &&
          exerciseNames(exercise, locale).some((known) => known.toLocaleLowerCase(locale) === wanted),
      ) ?? null
    )
  }, [exercises, name, locale])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!userId || saving || name.trim() === '') return
    setSaving(true)
    const exercise = await createExercise(userId, {
      name,
      equipment,
      category,
      primaryMuscle: muscle || null,
    })
    router.replace(`/exercises/${exercise.id}`)
  }

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-5 pb-6">
        <Link href="/exercises" className="mb-4 flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {nav('exercises')}
        </Link>

        <h1 className="figure text-4xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink-dim">{t('intro')}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">{t('name')}</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={80}
              className={`${field} h-14 text-lg`}
            />
            {existing && (
              <span className="mt-1.5 block text-sm text-plate-yellow">
                {t.rich('exists', {
                  link: (chunks) => (
                    <Link href={`/exercises/${existing.id}`} className="underline underline-offset-2">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">{t('equipment')}</span>
            <select value={equipment} onChange={(event) => setEquipment(event.target.value)} className={field}>
              {OWN_EQUIPMENT.map((value) => (
                <option key={value} value={value}>
                  {label('equipment', value)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">{t('muscle')}</span>
            <select value={muscle} onChange={(event) => setMuscle(event.target.value)} className={field}>
              <option value="">{t('muscleNone')}</option>
              {MUSCLES.map((value) => (
                <option key={value} value={value}>
                  {label('muscle', value)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">{t('category')}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className={field}>
              {OWN_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {label('category', value)}
                </option>
              ))}
            </select>
            {category === 'cardio' && <span className="mt-1.5 block text-xs text-ink-dim">{t('cardioHint')}</span>}
          </label>

          <button type="submit" disabled={!userId || saving || name.trim() === ''} className="btn-primary text-base">
            {t('save')}
          </button>
        </form>
      </main>
      <Nav />
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <NewExercisePage />
    </Suspense>
  )
}
