import { useMemo, useState } from 'react'
import AsyncContent from '../components/AsyncContent'
import EmptyState from '../components/EmptyState'
import { DownloadIcon, EditIcon, ListIcon, LockIcon, LogoutIcon, PlusIcon, RestoreIcon, TrashIcon, UserIcon } from '../components/Icons'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import SearchInput from '../components/SearchInput'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { auditApi } from '../services/api'
import { formatDateTime } from '../utils/format'
import { useText } from '../context/ContentContext'

const PAGE_SIZE = 25

// tone: the label pill; dot: the timeline marker
const ACTIONS = {
  CREATE: { label: 'إضافة', tone: 'bg-brand-50 text-brand-700', dot: 'bg-brand-600 text-white', icon: PlusIcon },
  UPDATE: { label: 'تعديل', tone: 'bg-gold-100 text-gold-700', dot: 'bg-gold-400 text-ink', icon: EditIcon },
  DELETE: { label: 'حذف', tone: 'bg-danger-50 text-danger-700', dot: 'bg-danger-600 text-white', icon: TrashIcon },
  RESTORE: { label: 'استعادة', tone: 'bg-brand-50 text-brand-700', dot: 'bg-brand-100 text-brand-700', icon: RestoreIcon },
  LOGIN: { label: 'تسجيل دخول', tone: 'bg-gray-100 text-muted', dot: 'bg-gray-100 text-muted', icon: UserIcon },
  LOGIN_FAILED: { label: 'دخول فاشل', tone: 'bg-danger-50 text-danger-700', dot: 'bg-danger-50 text-danger-700', icon: LockIcon },
  LOGOUT: { label: 'تسجيل خروج', tone: 'bg-gray-100 text-muted', dot: 'bg-gray-100 text-muted', icon: LogoutIcon },
  IMPORT: { label: 'استيراد', tone: 'bg-gray-100 text-muted', dot: 'bg-gray-100 text-muted', icon: DownloadIcon },
}
const OTHER_ACTION = { tone: 'bg-gray-100 text-muted', dot: 'bg-gray-100 text-muted', icon: ListIcon }

const ENTITY_LABELS = {
  location: 'موقع',
  streetname: 'اسم شارع',
  user: 'مستخدم',
  complaint: 'شكوى / استفسار',
  urgentcomplaint: 'شكوى عاجلة',
  dailyreport: 'التقرير اليومي',
  sitecontent: 'محتوى الموقع',
  watertable: 'جدول المياه',
  waterzone: 'منطقة مياه',
  waterslot: 'موعد مياه',
}

const FIELD_LABELS = {
  place_name: 'اسم المكان',
  description: 'الوصف',
  building_number: 'رقم المبنى',
  street_number: 'رقم الشارع',
  common_name: 'الاسم الشائع',
  official_name: 'الاسم الرسمي',
  is_active: 'نشط',
  username: 'اسم المستخدم',
  email: 'البريد',
  first_name: 'الاسم الأول',
  last_name: 'اسم العائلة',
  role: 'الدور',
  password_reset: 'إعادة تعيين كلمة المرور',
  permissions: 'الصلاحيات',
  kind: 'النوع',
  name: 'الاسم',
  national_id: 'رقم الهوية',
  phone: 'رقم الجوال',
  category: 'نوع الشكوى / الاستفسار',
  channel: 'المصدر',
  area: 'الحي',
  point: 'رقم النقطة',
  address: 'العنوان',
  details: 'التفاصيل',
  hide_identity: 'إخفاء بيانات صاحب الشكوى',
  status: 'الحالة',
  note: 'ملاحظة',
  number: 'رقم الشكوى',
  notes: 'ملاحظات',
  submitted_on: 'تاريخ التقديم',
}

function show(value) {
  if (value === true) return 'نعم'
  if (value === false) return 'لا'
  if (value === '' || value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length ? value.map((v) => (typeof v === 'object' ? v.name ?? JSON.stringify(v) : v)).join('، ') : '—'
  return String(value)
}

function Changes({ before, after }) {
  if (!before && !after) return null
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
  const rows = keys
    .filter((k) => FIELD_LABELS[k])
    .filter((k) => !before || !after || show(before[k]) !== show(after[k]))
  if (!rows.length) return null
  return (
    <dl className="mt-2.5 grid gap-1 rounded-lg bg-canvas p-3 text-sm ring-1 ring-line ring-inset">
      {rows.map((k) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <dt className="text-muted">{FIELD_LABELS[k]}:</dt>
          <dd className="text-ink">
            {before && after ? (
              <>
                <span className="text-danger-700 line-through decoration-1">{show(before[k])}</span>
                {' ← '}
                <span className="font-semibold text-brand-700">{show(after[k])}</span>
              </>
            ) : (
              show((after || before)[k])
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function AuditLogsPage() {
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedUser = useDebouncedValue(userFilter)
  const pageSubtitle = useText('audit.subtitle')

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      action: action || undefined,
      entity_type: entityType || undefined,
      user: debouncedUser.trim() || undefined,
    }),
    [page, action, entityType, debouncedUser],
  )
  const { data, loading, error } = usePagedList(auditApi.list, params)

  const resetPage = (fn) => (e) => {
    fn(e.target.value)
    setPage(1)
  }

  return (
    <div>
      <PageHeader title="سجل العمليات" subtitle={pageSubtitle} />


      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <select className="input" value={action} onChange={resetPage(setAction)} aria-label="نوع العملية">
          <option value="">كل العمليات</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input" value={entityType} onChange={resetPage(setEntityType)} aria-label="نوع السجل">
          <option value="">كل السجلات</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <SearchInput
          label="اسم المستخدم"
          placeholder="اسم المستخدم…"
          value={userFilter}
          onChange={resetPage(setUserFilter)}
        />
      </div>

      <AsyncContent
        loading={loading}
        error={error}
        isEmpty={data.results.length === 0}
        empty={<EmptyState title="لا توجد عمليات مسجلة" />}
      >
        <ol className="card divide-y divide-line">
          {data.results.map((log) => {
            const a = ACTIONS[log.action] || { ...OTHER_ACTION, label: log.action_display }
            const Icon = a.icon
            return (
              <li key={log.id} className="flex gap-3.5 px-4 py-3.5 sm:px-5">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.dot}`} aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="num font-bold text-ink">{log.username || '—'}</span>
                      <span className={`badge ${a.tone}`}>{a.label}</span>
                      {log.entity_type && <span className="text-muted">{ENTITY_LABELS[log.entity_type] || log.entity_type}</span>}
                      {log.entity_repr && <span className="font-semibold text-ink">{log.entity_repr}</span>}
                    </p>
                    <p className="flex shrink-0 gap-3 text-xs text-muted">
                      <time className="tabular-nums" dateTime={log.timestamp}>
                        {formatDateTime(log.timestamp)}
                      </time>
                      {log.ip_address && <span className="num hidden sm:inline">IP {log.ip_address}</span>}
                    </p>
                  </div>
                  <Changes before={log.before_data} after={log.after_data} />
                </div>
              </li>
            )
          })}
        </ol>
      </AsyncContent>
      <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />
    </div>
  )
}
