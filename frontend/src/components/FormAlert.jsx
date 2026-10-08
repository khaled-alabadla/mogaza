/** Form-level error banner (announced to screen readers). Renders nothing without a message. */
export default function FormAlert({ message, className = 'rounded-lg px-3 py-2' }) {
  if (!message) return null
  return (
    <div role="alert" className={`${className} border border-danger-100 bg-danger-50 text-sm text-danger-700`}>
      {message}
    </div>
  )
}
