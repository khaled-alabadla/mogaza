export default function LoadingState({ label = 'جارٍ التحميل…', compact = false }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 text-muted ${compact ? 'py-4' : 'py-12'}`}
      role="status"
      aria-live="polite"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
