/**
 * Cancel + submit row shared by every form: in a modal it is pinned to the bottom of the (same-size) form
 * window; on a page of its own (`pinned={false}`) it simply comes after the last field.
 */
export default function FormActions({ saving, submitLabel, onCancel, pinned = true }) {
  const place = pinned ? 'sticky bottom-0 z-10 -mx-5 mt-auto bg-white px-5 py-4' : 'pt-4'
  return (
    <div className={`flex flex-col-reverse gap-2 border-t border-line sm:flex-row sm:justify-end ${place}`}>
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
