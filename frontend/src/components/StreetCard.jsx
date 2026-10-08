import { RecordCardActions } from './ActionButtons'

export default function StreetCard({ street, ...actions }) {
  return (
    <article className="card p-4 sm:p-5" aria-label={street.common_name}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">الاسم الشائع</dt>
          <dd className="text-lg font-bold text-ink">{street.common_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">الاسم الرسمي</dt>
          <dd className="text-lg font-semibold text-brand-700">{street.official_name}</dd>
        </div>
      </dl>
      <RecordCardActions record={street} {...actions} />
    </article>
  )
}
