import { Link } from 'react-router-dom'
import logo from '../assets/logo-88.webp'
import { CREDITS } from './Credits'
import { useNavLinks } from './navLinks'
import Tricolor from './Tricolor'

export default function Footer() {
  const links = useNavLinks()

  return (
    <footer className="mt-auto bg-brand-800 text-white/75 print:hidden">
      <Tricolor green="bg-brand-500" />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1.4fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-white p-1.5">
              <img src={logo} alt="" className="h-10 w-auto" width="22" height="40" decoding="async" />
            </span>
            <span className="leading-tight">
              <span className="block font-bold text-white">قسم المعلومات والشكاوي</span>
              <span className="block text-sm">بلدية غزة</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            قاعدة بيانات المواقع والتقاطعات وجدول توزيع المياه لخدمة المواطنين.
          </p>
        </div>

        {links.length > 0 && (
          <nav aria-label="روابط سريعة">
            <h2 className="mb-3 text-sm font-bold text-white">روابط سريعة</h2>
            <ul className="space-y-2 text-sm">
              {links.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="inline-block py-0.5 transition-colors hover:text-white hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="sm:col-span-2 lg:col-span-1">
          <h2 className="mb-3 text-sm font-bold text-white">فريق العمل</h2>
          <dl className="space-y-2.5 text-sm">
            {CREDITS.map((c) => (
              <div key={c.name}>
                <dt className="text-xs text-white/70">{c.role}</dt>
                <dd className="font-semibold text-white">{c.name}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-white/70">
          © <span className="num">{new Date().getFullYear()}</span> بلدية غزة — جميع الحقوق محفوظة
        </p>
      </div>
    </footer>
  )
}
