import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import LocationCard from '../components/LocationCard'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import RecordForm from '../components/RecordForm'
import { LOCATION_FIELDS, STREET_FIELDS, withNeighborhoodOptions } from '../components/recordFields'
import SearchBar from '../components/SearchBar'
import StreetCard from '../components/StreetCard'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { locationsApi, neighborhoodsApi, streetsApi } from '../services/api'
import { parseApiError } from '../utils/errors'

const PAGE_SIZE = 20

const SCOPES = {
  locations: {
    tab: 'المواقع والتقاطعات',
    api: locationsApi,
    fields: LOCATION_FIELDS,
    nameField: 'place_name',
    placeholder: 'اكتب اسم المكان أو التقاطع…',
    addLabel: 'إضافة موقع',
    addTitle: 'إضافة موقع جديد',
    editTitle: 'تعديل الموقع',
    allLabel: 'جميع المواقع',
    deletedLabel: 'المواقع المحذوفة',
    deleteMessage: 'هل أنت متأكد من حذف هذا الموقع؟',
    created: 'تمت إضافة الموقع بنجاح.',
    updated: 'تم حفظ التعديلات بنجاح.',
    deleted: 'تم حذف الموقع.',
    restored: 'تمت استعادة الموقع.',
  },
  streets: {
    tab: 'أسماء الشوارع',
    api: streetsApi,
    fields: STREET_FIELDS,
    nameField: 'common_name',
    placeholder: 'اكتب الاسم الشائع أو الرسمي للشارع…',
    addLabel: 'إضافة اسم شارع',
    addTitle: 'إضافة اسم شارع',
    editTitle: 'تعديل اسم الشارع',
    allLabel: 'جميع أسماء الشوارع',
    deletedLabel: 'أسماء الشوارع المحذوفة',
    deleteMessage: 'هل أنت متأكد من حذف اسم الشارع هذا؟',
    created: 'تمت إضافة اسم الشارع بنجاح.',
    updated: 'تم حفظ التعديلات بنجاح.',
    deleted: 'تم حذف اسم الشارع.',
    restored: 'تمت استعادة اسم الشارع.',
  },
}

