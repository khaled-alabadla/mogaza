import { useMemo, useState } from 'react'
import AsyncContent from '../components/AsyncContent'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import SearchInput from '../components/SearchInput'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { auditApi } from '../services/api'
import { formatDateTime } from '../utils/format'

const PAGE_SIZE = 25

const ACTIONS = {
  CREATE: { label: 'إضافة', tone: 'bg-brand-50 text-brand-700' },
  UPDATE: { label: 'تعديل', tone: 'bg-gold-100 text-gold-700' },
  DELETE: { label: 'حذف', tone: 'bg-danger-50 text-danger-700' },
  RESTORE: { label: 'استعادة', tone: 'bg-brand-50 text-brand-700' },
  LOGIN: { label: 'تسجيل دخول', tone: 'bg-gray-100 text-muted' },
  LOGIN_FAILED: { label: 'دخول فاشل', tone: 'bg-danger-50 text-danger-700' },
  LOGOUT: { label: 'تسجيل خروج', tone: 'bg-gray-100 text-muted' },
  IMPORT: { label: 'استيراد', tone: 'bg-gray-100 text-muted' },
}

const ENTITY_LABELS = { location: 'موقع', streetname: 'اسم شارع', user: 'مستخدم' }

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
}

function show(value) {
  if (value === true) return 'نعم'
  if (value === false) return 'لا'
  if (value === '' || value === null || value === undefined) return '—'
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
    <dl className="mt-2 grid gap-1 rounded-lg bg-canvas p-3 text-sm">
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
      <PageHeader title="سجل العمليات" subtitle="من قام بالتعديل، وماذا تغيّر، ومتى." />

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
        <ol className="space-y-3">
          {data.results.map((log) => {
            const a = ACTIONS[log.action] || { label: log.action_display, tone: 'bg-gray-100 text-muted' }
            return (
              <li key={log.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`badge ${a.tone}`}>{a.label}</span>
                  {log.entity_type && <span className="text-xs text-muted">{ENTITY_LABELS[log.entity_type] || log.entity_type}</span>}
                  {log.entity_repr && <span className="font-semibold text-ink">{log.entity_repr}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
                  <span>
                    المستخدم: <span className="num font-medium text-ink">{log.username || '—'}</span>
                  </span>
                  <span>
                    الوقت: <span className="tabular-nums">{formatDateTime(log.timestamp)}</span>
                  </span>
                  {log.ip_address && <span className="num">IP {log.ip_address}</span>}
                </div>
                <Changes before={log.before_data} after={log.after_data} />
              </li>
            )
          })}
        </ol>
      </AsyncContent>
      <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />
    </div>
  )
}
