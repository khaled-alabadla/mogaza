import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import logo from '../assets/logo-320.webp'
import { PrintIcon } from '../components/Icons'
import LoadingState from '../components/LoadingState'
import { complaintFields } from '../components/recordFields'
import { complaintsApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import { filterParams, KINDS, UPLOAD_TABS } from './complaintKinds'

const PAGE_SIZE = 100 // the API's maximum
const LTR_FIELDS = new Set(['national_id', 'phone', 'point', 'building_number', 'street_number', 'subscription'])

// Printed as an A4 landscape document: the table header repeats on every page, a row is never split,
// and the pages are numbered where the browser supports page-margin boxes.
const PRINT_CSS = `
@page {
  size: A4 landscape;
  margin: 12mm 10mm 14mm;
  @bottom-left { content: counter(page) " / " counter(pages); font-size: 9pt; color: #555; }
}
.report-table thead { display: table-header-group; }
.report-table tfoot { display: table-footer-group; }
.report-table tr, .report-head { break-inside: avoid; page-break-inside: avoid; }
@media print {
  html, body { background: #fff !important; }
  .report-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
  .report-table { font-size: 8.5pt; }
  .report-table th { background: #e9efec !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

/** The report's columns: serial, every field of the kind's form, then status and date. */
function reportColumns(kind) {
  const fields = complaintFields(kind).map((f) => ({
    key: f.name,
    label: f.name === 'hide_identity' ? 'إخفاء الهوية' : f.label,
    wide: f.name === 'details',
    ltr: LTR_FIELDS.has(f.name),
    value: (c) => {
      if (f.type === 'checkbox') return c[f.name] ? 'نعم' : ''
      if (f.type === 'select') return c[`${f.name}_display`] || c[f.name] || ''
      return c[f.name] || ''
    },
  }))
  return [
    ...fields,
    { key: 'status', label: 'الحالة', value: (c) => c.status_display || '' },
    { key: 'created_at', label: 'تاريخ التسجيل', value: (c) => formatDateTime(c.created_at) },
  ]
}

/** Every record matching the filters (the API pages by at most 100). */
async function fetchAll(params, signal, onProgress) {
  const all = []
  for (let page = 1; ; page += 1) {
    const data = await complaintsApi.list({ ...params, page, page_size: PAGE_SIZE }, signal)
    all.push(...(data.results || []))
    onProgress(all.length, data.count)
    if (!data.next || !data.results?.length || all.length >= data.count) return all
  }
}

/**
 * «تصدير PDF»: a formal printable report of a log («سجل الشكاوى» / «سجل الاستفسارات»), with the
 * list's filters from the query string (?upload=&search=). Rendered without the app shell; the print
 * dialog opens by itself once every record is loaded («حفظ كـ PDF» from there).
 */
export default function ComplaintsReportPage({ kind }) {
  const k = KINDS[kind]
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const upload = searchParams.get('upload') || ''
  const search = (searchParams.get('search') || '').trim()
  const params = useMemo(() => filterParams(kind, upload, search), [kind, upload, search])
  const columns = useMemo(() => reportColumns(kind), [kind])
  const [records, setRecords] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [printedAt] = useState(() => new Date())
  const autoPrinted = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setRecords(null)
    setError('')
    fetchAll(params, controller.signal, (loaded, count) => setProgress({ loaded, count }))
      .then(setRecords)
      .catch((err) => {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return
        setError(parseApiError(err, 'تعذر تحميل بيانات التقرير.').message)
      })
    return () => controller.abort()
  }, [params, attempt])

  // the browser suggests the document title as the PDF's file name
  useEffect(() => {
    const previous = document.title
    document.title = `${k.reportTitle} - ${printedAt.toISOString().slice(0, 10)}`
    return () => {
      document.title = previous
    }
  }, [k.reportTitle, printedAt])

  useEffect(() => {
    if (!records || autoPrinted.current) return undefined
    autoPrinted.current = true
    const timer = setTimeout(() => window.print(), 400) // let the logo and fonts paint first
    return () => clearTimeout(timer)
  }, [records])

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate(k.path)
  }, [navigate, k.path])

  const uploadLabel = UPLOAD_TABS.find((t) => t.value === upload)?.label || 'الكل'
  const filterText = [`حالة الرفع: ${uploadLabel}`, search && `عبارة البحث: «${search}»`].filter(Boolean).join(' — ')

  return (
    <div dir="rtl" className="min-h-screen bg-canvas text-ink print:min-h-0 print:bg-white">
      <style>{PRINT_CSS}</style>

      <div className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[297mm] flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm font-semibold text-ink">
            {k.reportTitle}
            {records && (
              <span className="ms-2 text-muted">
                (<span className="num">{records.length}</span> سجل)
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!records}>
              <PrintIcon className="h-4 w-4" /> طباعة / حفظ PDF
            </button>
            <button type="button" className="btn btn-secondary" onClick={goBack}>
              رجوع
            </button>
          </div>
        </div>
      </div>

      <div className="report-sheet mx-auto my-6 max-w-[297mm] rounded-lg border border-line bg-white p-8 shadow-sm">
        <header className="report-head flex items-center justify-between gap-6 border-b-2 border-brand-700 pb-4">
          <div className="flex items-center gap-4">
            <img src={logo} alt="شعار بلدية غزة" className="h-20 w-20 object-contain" />
            <div>
              <p className="text-xl font-bold text-ink">بلدية غزة</p>
              <p className="text-sm font-semibold text-muted">قسم المعلومات والشكاوي</p>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-brand-700">{k.reportTitle}</h1>
            <p className="mt-1 text-sm text-muted">{filterText}</p>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted">تاريخ الطباعة:</dt>
              <dd className="font-medium">{formatDateTime(printedAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">عدد السجلات:</dt>
              <dd className="num font-bold">{records ? records.length : '—'}</dd>
            </div>
          </dl>
        </header>

        {error ? (
          <div className="py-12 text-center" role="alert">
            <p className="font-semibold text-danger-700">{error}</p>
            <button type="button" className="btn btn-secondary mt-4 print:hidden" onClick={() => setAttempt((a) => a + 1)}>
              إعادة المحاولة
            </button>
          </div>
        ) : !records ? (
          <LoadingState
            label={
              progress?.count ? `جارٍ تجهيز التقرير… (${progress.loaded} من ${progress.count})` : 'جارٍ تجهيز التقرير…'
            }
          />
        ) : !records.length ? (
          <p className="py-12 text-center font-semibold text-muted">لا توجد سجلات مطابقة لهذه التصفية.</p>
        ) : (
          <table className="report-table mt-5 w-full border-collapse text-xs leading-relaxed">
            <thead>
              <tr>
                <th className="w-8 border border-gray-400 bg-[#e9efec] px-1.5 py-2 text-center font-bold">م</th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`border border-gray-400 bg-[#e9efec] px-1.5 py-2 text-center font-bold ${col.wide ? 'w-[28%]' : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((c, i) => (
                <tr key={c.id} className="even:bg-gray-50">
                  <td className="num border border-gray-400 px-1.5 py-1.5 text-center align-top">{i + 1}</td>
                  {columns.map((col) => {
                    const value = col.value(c)
                    return (
                      <td
                        key={col.key}
                        className={`border border-gray-400 px-1.5 py-1.5 align-top break-words ${
                          col.wide ? 'whitespace-pre-line text-start' : 'text-center'
                        }`}
                      >
                        {value && col.ltr ? <span className="num">{value}</span> : value}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="report-head mt-6 border-t border-line pt-3 text-center text-xs text-muted">
          تم إنشاء التقرير من نظام قسم المعلومات والشكاوي
        </footer>
      </div>
    </div>
  )
}
