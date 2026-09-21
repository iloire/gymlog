'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { EquipmentPicker } from '@/components/equipment-picker'
import { Nav } from '@/components/nav'

export default function EquipmentPage() {
  const t = useTranslations('profile')
  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>
        <h1 className="figure mt-2 text-4xl">{t('equipment.title')}</h1>
        <p className="mt-2 text-sm text-ink-dim">{t('equipment.intro')}</p>

        <section className="mt-8">
          <EquipmentPicker />
        </section>
      </main>
      <Nav />
    </>
  )
}
