/** The green / gold / red stripe taken from the municipality logo. */
export default function Tricolor({ className = 'flex h-1', green = 'bg-brand-600' }) {
  return (
    <div className={className} aria-hidden="true">
      <span className={`flex-1 ${green}`} />
      <span className="flex-1 bg-gold-400" />
      <span className="flex-1 bg-danger-600" />
    </div>
  )
}
