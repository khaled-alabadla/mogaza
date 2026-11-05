/** Field descriptions for RecordForm (see RecordForm for the format). */

export const LOCATION_FIELDS = [
  { name: 'place_name', label: 'اسم المكان', required: true, maxLength: 255, placeholder: 'مثال: مسجد الوحدة' },
  { name: 'description', label: 'الوصف / الموقع', maxLength: 500, multiline: true, placeholder: 'مثال: شارع المجادلة الشاطئ' },
  { name: 'building_number', label: 'رقم المبنى', maxLength: 20, numeric: true, half: true, placeholder: '122' },
  { name: 'street_number', label: 'رقم الشارع', maxLength: 20, numeric: true, half: true, placeholder: '60310' },
  // options are filled at runtime from /api/neighborhoods/ (see withNeighborhoodOptions)
  { name: 'neighborhood', label: 'الحي', type: 'select', options: [], emptyLabel: 'بدون حي' },
]

/** Adding a location: every field must be filled in (editing an older one with blanks is unchanged). */
export const LOCATION_ADD_FIELDS = LOCATION_FIELDS.map((f) =>
  f.name === 'neighborhood' ? { ...f, required: true, emptyLabel: 'اختر الحي' } : { ...f, required: true },
)

/** LOCATION_FIELDS with the «الحي» select filled from a neighborhoods array. */
export function withNeighborhoodOptions(fields, neighborhoods) {
  const options = (neighborhoods || []).map((n) => ({ value: n.id, label: n.name }))
  return fields.map((f) => (f.name === 'neighborhood' ? { ...f, options } : f))
}

export const STREET_FIELDS = [
  { name: 'common_name', label: 'الاسم الشائع للشارع', required: true, maxLength: 255, third: true, placeholder: 'مثال: الشفا' },
  { name: 'official_name', label: 'الاسم الرسمي للشارع', required: true, maxLength: 255, third: true, placeholder: 'مثال: عزالدين القسام' },
  { name: 'street_number', label: 'رقم الشارع', maxLength: 20, numeric: true, third: true, placeholder: '60310' },
]

// Shared by both forms (same labels as the main system's screens), three to a row. All optional.
const ID_FIELD = { name: 'national_id', label: 'رقم الهوية', maxLength: 12, numeric: true, inputMode: 'numeric', third: true, placeholder: '401234567' }
const NAME_FIELD = { name: 'name', label: 'الاسم', maxLength: 150, third: true, placeholder: 'اسم المواطن' }
const PHONE_FIELD = { name: 'phone', label: 'رقم الجوال', maxLength: 16, numeric: true, inputMode: 'tel', third: true, placeholder: '0599123456' }
/** «المصدر» — how the citizen got in touch (same choices for complaints and inquiries). */
export const CHANNELS = [
  { value: 'facebook', label: 'فيسبوك' },
  { value: 'twitter', label: 'تويتر' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'website', label: 'موقع البلدية' },
  { value: 'phone', label: 'اتصال هاتفي' },
  { value: 'app', label: 'تطبيق البلدية' },
  { value: 'visit', label: 'زيارة' },
  { value: 'instagram', label: 'انستقرام' },
]
const CHANNEL_FIELD = { name: 'channel', label: 'المصدر', type: 'select', options: CHANNELS, searchable: true, emptyLabel: 'اختر أو ابحث…', emptyValue: '', third: true }

/**
 * «إضافة استفسار»: the fields of the main system's form, with its required ones, two to a row.
 * The lists of «نوع الاستفسار» and «الحي» are filled at runtime (see complaintFields).
 */
