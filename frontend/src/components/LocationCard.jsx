import { RecordCardActions } from './ActionButtons'
import { MapIcon, PinIcon } from './Icons'

function NumberBadge({ label, value }) {
  return (
    <div className="flex min-w-[6.5rem] flex-col rounded-lg border border-line bg-canvas px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="num text-lg font-bold text-ink">{value || '—'}</span>
    </div>
  )
}

export default function LocationCard({ location, ...actions }) {
  return (
    <article className="card p-4 sm:p-5" aria-label={location.place_name}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-snug text-ink">{location.place_name}</h3>
          {location.neighborhood_name && (
            <span className="badge mt-1.5 bg-brand-50 font-medium text-brand-700">
              <MapIcon className="h-3.5 w-3.5" />
              <span className="sr-only">الحي: </span>
              {location.neighborhood_name}
            </span>
          )}
          {location.description && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[0.95rem] text-muted">
              <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>{location.description}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <NumberBadge label="رقم المبنى" value={location.building_number} />
          <NumberBadge label="رقم الشارع" value={location.street_number} />
        </div>
      </div>

      <RecordCardActions record={location} {...actions} />
    </article>
  )
}
