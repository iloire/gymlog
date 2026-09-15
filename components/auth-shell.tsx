import type { ReactNode } from 'react'

export function AuthShell({
  title,
  error,
  children,
}: {
  title: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <p className="figure text-5xl leading-none text-ink">gymlog</p>
        <p className="mt-2 text-sm text-ink-dim">
          Your programme, your numbers, signal or no signal.
        </p>

        <h1 className="mt-10 mb-6 text-xl font-semibold">{title}</h1>

        {error && (
          <p className="mb-5 border-l-2 border-plate-red bg-surface px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}

        {children}
      </div>
    </main>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  ...rest
}: {
  label: string
  name: string
  type?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-dim">{label}</span>
      <input
        name={name}
        type={type}
        className="h-12 w-full rounded-md border border-line bg-surface px-3 text-ink outline-none focus-visible:border-plate-blue-lift focus-visible:ring-2 focus-visible:ring-plate-blue-lift/40"
        {...rest}
      />
    </label>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="h-14 w-full rounded-md bg-plate-blue text-base font-semibold text-white transition-colors hover:bg-plate-blue-lift disabled:opacity-60"
    >
      {busy ? 'Working…' : children}
    </button>
  )
}
