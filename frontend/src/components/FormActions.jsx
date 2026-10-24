/** Cancel + submit row shared by every modal form: pinned to the bottom of the (same-size) form window. */
export default function FormActions({ saving, submitLabel, onCancel }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-col-reverse gap-2 border-t border-line bg-white px-5 py-4 sm:flex-row sm:justify-end">
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
