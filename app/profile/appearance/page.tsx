'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { Nav } from '@/components/nav'
import { ThemePicker } from '@/components/theme-picker'

export default function AppearancePage() {
  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Profile
        </Link>
        <h1 className="figure mt-2 text-4xl">Appearance</h1>

        <section className="mt-8">
          <ThemePicker />
        </section>
      </main>
      <Nav />
    </>
  )
}