export default function DashboardPage() {
  const { canEdit, isAdmin } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const scopeKey = searchParams.get('scope') === 'streets' ? 'streets' : 'locations'
  const scope = SCOPES[scopeKey]
  const query = searchParams.get('q') || ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const deletedView = isAdmin && searchParams.get('status') === 'deleted'

  const [input, setInput] = useState(query)
  const debounced = useDebouncedValue(input, 300)

  const [formState, setFormState] = useState(null) // { record | null }
  const [neighborhoods, setNeighborhoods] = useState(null)

  // Options for the «الحي» select, loaded once and only when a location form can be opened
  // (editors, locations tab, not the deleted view). If this fails the field is simply hidden.
  const needNeighborhoods = canEdit && scopeKey === 'locations' && !deletedView && neighborhoods === null
  useEffect(() => {
    if (!needNeighborhoods) return undefined
    const controller = new AbortController()
    neighborhoodsApi
      .list(undefined, controller.signal)
      .then((data) => setNeighborhoods(Array.isArray(data) ? data : data?.results || []))
      .catch(() => {})
    return () => controller.abort()
  }, [needNeighborhoods])

  const formFields = useMemo(
    () => (scopeKey === 'locations' ? withNeighborhoodOptions(scope.fields, neighborhoods) : scope.fields),
    [scopeKey, scope.fields, neighborhoods],
  )

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '' || v === undefined) next.delete(k)
      else next.set(k, String(v))
    }
    setSearchParams(next, { replace: true })
  }

  // keep the URL (?q=) in sync with the debounced input, so searches are shareable/bookmarkable
  useEffect(() => {
    if (debounced.trim() !== query) updateParams({ q: debounced.trim(), page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const params = useMemo(() => {
    const p = { page, page_size: PAGE_SIZE }
    if (query) p.search = query
    if (deletedView) p.status = 'deleted'
    return p
  }, [page, query, deletedView])

  const { data, loading, error, reload } = usePagedList(scope.api.list, params)

  async function handleSave(payload) {
    if (formState?.record) {
      await scope.api.update(formState.record.id, payload)
      toast.success(scope.updated)
    } else {
      await scope.api.create(payload)
      toast.success(scope.created)
    }
    setFormState(null)
    reload()
  }

  const deletion = useConfirmAction((record) => scope.api.remove(record.id), {
    success: scope.deleted,
    fallback: 'تعذر حذف السجل.',
    onDone: reload,
  })

  async function handleRestore(record) {
    try {
      await scope.api.restore(record.id)
      toast.success(scope.restored)
      reload()
    } catch (err) {
      toast.error(parseApiError(err, 'تعذرت الاستعادة.').message)
    }
  }

  const heading = deletedView ? scope.deletedLabel : query ? 'نتائج البحث' : scope.allLabel
  const Card = scopeKey === 'streets' ? StreetCard : LocationCard
  const openAdd = () => setFormState({ record: null })
  const addButton = canEdit && !deletedView && <AddButton onClick={openAdd}>{scope.addLabel}</AddButton>

  return (
    <div>
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">ابحث عن اسم مكان أو تقاطع</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">يمكنك كتابة جزء من الاسم أو الوصف أو رقم المبنى أو الشارع</p>
        <div className="mt-5">
          <SearchBar value={input} onChange={setInput} placeholder={scope.placeholder} />
        </div>
        <div className="mt-3 inline-flex rounded-xl border border-line bg-white p-1" role="tablist" aria-label="نوع البحث">
          {Object.entries(SCOPES).map(([key, s]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scopeKey === key}
              onClick={() => updateParams({ scope: key === 'locations' ? null : key, page: null })}
              className={`tap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                scopeKey === key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {s.tab}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {/* Only the heading + count is announced when results change (not every card). */}
          <h2 className="text-lg font-bold text-ink" aria-live="polite">
            {heading}
            {/* kept in place (hidden) while loading so the heading doesn't jump */}
            <span
              className={`badge ms-2 bg-brand-50 align-middle text-sm text-brand-700 ${loading || error ? 'invisible' : ''}`}
            >
              <span className="num">{data.count}</span>
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <label className="tap flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={deletedView}
                  onChange={(e) => updateParams({ status: e.target.checked ? 'deleted' : null, page: null })}
                />
                عرض المحذوفة
              </label>
            )}
            {addButton}
          </div>
        </div>

        <AsyncContent
          loading={loading}
          loadingLabel="جارٍ البحث…"
          error={error}
          onRetry={reload}
          isEmpty={data.results.length === 0}
          empty={
            <EmptyState
              title={query ? `لا توجد نتائج مطابقة لـ «${query}»` : 'لا توجد سجلات'}
              hint={query ? 'جرّب كتابة جزء أقصر من الاسم أو كلمة مختلفة.' : undefined}
              action={addButton || null}
            />
          }
        >
          <div className="space-y-3">
            {data.results.map((record) => (
              <Card
                key={record.id}
                location={record}
                street={record}
                canEdit={canEdit}
                canRestore={isAdmin}
                deletedView={deletedView}
                onEdit={(r) => setFormState({ record: r })}
                onDelete={deletion.ask}
                onRestore={handleRestore}
              />
            ))}
          </div>
        </AsyncContent>

        {/* usePagedList empties the list while loading / on error, so this renders nothing then */}
        <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={(p) => updateParams({ page: p })} />
      </section>

      <Modal
        open={Boolean(formState)}
        title={formState?.record ? scope.editTitle : scope.addTitle}
        onClose={() => setFormState(null)}
      >
        {formState && (
          <RecordForm
            key={formState.record?.id ?? 'new'}
            fields={formFields}
            initial={formState.record}
            submitLabel={formState.record ? 'حفظ التعديلات' : scope.addLabel}
            onSubmit={handleSave}
            onCancel={() => setFormState(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message={scope.deleteMessage}
        details={deletion.target?.[scope.nameField]}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
