import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AsyncContent from '../components/AsyncContent'
import PageHeader from '../components/PageHeader'
import RecordForm from '../components/RecordForm'
import { asOptions, COMPLAINT_FIELDS } from '../components/recordFields'
import { useToast } from '../context/ToastContext'
import options from '../data/complaintOptions.json'
import { complaintsApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { KINDS } from './complaintKinds'

const k = KINDS.complaint
const NEW_COMPLAINT = {}

/** «إضافة شكوى» / «تعديل الشكوى»: the form has its own page; once saved, «الشكاوى» lists the complaint. */
export default function ComplaintFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [record, setRecord] = useState(id ? null : NEW_COMPLAINT)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!id) return undefined
    const controller = new AbortController()
    complaintsApi
      .get(id, controller.signal)
      .then(setRecord)
      .catch((err) => {
        if (!controller.signal.aborted) setError(parseApiError(err, 'تعذر تحميل الشكوى.').message)
      })
    return () => controller.abort()
  }, [id, attempt])

  const fields = useMemo(
    () =>
      COMPLAINT_FIELDS.map((f) => {
        // an older complaint may lack a required field: it can still be edited, only what it has can't be emptied
        const required = f.required && (!id || Boolean(record?.[f.name]))
        if (f.name === 'category') {
          // as on the main system: a type with a ready text writes it into «التفاصيل»
          return { ...f, required, options: asOptions(options.categories, record?.category), fills: { field: 'details', texts: options.bodies } }
        }
        if (f.name === 'area') return { ...f, options: asOptions(options.areas, record?.area) }
        return { ...f, required }
      }),
    [id, record],
  )

  async function save(payload) {
    if (id) {
      await complaintsApi.update(id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      await complaintsApi.create({ ...payload, kind: 'complaint' })
      toast.success(k.created)
    }
    navigate(k.path)
  }

  return (
    <div>
      <PageHeader title={id ? k.editTitle : k.addTitle}>
        <Link className="btn btn-secondary" to={k.path}>
          عرض الشكاوى
        </Link>
      </PageHeader>
      <AsyncContent
        loading={!record && !error}
        error={error}
        onRetry={() => {
          setError('')
          setAttempt((n) => n + 1)
        }}
      >
        {record && (
          <div className="card p-4 sm:p-6">
            <RecordForm
              key={id ?? 'new'}
              fields={fields}
              initial={record}
              submitLabel={id ? 'حفظ التعديلات' : 'حفظ الشكوى'}
              onSubmit={save}
              onCancel={() => navigate(k.path)}
              pinActions={false}
            />
          </div>
        )}
      </AsyncContent>
    </div>
  )
}
