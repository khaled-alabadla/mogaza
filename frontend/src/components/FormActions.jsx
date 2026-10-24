/** Cancel + submit row shared by every modal form. */
export default function FormActions({ saving, submitLabel, onCancel, className = 'pt-2' }) {
  return (
    <div className={`-mx-5 mt-2 flex flex-col-reverse gap-2 border-t border-line px-5 pt-4 ${className} sm:flex-row sm:justify-end`}>
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
        إلغاء
      </button>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
        {saving ? 'جارٍ الحفظ…' : submitLabel}
      </button>
    </div>
  )
}
