import { ArrowLeftIcon } from './Icons'

/** Page numbers around the current one (with «…» gaps), e.g. 1 … 4 5 6 … 12. */
function pageList(page, total) {
  const pages = new Set([1, total, page - 1, page, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

export default function Pagination({ page, pageSize, count, onChange }) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  if (totalPages <= 1) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, count)
  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="التنقل بين الصفحات">
      <p className="text-sm text-muted">
        عرض <span className="num font-semibold text-ink">{first}–{last}</span> من <span className="num font-semibold text-ink">{count}</span>
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-secondary px-3" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ArrowLeftIcon className="h-4 w-4 rotate-180" /> السابق
        </button>
        {pageList(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              aria-label={`صفحة ${p}`}
              className={`num tap hidden h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition-colors sm:inline-block ${
                p === page ? 'bg-brand-600 text-white shadow-sm' : 'text-ink hover:bg-white hover:ring-1 hover:ring-line'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className="btn btn-secondary px-3" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          التالي <ArrowLeftIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  )
}
