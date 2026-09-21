import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { CreateToken } from '@/components/api-access/create-token'
import { RevokeToken } from '@/components/api-access/revoke-token'
import { Nav } from '@/components/nav'
import { listApiTokens } from '@/lib/api-tokens'
import { currentUserId } from '@/lib/auth'
import { formatAgo, formatDay } from '@/lib/format'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.tokens')
  return { title: t('title') }
}

/**
 * Server-rendered like /admin: tokens live only on the server, so this page
 * needs a connection and never touches IndexedDB. The service worker does not
 * cache it, and Profile links here with a plain <a> so nothing prefetches it.
 */
export default async function ApiAccessPage() {
  if (!(await currentUserId())) redirect('/login?callbackUrl=/profile/api')

  const t = await getTranslations('admin.tokens')
  const locale = await getLocale()
  const tokens = await listApiTokens()
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https'
  const apiBase = `${protocol}://${host}/api/v1`

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <a href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </a>
        <h1 className="figure mt-2 text-4xl">{t('title')}</h1>
        <p className="mt-3 text-[15px] text-ink-dim">{t('intro')}</p>

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">{t('newToken')}</h2>
          <CreateToken apiBase={apiBase} />
        </section>

        <section className="mt-10">
          <h2 className="border-b border-line pb-2 text-xl font-semibold">{t('yourTokens')}</h2>
          {tokens.length === 0 ? (
            <p className="py-4 text-[15px] text-ink-dim">{t('none')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {tokens.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-semibold">{token.name}</span>
                      <span className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink-dim">
                        {token.scope === 'write' ? t('scopeWrite') : t('scopeRead')}
                      </span>
                    </p>
                    <p className="text-sm text-ink-dim">
                      <span className="font-mono">{token.prefix}…</span> ·{' '}
                      {t('created', { date: formatDay(token.createdAt, locale) })} ·{' '}
                      {token.lastUsedAt
                        ? t('used', { ago: formatAgo(token.lastUsedAt, locale) ?? '' })
                        : t('neverUsed')}
                    </p>
                  </div>
                  <RevokeToken id={token.id} name={token.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 text-[15px]">
          <h2 className="border-b border-line pb-2 text-xl font-semibold">{t('connect')}</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-semibold">{t('chatgpt')}</dt>
              <dd className="mt-1 text-ink-dim">{t('chatgptHow')}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t('scripts')}</dt>
              <dd className="mt-1 text-ink-dim">{t('scriptsHow')}</dd>
              <dd className="mt-2 overflow-x-auto rounded-sm bg-surface px-2 py-2 font-mono text-[13px] whitespace-pre">
                {`curl -H "Authorization: Bearer gymlog_…" \\\n  ${apiBase}/history?limit=10`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{t('schema')}</dt>
              <dd className="mt-1 font-mono text-[13px] break-all">
                <a href={`${apiBase}/openapi.json`} className="underline underline-offset-4">
                  {apiBase}/openapi.json
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-ink-dim">
            {t.rich('endpoints', { code: (chunks) => <span className="font-mono">{chunks}</span> })}
          </p>
        </section>
      </main>
      <Nav />
    </>
  )
}

export const dynamic = 'force-dynamic'
