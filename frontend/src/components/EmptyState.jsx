import { InboxIcon } from './Icons'

/** «Nothing here» / error panel: an icon in a soft ring, a title, a hint and an optional action. */
export default function EmptyState({ title, hint, action, icon: Icon = InboxIcon }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50">
        <Icon className="h-7 w-7" />
        <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rotate-45 bg-gold-400" aria-hidden="true" />
      </span>
      <p className="text-base font-bold text-ink">{title}</p>
      {hint && <p className="mt-1.5 max-w-md text-sm leading-6 text-muted">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
