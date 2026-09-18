'use client'

import { formatDay } from '@/lib/format'
import type { StrengthPoint } from '@/lib/progress'

/**
 * One lift over time: the top set's weight as the bold line, the estimated
 * one-rep max as a thin one above it. Inline SVG like the bodyweight chart —
 * one series each, no interaction, and it has to render with no network.
 */
export function StrengthChart({ series, className = '' }: { series: StrengthPoint[]; className?: string }) {
  const width = 100
  const height = 34
  const inset = 1.5

  if (series.length < 2) return null

  const first = series[0]!
  const last = series.at(-1)!
  const values = series.flatMap((point) => [point.topKg, point.e1rmKg])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const x = (index: number) => inset + (index / (series.length - 1)) * (width - inset * 2)
  const y = (value: number) => inset + (1 - (value - min) / span) * (height - inset * 2)
  const path = (pick: (point: StrengthPoint) => number) =>
    series.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(pick(point)).toFixed(2)}`).join(' ')

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Top set from ${first.topKg} kg on ${formatDay(first.performedAt)} to ${last.topKg} kg on ${formatDay(last.performedAt)}`}
      >
        <path
          d={path((point) => point.e1rmKg)}
          fill="none"
          stroke="var(--ink-dim)"
          strokeWidth={0.5}
          strokeDasharray="1.5 1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path((point) => point.topKg)}
          fill="none"
          stroke="var(--plate-blue-lift)"
          strokeWidth={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {series.map((point, index) => (
          <circle key={point.performedAt} cx={x(index)} cy={y(point.topKg)} r={0.7} fill="var(--plate-blue-lift)" />
        ))}
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-xs text-ink-dim">
        <span>{formatDay(first.performedAt)}</span>
        <span>
          <span className="figure text-ink">{first.topKg}</span> → <span className="figure text-ink">{last.topKg}</span> kg top set ·
          e1RM <span className="figure">{Math.round(last.e1rmKg)}</span>
        </span>
        <span>{formatDay(last.performedAt)}</span>
      </figcaption>
    </figure>
  )
}
