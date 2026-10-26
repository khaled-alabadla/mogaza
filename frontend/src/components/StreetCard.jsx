import { RecordCardActions } from './ActionButtons'
import { ArrowLeftIcon } from './Icons'
import NumberBadge from './NumberBadge'

/** A common street name → its official name, with the street number. */
export default function StreetCard({ street, ...actions }) {
  return (
    <article
      className="card card-lift group relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
      aria-label={street.common_name}
    >
      <span className="absolute inset-y-4 start-0 w-1 rounded-e-full bg-brand-600 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      <dl className="grid min-w-0 flex-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <dt className="text-xs text-muted">الاسم الشائع</dt>
          <dd className="text-lg font-bold text-ink">{street.common_name}</dd>
        </div>
        <ArrowLeftIcon className="hidden h-5 w-5 text-gold-400 sm:block" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted">الاسم الرسمي</dt>
          <dd className="text-lg font-semibold text-brand-700">{street.official_name}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-3 sm:gap-4">
        {/* same box as the street number on the location cards */}
        <NumberBadge label="رقم الشارع" value={street.street_number} />
        <div className="ms-auto sm:ms-0">
          <RecordCardActions record={street} {...actions} />
        </div>
      </div>
    </article>
  )
}
