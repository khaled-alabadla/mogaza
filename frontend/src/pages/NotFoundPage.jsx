import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '../components/Icons'

export default function NotFoundPage() {
  return (
    <div className="relative mx-auto max-w-lg overflow-hidden rounded-3xl bg-brand-800 px-6 py-14 text-center text-white shadow-lg">
      <div className="harlequin" aria-hidden="true" />
      <div className="relative">
        <p className="num text-7xl font-bold tracking-tight text-gold-400">404</p>
        <h1 className="mt-3 text-2xl font-bold">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm text-white/75">الرابط الذي طلبته غير صحيح أو تم نقله.</p>
        <Link to="/" className="btn mt-7 bg-white text-brand-800 hover:bg-gold-100">
          العودة إلى البحث <ArrowLeftIcon className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
