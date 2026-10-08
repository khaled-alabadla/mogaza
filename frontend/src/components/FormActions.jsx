/** Cancel + submit row shared by every modal form. */
export default function FormActions({ saving, submitLabel, onCancel, className = 'pt-2' }) {
  return (
    <div className={`flex flex-col-reverse gap-2 ${className} sm:flex-row sm:justify-end`}>
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
        إلغاء
      </button>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'جارٍ الحفظ…' : submitLabel}
      </button>
    </div>
  )
}
