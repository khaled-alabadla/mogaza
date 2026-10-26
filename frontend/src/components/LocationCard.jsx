import { RecordCardActions } from './ActionButtons'
import { MapIcon, PinIcon } from './Icons'
import NumberBadge from './NumberBadge'

export default function LocationCard({ location, ...actions }) {
  return (
    <article
      className="card card-lift group relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
      aria-label={location.place_name}
    >
      {/* a brand edge that lights up on hover */}
      <span className="absolute inset-y-4 start-0 w-1 rounded-e-full bg-brand-600 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="text-lg leading-snug font-bold text-ink">{location.place_name}</h3>
          {location.neighborhood_name && (
            <span className="badge bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-100">
              <MapIcon className="h-3.5 w-3.5" />
              <span className="sr-only">الحي: </span>
              {location.neighborhood_name}
            </span>
          )}
        </div>
        {location.description && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[0.95rem] leading-7 text-muted">
            <PinIcon className="mt-1 h-4 w-4 shrink-0 text-danger-600/80" />
            <span>{location.description}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex gap-2">
          <NumberBadge label="رقم المبنى" value={location.building_number} />
          <NumberBadge label="رقم الشارع" value={location.street_number} />
        </div>
        <div className="ms-auto sm:ms-0">
          <RecordCardActions record={location} {...actions} />
        </div>
      </div>
    </article>
  )
}
