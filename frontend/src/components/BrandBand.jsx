import Tricolor from './Tricolor'

/**
 * The green band in the municipality's colours (home welcome, search area): the logo's stripe on top,
 * the shield's faint diamonds and a soft light behind the content. Text inside is white.
 */
export default function BrandBand({ label, className = '', children }) {
  return (
    <section aria-label={label} className={`relative overflow-hidden rounded-2xl bg-brand-800 text-white shadow-sm ${className}`}>
      <div className="harlequin" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(15_138_71/0.45),transparent_65%)]"
        aria-hidden="true"
      />
      <Tricolor className="absolute inset-x-0 top-0 flex h-1" green="bg-brand-500" />
      <div className="relative">{children}</div>
    </section>
  )
}
