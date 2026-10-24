import { useText } from '../context/ContentContext'

/** The people behind the system (editable from the developer dashboard): login page and site footer. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCredits() {
  return [
    { role: useText('credits.1.role'), name: useText('credits.1.name') },
    { role: useText('credits.2.role'), name: useText('credits.2.name') },
    { role: useText('credits.3.role'), name: useText('credits.3.name'), wide: true },
  ].filter((c) => c.name)
}

/** Credits as centered «role / name» blocks (login page). */
export default function Credits({ className }) {
  const credits = useCredits()
  return (
    <div className={className}>
      {credits.map((c) => (
        <p key={c.name} className={c.wide ? 'col-span-full' : undefined}>
          {c.role}
          <br />
          <span className="font-semibold">{c.name}</span>
        </p>
      ))}
    </div>
  )
}
