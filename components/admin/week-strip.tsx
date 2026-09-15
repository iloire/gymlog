import type { WeekActivity } from '@/lib/admin'

/**
 * One square per week, oldest on the left — the set squares from the session
 * screen, read at the scale of a training block. Outlined = no training that
 * week; filled = trained, full plate blue from three days up.
 */
export function WeekStrip({ weeks, size = 'sm' }: { weeks: WeekActivity[]; size?: 'sm' | 'lg' }) {
  const trained = weeks.filter((week) => week.days > 0).length
  const square = size === 'lg' ? 'size-5' : 'size-3'

  return (
    <ol
      className={`flex ${size === 'lg' ? 'gap-1.5' : 'gap-1'}`}
      aria-label={`Trained ${trained} of the last ${weeks.length} weeks`}
    >
      {weeks.map((week) => (
        <li
          key={week.weekOf}
          title={`Week of ${week.weekOf}: ${week.days} ${week.days === 1 ? 'day' : 'days'}`}
          className={`${square} shrink-0 rounded-[2px] ${
            week.days === 0
              ? 'border border-line'
              : week.days >= 3
                ? 'bg-plate-blue-lift'
                : 'bg-plate-blue-lift/45'
          }`}
        />
      ))}
    </ol>
  )
}
