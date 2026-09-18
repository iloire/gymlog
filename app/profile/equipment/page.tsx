'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { EquipmentPicker } from '@/components/equipment-picker'
import { Nav } from '@/components/nav'

export default function EquipmentPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Profile
        </Link>
        <h1 className="figure mt-2 text-4xl">Equipment</h1>
        <p className="mt-2 text-sm text-ink-dim">
          What your gym has, so premade programmes swap in exercises you can do.
        </p>

        <section className="mt-8">
          <EquipmentPicker />
        </section>
      </main>
      <Nav />
    </>
  )
}
