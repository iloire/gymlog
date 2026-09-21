import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { IntlMessageFormat } from 'intl-messageformat'
import { describe, expect, it } from 'vitest'

import { formatAgo, formatDay, formatMonth, formatSet } from '@/lib/format'
import { LOCALES, negotiateLocale, parseLocale } from '@/lib/i18n'
import { formatWeight } from '@/lib/units'
import { weekdayInitials, weekdayName } from '@/lib/week'
import { fallback, MESSAGES } from '@/messages'

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const at = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(at, value)
    else for (const [k, v] of leaves(value, at)) out.set(k, v)
  }
  return out
}

const placeholders = (message: string) => [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()

const MESSAGES_DIR = path.join(process.cwd(), 'messages')
const files = (locale: string) => readdirSync(path.join(MESSAGES_DIR, locale)).filter((f) => f.endsWith('.json'))
const read = (locale: string, file: string): Tree =>
  JSON.parse(readFileSync(path.join(MESSAGES_DIR, locale, file), 'utf8')) as Tree

describe('messages', () => {
  it('has the same files per language', () => {
    for (const locale of LOCALES) expect(files(locale), locale).toEqual(files('en'))
  })

  for (const file of files('en')) {
    describe(file, () => {
      const en = leaves(read('en', file))

      for (const locale of LOCALES.filter((l) => l !== 'en')) {
        const other = leaves(read(locale, file))

        it(`${locale} has every key English has, and no others`, () => {
          expect([...other.keys()].sort()).toEqual([...en.keys()].sort())
        })

        it(`${locale} keeps the placeholders of every message`, () => {
          for (const [key, message] of en) {
            expect(placeholders(other.get(key) ?? ''), key).toEqual(placeholders(message))
          }
        })
      }

      for (const locale of LOCALES) {
        it(`${locale} messages are non-empty and compile as ICU`, () => {
          for (const [key, message] of leaves(read(locale, file))) {
            expect(message.trim(), key).not.toBe('')
            expect(() => new IntlMessageFormat(message, locale), key).not.toThrow()
          }
        })
      }
    })
  }

  it('assembles every file into MESSAGES under the file name', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(files('en').map((f) => f.replace('.json', '')).sort())
    }
  })

  it('reads a key a language lacks in English rather than throwing', () => {
    expect(fallback({ a: { b: 'B', c: 'C' }, d: 'D' }, { a: { b: 'b' } })).toEqual({ a: { b: 'b', c: 'C' }, d: 'D' })
  })
})

describe('parseLocale', () => {
  it('knows English and Spanish and nothing else', () => {
    expect(parseLocale('es')).toBe('es')
    expect(parseLocale('en')).toBe('en')
    expect(parseLocale('fr')).toBe('en')
    expect(parseLocale(null)).toBe('en')
  })
})

describe('negotiateLocale', () => {
  it('reads the browser preference, region and all', () => {
    expect(negotiateLocale('es-MX,es;q=0.9,en;q=0.8')).toBe('es')
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en')
    expect(negotiateLocale('ES')).toBe('es')
  })

  it('takes the best-ranked language we have, skipping ones we do not', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7')).toBe('es')
    expect(negotiateLocale('en;q=0.5,es;q=0.9')).toBe('es')
    expect(negotiateLocale('es;q=0')).toBe('en')
  })

  it('is English with no header at all', () => {
    expect(negotiateLocale(null)).toBe('en')
    expect(negotiateLocale('')).toBe('en')
    expect(negotiateLocale('*')).toBe('en')
  })
})

describe('formatting in Spanish', () => {
  it('writes dates, months and weekdays the Spanish way', () => {
    expect(formatDay('2026-09-15', 'es')).toBe('15 sept 2026')
    expect(formatDay('2026-01-05', 'es')).toBe('5 ene 2026')
    expect(formatMonth('2026-09', 'es')).toBe('septiembre de 2026')
    expect(formatMonth('2026-09', 'en')).toBe('September 2026')
    expect(weekdayName(2, 'es')).toBe('miércoles')
    expect(weekdayInitials('es')).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D'])
    expect(weekdayInitials()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })

  it('says how long ago in Spanish', () => {
    const now = Date.UTC(2026, 8, 21, 12)
    expect(formatAgo(now, now, 'es')).toBe('hoy')
    expect(formatAgo(now - 86_400_000, now, 'es')).toBe('ayer')
    expect(formatAgo(now - 3 * 86_400_000, now, 'es')).toBe('hace 3 días')
    expect(formatAgo(now - 90 * 86_400_000, now, 'es')).toBe('23 jun 2026')
    expect(formatAgo(now - 3 * 86_400_000, now)).toBe('3 days ago')
  })

  it('uses a decimal comma and a thousands point', () => {
    expect(formatWeight(77.5, 'kg', 'es')).toBe('77,5 kg')
    expect(formatWeight(4250, 'kg', 'es')).toBe('4250 kg')
    expect(formatWeight(4250, 'kg')).toBe('4,250 kg')
    expect(formatSet({ weightKg: 77.5, reps: 5 }, 'kg', 'es')).toBe('77,5×5')
  })
})
