/** One grey placeholder bar (shimmering) */
function Bar({ className }) {
  return <span className={`skeleton block rounded-md ${className}`} />
}

/**
 * While data loads: a few placeholder cards shaped like the list that is coming (calmer than a
 * spinner, and the page does not jump when the content arrives). `compact`: a small inline spinner.
 */
export default function LoadingState({ label = 'جارٍ التحميل…', compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center justify-center gap-3 py-4 text-muted" role="status" aria-live="polite">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
        <span className="text-sm">{label}</span>
      </div>
    )
  }
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-5" aria-hidden="true" style={{ opacity: 1 - i * 0.25 }}>
          <div className="flex items-center gap-3">
            <Bar className="h-4 w-40" />
            <Bar className="h-4 w-16 rounded-full" />
          </div>
          <Bar className="mt-3.5 h-3 w-3/4" />
          <Bar className="mt-2.5 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
