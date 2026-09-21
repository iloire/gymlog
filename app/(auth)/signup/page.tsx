'use client'

import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AuthShell, Field, SubmitButton } from '@/components/auth-shell'

export default function SignupPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: String(form.get('name') ?? '') }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setError(body.error === 'email_taken' ? t('signup.emailTaken') : t('signup.invalid'))
      setBusy(false)
      return
    }

    await signIn('credentials', { email, password, redirect: false })
    router.push('/')
    router.refresh()
  }

  return (
    <AuthShell title={t('signup.title')} error={error}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('fields.name')} name="name" autoComplete="name" />
        <Field label={t('fields.email')} name="email" type="email" autoComplete="email" required />
        <Field
          label={t('fields.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <SubmitButton busy={busy}>{t('signup.submit')}</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-ink-dim">
        {t.rich('signup.haveAccount', {
          link: (chunks) => (
            <Link href="/login" className="text-ink underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </AuthShell>
  )
}
