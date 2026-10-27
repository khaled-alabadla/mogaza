import { CloseIcon, SearchIcon } from './Icons'

/** The big search field of the search page (focused on arrival; the label is its placeholder). */
export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <form role="search" onSubmit={(e) => e.preventDefault()} className="w-full">
      <label htmlFor="search-input" className="sr-only">
        {placeholder}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-muted">
          <SearchIcon className="h-6 w-6" />
        </span>
        <input
          id="search-input"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-xl border border-line bg-white py-3.5 pr-13 pl-12 text-lg text-ink shadow-sm placeholder:text-gray-500 hover:border-gray-300 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/30 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute inset-y-0 left-0 flex w-12 items-center justify-center rounded-l-2xl text-muted transition-colors hover:text-ink"
            aria-label="مسح البحث"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </form>
  )
}
