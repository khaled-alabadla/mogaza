import Modal from './Modal'

/** «هل أنت متأكد؟» before a deletion (or another action: `confirmLabel`). Focus starts on «إلغاء» so Enter never deletes by accident. */
export default function ConfirmDialog({
  open,
  title = 'تأكيد الحذف',
  message,
  details,
  confirmLabel = 'حذف',
  busy = false,
  onConfirm,
  onCancel,
  container,
}) {
  return (
    <Modal open={open} title={title} onClose={busy ? undefined : onCancel} size="sm" container={container}>
      <p className="text-base text-ink">{message}</p>
      {details && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm font-semibold text-ink">{details}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} data-autofocus>
          إلغاء
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'جارٍ التنفيذ…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
