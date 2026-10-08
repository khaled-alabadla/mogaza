import EmptyState from './EmptyState'
import LoadingState from './LoadingState'

/**
 * The loading → error → empty → content branches every list page needs.
 * `onRetry` adds a «إعادة المحاولة» button to the error state.
 */
export default function AsyncContent({ loading, loadingLabel, error, onRetry, isEmpty, empty, children }) {
  if (loading) return <LoadingState label={loadingLabel} />
  if (error) {
    return (
      <EmptyState
        title={error}
        action={
          onRetry && (
            <button type="button" className="btn btn-secondary" onClick={() => onRetry()}>
              إعادة المحاولة
            </button>
          )
        }
      />
    )
  }
  if (isEmpty) return empty
  return children
}
