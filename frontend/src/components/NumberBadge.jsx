/** A boxed number with its label (building / street number) on the location and street cards. */
export default function NumberBadge({ label, value }) {
  return (
    <div className="flex min-w-[6.5rem] flex-col rounded-lg border border-line bg-canvas px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="num text-lg font-bold text-ink">{value || '—'}</span>
    </div>
  )
}
