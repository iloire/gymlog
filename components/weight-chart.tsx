'use client'

type Entry = { measuredOn: string; weightKg: number; rolling: number }

/**
 * Daily weight is noise; the 7-day average is the signal. So the average is
 * the line, and the daily readings are faint dots behind it — the shape you
 * actually make decisions on is the one that's drawn boldly.
 *
 * Inline SVG rather than a chart library: one series, no interaction, and it
 * has to render with no network.
 */
export function WeightChart({ series }: { series: Entry[] }) {
  const width = 100
  const height = 34
  // Inset so dots on the first and last day are not clipped by the SVG edge.
  const inset = 1.5

  const values = series.flatMap((entry) => [entry.weightKg, entry.rolling])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const x = (index: number) => inset + (index / Math.max(1, series.length - 1)) * (width - inset * 2)
  const y = (value: number) => inset + (1 - (value - min) / span) * (height - inset * 2)

  const path = series
    .map((entry, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(entry.rolling).toFixed(2)}`)
    .join(' ')

  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-36 w-full"
        role="img"
        aria-label={`Bodyweight from ${series[0]?.measuredOn} to ${series.at(-1)?.measuredOn}, ${min.toFixed(1)} to ${max.toFixed(1)} kg`}
      >
        {series.map((entry, index) => (
          <circle
            key={entry.measuredOn}
            cx={x(index)}
            cy={y(entry.weightKg)}
            r={0.6}
            className="fill-ink-dim/50"
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--plate-blue-lift)"
          strokeWidth={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-xs text-ink-dim">
        <span>{series[0]?.measuredOn}</span>
        <span>
          {min.toFixed(1)}–{max.toFixed(1)} kg
        </span>
        <span>{series.at(-1)?.measuredOn}</span>
      </figcaption>
    </figure>
  )
}
