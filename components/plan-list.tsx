import type { PlanLine } from '@/lib/plan'

/**
 * The exercises of a planned workout, each with what it asks for and what you
 * lifted there last time — enough to know what you are walking into without
 * opening the workout.
 */
export function PlanList({ lines }: { lines: PlanLine[] }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {lines.map((line, index) => (
        <li key={`${line.exerciseId}-${index}`} className="flex items-baseline gap-3 py-3">
          <span className="figure w-6 shrink-0 text-sm text-ink-dim">{index + 1}</span>
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
        </li>
      ))}
    </ol>
  )
}
