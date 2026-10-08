/** Label + control + field error. `children` is the control (and an optional hint below it). */
export default function Field({ id, label, error, className, children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

/** Class for a text control that turns red when its field has an error. */
export function controlClass(error, base = 'input') {
  return error ? `${base} border-danger-600` : base
}
