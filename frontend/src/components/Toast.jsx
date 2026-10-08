import { CloseIcon } from './Icons'

export default function Toast({ message, type, onClose }) {
  const tone =
    type === 'error' ? 'border-danger-100 bg-danger-50 text-danger-700' : 'border-brand-100 bg-brand-50 text-brand-800'
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border py-2 ps-4 pe-2 text-sm font-medium shadow-lg ${tone}`}
    >
      <span className="flex-1 py-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="icon-btn h-8 w-8 text-current hover:bg-black/5 hover:text-current"
        aria-label="إغلاق"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
