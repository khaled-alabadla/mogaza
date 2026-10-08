/** The people behind the system: shown on the login page and in the site footer. */
export const CREDITS = [
  { role: 'تم برمجة النظام بواسطة', name: 'المهندس بلال سمير قنوع' },
  { role: 'تم جمع البيانات بواسطة', name: 'الأستاذ سليمان معين حبيب' },
  { role: 'تحت إشراف', name: 'المهندس محمد ابراهيم بهار', wide: true },
]

/** Credits as centered «role / name» blocks (login page). */
export default function Credits({ className }) {
  return (
    <div className={className}>
      {CREDITS.map((c) => (
        <p key={c.name} className={c.wide ? 'col-span-full' : undefined}>
          {c.role}
          <br />
          <span className="font-semibold">{c.name}</span>
        </p>
      ))}
    </div>
  )
}
