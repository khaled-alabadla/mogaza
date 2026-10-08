import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <p className="num text-4xl font-bold text-brand-600">404</p>
      <h1 className="mt-2 text-xl font-bold text-ink">الصفحة غير موجودة</h1>
      <p className="mt-1 text-sm text-muted">الرابط الذي طلبته غير صحيح أو تم نقله.</p>
      <Link to="/" className="btn btn-primary mt-5">
        العودة إلى البحث
      </Link>
    </div>
  )
}
