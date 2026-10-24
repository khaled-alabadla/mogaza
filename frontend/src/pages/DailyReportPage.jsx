import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo-320.webp'
import FormAlert from '../components/FormAlert'
import { CheckIcon, DownloadIcon, PlusIcon, PrintIcon, TrashIcon } from '../components/Icons'
import LoadingState from '../components/LoadingState'
import PageHeader from '../components/PageHeader'
import Tricolor from '../components/Tricolor'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { dailyReportApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'

const DEFAULT_SOURCES = ['اتصال هاتفي', 'الزيارة الميدانية', 'واتساب', 'فيسبوك', 'تطبيق البلدية']

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyReport = () => ({
  report_date: today(),
  rows: DEFAULT_SOURCES.map((source) => ({ source, complaints: '', inquiries: '' })),
  summons: '',
  archived: '',
})

/** '١٢' or '12' → 12; empty → 0 */
const toNumber = (value) => {
  const digits = String(value ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

const dayName = (iso) => (iso ? new Intl.DateTimeFormat('ar', { weekday: 'long' }).format(new Date(`${iso}T12:00:00`)) : '')
const shortDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/** Arabic number agreement: (n, [one, two, few (3-10), many (11+)]) */
function counted(n, [one, two, few, many]) {
  if (n === 1) return one
  if (n === 2) return two
  if (n >= 3 && n <= 10) return `${n} ${few}`
  return `${n} ${many}`
}

/** The report itself, as it is shared (image / print). */
function ReportCard({ report, cardRef }) {
  const rows = report.rows.filter((r) => r.source.trim())
  const total = rows.reduce((t, r) => ({ c: t.c + toNumber(r.complaints), i: t.i + toNumber(r.inquiries) }), { c: 0, i: 0 })
  const summons = toNumber(report.summons)
  const archived = toNumber(report.archived)

  return (
    <div ref={cardRef} className="daily-report mx-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line">
      <Tricolor className="flex h-1.5" />
      <header className="relative flex flex-wrap items-center gap-5 overflow-hidden bg-brand-800 px-6 py-5 text-white sm:px-8 sm:py-6">
        <div className="harlequin" aria-hidden="true" />
        <span className="relative rounded-xl bg-white p-2 shadow-sm">
          <img src={logo} alt="" className="h-16 w-auto" />
        </span>
        <div className="relative flex-1">
          <h2 className="text-[1.9rem] leading-tight font-bold">التقرير اليومي</h2>
          <p className="mt-1 text-sm text-white/75">قسم المعلومات والشكاوي · بلدية غزة</p>
        </div>
        <div className="relative rounded-xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/15">
          <p className="text-sm font-semibold text-gold-400">{dayName(report.report_date)}</p>
          <p className="num mt-0.5 text-2xl font-bold">{shortDate(report.report_date)}</p>
        </div>
      </header>

      <div className="px-4 py-5 sm:px-8 sm:py-6">
        <table className="w-full border-collapse overflow-hidden rounded-xl text-[1.05rem] ring-1 ring-line">
          <thead>
            <tr className="bg-canvas text-sm text-muted">
              <th className="px-5 py-3 text-start font-semibold">المصدر</th>
              <th className="w-32 px-3 py-3 text-center font-semibold sm:w-44">عدد الشكاوى</th>
              <th className="w-32 px-3 py-3 text-center font-semibold sm:w-44">عدد الاستفسارات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-5 py-2.5 font-medium text-ink">{r.source}</td>
                <td className="num px-5 py-2.5 text-center text-ink">{toNumber(r.complaints)}</td>
                <td className="num px-5 py-2.5 text-center text-ink">{toNumber(r.inquiries)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-brand-600/30 bg-brand-50 font-bold text-brand-800">
              <td className="px-5 py-3">المجموع</td>
              <td className="num px-5 py-3 text-center text-xl">{total.c}</td>
              <td className="num px-5 py-3 text-center text-xl">{total.i}</td>
            </tr>
          </tfoot>
        </table>

        {(summons > 0 || archived > 0) && (
          <div className="mt-5 grid gap-3">
            {summons > 0 && (
              <p className="rounded-xl bg-gold-100/70 px-5 py-3 text-center text-[1.05rem] font-semibold text-gold-700">
                تم استقبال{' '}
                <span className="font-bold tabular-nums">{counted(summons, ['استدعاء واحد', 'استدعاءين', 'استدعاءات', 'استدعاءً'])}</span> من خلال الزيارة
                الميدانية للمواطنين
              </p>
            )}
            {archived > 0 && (
              <p className="rounded-xl bg-brand-50 px-5 py-3 text-center text-[1.05rem] font-semibold text-brand-700">
                تم معالجة وأرشفة{' '}
                <span className="font-bold tabular-nums">{counted(archived, ['مراسلة واحدة', 'مراسلتين', 'مراسلات', 'مراسلة'])}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Inputs for one source row. */
function RowInputs({ row, index, onChange, onDelete, canDelete }) {
  const set = (key) => (e) => onChange(index, { ...row, [key]: e.target.value })
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.25rem] items-center gap-2">
      <input className="input py-2" aria-label={`المصدر ${index + 1}`} value={row.source} onChange={set('source')} placeholder="اسم المصدر" />
      <input className="input num py-2 text-center" inputMode="numeric" aria-label={`شكاوى ${row.source || index + 1}`} value={row.complaints} onChange={set('complaints')} placeholder="0" />
      <input className="input num py-2 text-center" inputMode="numeric" aria-label={`استفسارات ${row.source || index + 1}`} value={row.inquiries} onChange={set('inquiries')} placeholder="0" />
      <button type="button" className="icon-action icon-action-danger" aria-label={`حذف ${row.source || 'المصدر'}`} title="حذف" disabled={!canDelete} onClick={() => onDelete(index)}>
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/** «التقرير اليومي»: fill the day's figures, see the report as it will be shared, save it (only the latest is kept). */
export default function DailyReportPage() {
  const toast = useToast()
  const { can } = useAuth()
  const canEdit = can('report.edit')
  const cardRef = useRef(null)
  const [report, setReport] = useState(null)
  const [saved, setSaved] = useState(null) // the last saved report (text), to spot unsaved changes
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    dailyReportApi
      .get(controller.signal)
      .then(({ report: latest }) => {
        const value = latest
          ? { report_date: latest.report_date, rows: latest.rows, summons: latest.summons, archived: latest.archived }
          : emptyReport()
        setReport(value)
        setSaved(latest ? JSON.stringify(value) : null)
        setMeta(latest)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(parseApiError(err, 'تعذر تحميل التقرير.').message)
      })
    return () => controller.abort()
  }, [])

  if (!report) return error ? <FormAlert message={error} /> : <LoadingState />

  const setRow = (i, row) => setReport({ ...report, rows: report.rows.map((r, j) => (j === i ? row : r)) })
  const dirty = JSON.stringify(report) !== saved

  async function save() {
    setBusy(true)
    setError('')
    try {
      const body = {
        report_date: report.report_date,
        rows: report.rows
          .filter((r) => r.source.trim())
          .map((r) => ({ source: r.source.trim(), complaints: toNumber(r.complaints), inquiries: toNumber(r.inquiries) })),
        summons: toNumber(report.summons),
        archived: toNumber(report.archived),
      }
      const { report: latest } = await dailyReportApi.save(body)
      const value = { report_date: latest.report_date, rows: latest.rows, summons: latest.summons, archived: latest.archived }
      setReport(value)
      setSaved(JSON.stringify(value))
      setMeta(latest)
      toast.success('تم حفظ التقرير.')
    } catch (err) {
      setError(parseApiError(err, 'تعذر حفظ التقرير.').message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadImage() {
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
      const a = document.createElement('a')
      a.href = url
      a.download = `التقرير-اليومي-${report.report_date}.png`
      a.click()
    } catch {
      toast.error('تعذر إنشاء الصورة.')
    }
  }

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="التقرير اليومي" subtitle="عبّئ أرقام اليوم، وشاهد التقرير كما سيُرسل.">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <PrintIcon className="h-4 w-4" /> طباعة
          </button>
          <button type="button" className="btn btn-secondary" onClick={downloadImage}>
            <DownloadIcon className="h-4 w-4" /> تحميل كصورة
          </button>
        </PageHeader>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        {canEdit && (
          <section className="card space-y-5 p-4 sm:p-5 print:hidden" aria-label="بيانات التقرير">
            <FormAlert message={error} />
            <label className="block">
              <span className="label">تاريخ التقرير</span>
              <input type="date" className="input" value={report.report_date} onChange={(e) => setReport({ ...report, report_date: e.target.value })} />
            </label>

            <div>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.25rem] gap-2 text-xs font-medium text-muted">
                <span>المصدر</span>
                <span className="text-center">الشكاوى</span>
                <span className="text-center">الاستفسارات</span>
                <span />
              </div>
              <div className="space-y-2">
                {report.rows.map((row, i) => (
                  <RowInputs
                    key={i}
                    row={row}
                    index={i}
                    onChange={setRow}
                    canDelete={report.rows.length > 1}
                    onDelete={(j) => setReport({ ...report, rows: report.rows.filter((_, k) => k !== j) })}
                  />
                ))}
              </div>
              {report.rows.length < 20 && (
                <button
                  type="button"
                  className="mt-2 text-sm font-medium text-brand-700 hover:underline"
                  onClick={() => setReport({ ...report, rows: [...report.rows, { source: '', complaints: '', inquiries: '' }] })}
                >
                  <PlusIcon className="me-1 inline h-4 w-4" />
                  إضافة مصدر
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">الاستدعاءات (الزيارة الميدانية)</span>
                <input className="input num text-center" inputMode="numeric" value={report.summons} onChange={(e) => setReport({ ...report, summons: e.target.value })} placeholder="0" />
              </label>
              <label className="block">
                <span className="label">المراسلات المعالجة والمؤرشفة</span>
                <input className="input num text-center" inputMode="numeric" value={report.archived} onChange={(e) => setReport({ ...report, archived: e.target.value })} placeholder="0" />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-xs text-muted">
                {dirty ? (
                  <span className="font-semibold text-gold-700">● تعديلات غير محفوظة</span>
                ) : meta ? (
                  <>
                    آخر حفظ {formatDateTime(meta.updated_at)}
                    {meta.updated_by_name && ` بواسطة ${meta.updated_by_name}`}
                  </>
                ) : (
                  'لم يُحفظ أي تقرير بعد'
                )}
              </p>
              <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
                <CheckIcon className="h-4 w-4" /> حفظ التقرير
              </button>
            </div>
          </section>
        )}

        <div className={`min-w-0 xl:sticky xl:top-24 ${canEdit ? '' : 'xl:col-span-2'}`}>
          <ReportCard report={report} cardRef={cardRef} />
        </div>
      </div>
    </div>
  )
}