export const INQUIRY_FIELDS = [
  { ...ID_FIELD, third: false, half: true, placeholder: 'رقم الهوية...' },
  { ...NAME_FIELD, third: false, half: true, required: true, placeholder: 'اسم المواطن...' },
  { ...PHONE_FIELD, third: false, half: true, placeholder: '05xxxxxxxx' },
  { name: 'category', label: 'نوع الاستفسار', required: true, type: 'select', options: [], searchable: true, emptyLabel: 'اختر نوع الاستفسار', emptyValue: '', half: true },
  { ...CHANNEL_FIELD, third: false, half: true, required: true, emptyLabel: 'اختر المصدر' },
  { name: 'area', label: 'الحي', required: true, type: 'select', options: [], searchable: true, emptyLabel: 'اختر الحي', emptyValue: '', half: true },
  { name: 'details', label: 'نص الاستفسار', required: true, maxLength: 3000, multiline: true, rows: 4, placeholder: 'اكتب نص الاستفسار بالتفصيل هنا...' },
]

/**
 * «إضافة شكوى»: the fields of the main system's form, in its order. `displayOnly` ones are there to look
 * like that form: they can't be filled in and aren't stored.
 * The long lists of «نوع الشكوى» and «المنطقة» are filled by the form's page (ComplaintFormPage).
 */
export const COMPLAINT_FIELDS = [
  { name: 'hide_identity', label: 'إخفاء بيانات صاحب الشكوى', type: 'checkbox' },
  { name: 'submitter_type', label: 'مقدم الشكوى', displayOnly: true, placeholder: 'افراد', third: true },
  { ...ID_FIELD, required: true },
  { ...NAME_FIELD, required: true },
  { name: 'point', label: 'رقم النقطة', maxLength: 150, numeric: true, inputMode: 'numeric', third: true },
  PHONE_FIELD,
  { name: 'building_number', label: 'مبنى', maxLength: 20, numeric: true, third: true, placeholder: '5A' },
  { name: 'street_number', label: 'الشارع', maxLength: 20, numeric: true, third: true },
  { name: 'subscription', label: 'اشتراك', maxLength: 50, numeric: true, third: true },
  { name: 'category', label: 'نوع الشكوى', required: true, type: 'select', options: [], searchable: true, emptyLabel: 'اختر النوع', emptyValue: '', third: true },
  { ...CHANNEL_FIELD, emptyLabel: 'اختر المصدر' },
  { name: 'area', label: 'المنطقة', type: 'select', options: [], searchable: true, emptyLabel: 'اختر المنطقة', emptyValue: '', third: true },
  { name: 'address', label: 'العنوان', maxLength: 300, third: true },
  { name: 'receipt_prefix', label: 'رمز الإيصال', displayOnly: true, third: true },
  { name: 'receipt_number', label: 'رقم الإيصال', displayOnly: true, third: true },
  { name: 'exception_reason', label: 'سبب الاستثناء', displayOnly: true, placeholder: 'اختر السبب', third: true },
  { name: 'title', label: 'عنوان الطلب', displayOnly: true },
  { name: 'details', label: 'التفاصيل', required: true, maxLength: 3000, multiline: true, rows: 6, placeholder: 'اكتب تفاصيل الشكوى هنا…' },
]

/** A list as select options; a stored value that isn't in it (an older record) stays one, so it is never lost. */
export function asOptions(names, current) {
  return (current && !names.includes(current) ? [current, ...names] : names).map((n) => ({ value: n, label: n }))
}

/**
 * The fields of one kind. With the lists (data/complaintOptions.json) and the edited record, they are the
 * form's: an older record may lack a required field and can still be edited, it only can't lose what it has.
 */
export function complaintFields(kind, lists, record) {
  if (kind !== 'inquiry') return COMPLAINT_FIELDS.filter((f) => !f.displayOnly)
  return INQUIRY_FIELDS.map((f) => {
    const required = f.required && (!record || Boolean(record[f.name]))
    if (f.name === 'category') return { ...f, required, options: asOptions(lists?.categories || [], record?.category) }
    if (f.name === 'area') return { ...f, required, options: asOptions(lists?.areas || [], record?.area) }
    return { ...f, required }
  })
}
