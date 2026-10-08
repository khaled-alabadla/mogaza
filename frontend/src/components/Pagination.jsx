export default function Pagination({ page, pageSize, count, onChange }) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  if (totalPages <= 1) return null
  return (
    <nav className="mt-5 flex items-center justify-center gap-3" aria-label="التنقل بين الصفحات">
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        السابق
      </button>
      <span className="text-sm text-muted">
        صفحة <span className="num">{page}</span> من <span className="num">{totalPages}</span>
      </span>
      <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        التالي
      </button>
    </nav>
  )
}
