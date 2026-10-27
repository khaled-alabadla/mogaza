import { Component } from 'react'
import { AlertIcon } from './Icons'

/**
 * Any error while showing a page: a short message and a «تحديث الصفحة» button, instead of a blank
 * screen. Give it a `resetKey` (e.g. the path) so that opening another page tries again.
 */
export default class ErrorBoundary extends Component {
  state = { failedAt: null }

  static getDerivedStateFromError() {
    return { failedAt: true }
  }

  componentDidUpdate(previous) {
    if (this.state.failedAt && previous.resetKey !== this.props.resetKey) this.setState({ failedAt: null })
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.failedAt) return this.props.children
    return (
      <div role="alert" className="card mx-auto my-10 max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-100 text-gold-700">
          <AlertIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink">تعذر عرض الصفحة</h1>
        <p className="mt-1 text-sm leading-6 text-muted">
          ربما تم تحديث الموقع للتو. حدّث الصفحة لتحميل النسخة الجديدة.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => window.location.reload()}>
          تحديث الصفحة
        </button>
      </div>
    )
  }
}
