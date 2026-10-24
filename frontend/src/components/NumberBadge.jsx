/** A boxed number with its label (building / street number) on the location and street cards. */
export default function NumberBadge({ label, value }) {
  return (
    <div className="flex min-w-[6.5rem] flex-col rounded-lg bg-canvas px-3 py-2 ring-1 ring-line ring-inset">
      <span className="text-[0.7rem] font-medium text-muted">{label}</span>
      <span className={`num text-lg font-bold ${value ? 'text-ink' : 'text-gray-300'}`}>{value || '—'}</span>
    </div>
  )
}
