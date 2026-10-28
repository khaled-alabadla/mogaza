import { useState } from 'react'
import { displayName } from '../utils/format'

/**
 * A user's round picture, or the first letter of their name on green when they have none (or it
 * can't load). `className` sets the size (and the letter's size).
 */
export default function Avatar({ user, className = 'h-9 w-9 text-base' }) {
  const [broken, setBroken] = useState(null) // the URL that failed to load
  const letter = displayName(user || {}).trim().charAt(0) || '؟'
  if (user?.avatar && broken !== user.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        className={`shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white ${className}`}
        onError={() => setBroken(user.avatar)}
      />
    )
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white shadow-sm ring-2 ring-white ${className}`}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}
