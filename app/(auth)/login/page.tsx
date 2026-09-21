'use client'

import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useState } from 'react'

import { AuthShell, Field, SubmitButton } from '@/components/auth-shell'

function LoginForm() {
  const t = useTranslations('auth')
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const result = await signIn('credentials', {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      redirect: false,
    })

    if (result?.error) {
      setError(t('login.failed'))
      setBusy(false)
      return
    }

    router.push(params.get('callbackUrl') ?? '/')
    router.refresh()
  }

  return (
    <AuthShell title={t('login.title')} error={error}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('fields.email')} name="email" type="email" autoComplete="email" required />
        <Field
          label={t('fields.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <SubmitButton busy={busy}>{t('login.submit')}</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-ink-dim">
        {t.rich('login.noAccount', {
          link: (chunks) => (
            <Link href="/signup" className="text-ink underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
