import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { PlanLine } from '@/lib/plan'

/**
 * The exercises of a planned workout, each with what it asks for and what you
 * lifted there last time — enough to know what you are walking into without
 * opening the workout. Each row opens the exercise page, for the animation and
 * the how-to when the name alone does not say what it is.
 */
export function PlanList({ lines }: { lines: PlanLine[] }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {lines.map((line, index) => (
        <li key={`${line.exerciseId}-${index}`}>
          <Link
            href={`/exercises/${line.exerciseId}`}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-surface"
          >
            <span className="figure w-6 shrink-0 self-baseline pt-0.5 text-sm text-ink-dim">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">{line.name}</span>
              <span className="mt-0.5 block text-sm text-ink-dim">
                <span className="figure">{line.target}</span>
                {line.last ? (
                  <>
                    {' · last '}
                    <span className="figure">{line.last}</span>
                  </>
                ) : (
                  ' · first time'
                )}
              </span>
            </span>
            <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-dim" />
          </Link>
        </li>
      ))}
    </ol>
  )
}
