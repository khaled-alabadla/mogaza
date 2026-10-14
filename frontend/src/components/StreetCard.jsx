import { RecordCardActions } from './ActionButtons'
import NumberBadge from './NumberBadge'

export default function StreetCard({ street, ...actions }) {
  return (
    <article className="card p-4 sm:p-5" aria-label={street.common_name}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">الاسم الشائع</dt>
            <dd className="text-lg font-bold text-ink">{street.common_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">الاسم الرسمي</dt>
            <dd className="text-lg font-semibold text-brand-700">{street.official_name}</dd>
          </div>
        </dl>
        {/* same box as the street number on the location cards */}
        <div className="flex gap-2">
          <NumberBadge label="رقم الشارع" value={street.street_number} />
        </div>
      </div>
      <RecordCardActions record={street} {...actions} />
    </article>
  )
}
