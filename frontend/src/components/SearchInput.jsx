import { SearchIcon } from './Icons'

/** Compact search field with a magnifier (water table, users, audit log filters). */
export default function SearchInput({ label, className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted">
        <SearchIcon className="h-5 w-5" />
      </span>
      <input type="search" className="input pr-11" aria-label={label} enterKeyHint="search" {...props} />
    </div>
  )
}
