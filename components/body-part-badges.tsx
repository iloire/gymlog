/** Small pills naming the body parts a workout covers — Legs, Chest, Back… */
export function BodyPartBadges({ parts, className = '' }: { parts: string[]; className?: string }) {
  if (parts.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Body parts">
      {parts.map((part) => (
        <li key={part} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-dim">
          {part}
        </li>
      ))}
    </ul>
  )
}
