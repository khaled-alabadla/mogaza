import { useText } from '../context/ContentContext'

/** The people behind the system (editable from the developer dashboard): login page and site footer. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCredits() {
  return [
    { role: useText('credits.1.role'), name: useText('credits.1.name') },
    { role: useText('credits.2.role'), name: useText('credits.2.name') },
    { role: useText('credits.3.role'), name: useText('credits.3.name') },
  ].filter((c) => c.name)
}

const TONES = {
  // on the green identity panel
  dark: {
    card: 'bg-white/[0.07] ring-1 ring-gold-400/50 shadow-lg shadow-black/10 backdrop-blur-sm',
    role: 'text-gold-400',
    name: 'text-white',
  },
  // on the light background (small screens)
  light: {
    card: 'bg-white ring-1 ring-brand-100 shadow-sm',
    role: 'text-brand-700',
    name: 'text-ink',
  },
}

/**
 * Credits of the login page: each person in a card of their own (role above, name in large type), all the
 * same size, two to a row (an odd last one centered).
 */
export default function Credits({ className = '', tone = 'dark' }) {
  const credits = useCredits()
  const t = TONES[tone]
  if (!credits.length) return null
  return (
    <div className={`flex flex-wrap justify-center gap-3 text-center ${className}`}>
      {credits.map((c) => (
        <div
          key={c.name}
          className={`flex min-h-[4.25rem] basis-[calc(50%-0.375rem)] flex-col justify-center rounded-2xl px-3 py-3 ${t.card}`}
        >
          <p className={`text-xs font-semibold ${t.role}`}>{c.role}</p>
          {/* the names in the calligraphic font of the page's dedication («أثرٌ جميل») */}
          <p className={`mt-1 font-ruqaa text-xl leading-snug ${t.name}`}>{c.name}</p>
        </div>
      ))}
    </div>
  )
}
