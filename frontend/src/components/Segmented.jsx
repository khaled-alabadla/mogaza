/**
 * Tabs that switch a view (locations / streets, water source, upload status): a soft track with the
 * active option raised on it. `options` is [{ value, label, badge? }]; `tone="dark"` is for use on the
 * green search banner.
 */
export default function Segmented({ options, value, onChange, label, tone = 'light', className = '' }) {
  const dark = tone === 'dark'
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1 ${dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-gray-100/80 ring-1 ring-line'} ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`tap flex shrink-0 items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-all ${
              active
                ? dark
                  ? 'bg-white text-brand-800 shadow-sm'
                  : 'bg-white text-brand-700 shadow-sm ring-1 ring-black/5'
                : dark
                  ? 'text-white/75 hover:text-white'
                  : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
            {o.badge > 0 && (
              <span className={`num min-w-5 rounded-full px-1.5 text-center text-xs leading-5 ${active ? 'bg-gold-400 text-ink' : 'bg-gold-100 text-gold-700'}`}>
                {o.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
