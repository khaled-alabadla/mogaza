export default function EmptyState({ title, hint, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1.5 max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
