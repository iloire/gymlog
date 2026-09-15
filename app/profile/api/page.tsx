import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { CreateToken } from '@/components/api-access/create-token'
import { RevokeToken } from '@/components/api-access/revoke-token'
import { Nav } from '@/components/nav'
import { listApiTokens } from '@/lib/api-tokens'
import { currentUserId } from '@/lib/auth'
import { formatAgo, formatDay } from '@/lib/format'

export const metadata: Metadata = { title: 'API access' }

/**
 * Server-rendered like /admin: tokens live only on the server, so this page
 * needs a connection and never touches IndexedDB. The service worker does not
 * cache it, and Profile links here with a plain <a> so nothing prefetches it.
 */
export default async function ApiAccessPage() {
  if (!(await currentUserId())) redirect('/login?callbackUrl=/profile/api')

  const tokens = await listApiTokens()
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https'
  const apiBase = `${protocol}://${host}/api/v1`

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <a href="/profile" className="text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline">
          Profile
        </a>
        <h1 className="figure mt-2 text-4xl">API access</h1>
        <p className="mt-3 text-[15px] text-ink-dim">
          Let ChatGPT, Claude or another tool read your workouts, history and bodyweight — to review
          your training or spot a stall — and, with a read and write token, rework your workouts and
          week for you. Changes reach your phone on its next sync; logged sets are never changed.
          Anyone holding a token has that access, so revoke it when you stop using it.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">New token</h2>
          <CreateToken apiBase={apiBase} />
        </section>

        <section className="mt-10">
          <h2 className="border-b border-line pb-2 text-xl font-semibold">Your tokens</h2>
          {tokens.length === 0 ? (
            <p className="py-4 text-[15px] text-ink-dim">None yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tokens.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-semibold">{token.name}</span>
                      <span className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink-dim">
                        {token.scope === 'write' ? 'read and write' : 'read only'}
                      </span>
                    </p>
                    <p className="text-sm text-ink-dim">
                      <span className="font-mono">{token.prefix}…</span> · created{' '}
                      {formatDay(token.createdAt)} ·{' '}
                      {token.lastUsedAt ? `used ${formatAgo(token.lastUsedAt)}` : 'never used'}
                    </p>
                  </div>
                  <RevokeToken id={token.id} name={token.name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 text-[15px]">
          <h2 className="border-b border-line pb-2 text-xl font-semibold">Connect a tool</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-semibold">ChatGPT (custom GPT)</dt>
              <dd className="mt-1 text-ink-dim">
                Configure → Create new action → Import from URL, and paste the schema address below.
                Authentication: API key, Bearer, with your token.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Claude Code, agents and scripts</dt>
              <dd className="mt-1 text-ink-dim">
                Create a token and copy the prompt shown with it, or send the header yourself:
              </dd>
              <dd className="mt-2 overflow-x-auto rounded-sm bg-surface px-2 py-2 font-mono text-[13px] whitespace-pre">
                {`curl -H "Authorization: Bearer gymlog_…" \\\n  ${apiBase}/history?limit=10`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Schema (OpenAPI)</dt>
              <dd className="mt-1 font-mono text-[13px] break-all">
                <a href={`${apiBase}/openapi.json`} className="underline underline-offset-4">
                  {apiBase}/openapi.json
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-ink-dim">
            Read: <span className="font-mono">/profile</span>, <span className="font-mono">/workouts</span>,{' '}
            <span className="font-mono">/exercises</span>, <span className="font-mono">/history</span>,{' '}
            <span className="font-mono">/bodyweight</span>. Write: create, replace and delete workouts, set{' '}
            <span className="font-mono">/programme/week</span>, record bodyweight. Weights are in kg.
          </p>
        </section>
      </main>
      <Nav />
    </>
  )
}

export const dynamic = 'force-dynamic'
