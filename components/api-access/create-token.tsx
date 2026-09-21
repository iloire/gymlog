'use client'

import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { createTokenAction } from '@/app/profile/api/actions'
import type { TokenScope } from '@/lib/api-tokens'

const scopes = [
  { value: 'read', label: 'readLabel', detail: 'readDetail' },
  { value: 'write', label: 'writeLabel', detail: 'writeDetail' },
] as const satisfies readonly { value: TokenScope; label: string; detail: string }[]

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations('admin.tokens.create')
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-sm"
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? t('copied') : label}
    </button>
  )
}

/**
 * Name a token and create it. The secret comes back from the action exactly
 * once and lives only in this component's state — reloading the page loses it,
 * which is the point.
 */
export function CreateToken({ apiBase }: { apiBase: string }) {
  const t = useTranslations('admin.tokens.create')
  const [result, action, pending] = useActionState(createTokenAction, null)
  const token = result?.ok ? result.token : null

  const canWrite = result?.ok && result.summary.scope === 'write'

  const prompt = token
    ? `You can ${canWrite ? 'read and change' : 'read'} my gym training log through an API described at ` +
      `${apiBase}/openapi.json. Send the header "Authorization: Bearer ${token}" with every request. ` +
      `Start with ${apiBase}/profile, then ${apiBase}/history for what I lifted.` +
      (canWrite ? ' Tell me what you are going to change before you change it.' : '')
    : ''

  return (
    <div>
      <form action={action}>
        <fieldset>
          <legend className="mb-2 text-sm text-ink-dim">{t('what')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {scopes.map(({ value, label, detail }) => (
              <label
                key={value}
                className="flex cursor-pointer flex-col gap-0.5 rounded-md border border-line bg-surface p-3 text-sm has-checked:border-plate-blue-lift has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="scope"
                  value={value}
                  defaultChecked={value === 'read'}
                  className="sr-only"
                />
                <span className="font-semibold">{t(label)}</span>
                <span className="text-xs text-ink-dim">{t(detail)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 flex gap-2">
          <input
            name="name"
            required
            maxLength={60}
            placeholder={t('namePlaceholder')}
            aria-label={t('nameLabel')}
            className="h-12 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 outline-none focus-visible:border-plate-blue-lift"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-12 shrink-0 rounded-md bg-plate-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? t('creating') : t('submit')}
          </button>
        </div>
      </form>
      {result && !result.ok && <p className="mt-2 text-sm text-plate-red">{t(`errors.${result.error}`, { max: result.max ?? 0 })}</p>}

      {token && (
        <div className="mt-4 rounded-md border border-plate-blue-lift bg-surface p-4">
          <p className="text-sm font-semibold">{t('copyNow')}</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm bg-ground px-2 py-2 font-mono text-[13px]">
              {token}
            </code>
            <CopyButton text={token} label={t('copy')} />
          </div>
          <p className="mt-4 text-sm text-ink-dim">{t('pastePrompt')}</p>
          <p className="mt-2 rounded-sm bg-ground px-2 py-2 font-mono text-[13px] [overflow-wrap:anywhere]">
            {prompt}
          </p>
          <div className="mt-2 flex justify-end">
            <CopyButton text={prompt} label={t('copyPrompt')} />
          </div>
        </div>
      )}
    </div>
  )
}
