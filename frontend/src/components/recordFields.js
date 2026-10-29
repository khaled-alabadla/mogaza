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
const CHANNEL_FIELD = { name: 'channel', label: 'المصدر', type: 'select', options: CHANNELS, searchable: true, emptyLabel: 'اختر أو ابحث…', third: true }

/** «إضافة استفسار» */
export const INQUIRY_FIELDS = [
  ID_FIELD,
  NAME_FIELD,
  PHONE_FIELD,
  { name: 'category', label: 'نوع الاستفسار', maxLength: 150, third: true },
  CHANNEL_FIELD,
  // the API stores the neighborhood's name as text: options are filled at runtime (see complaintFields)
  { name: 'area', label: 'الحي', type: 'select', options: [], searchable: true, emptyLabel: 'اختر أو ابحث…', emptyValue: '', third: true },
  { name: 'details', label: 'نص الاستفسار', maxLength: 3000, multiline: true, rows: 4, placeholder: 'اكتب نص الاستفسار بالتفصيل هنا…' },
]

/** «إضافة شكوى» */
export const COMPLAINT_FIELDS = [
  { name: 'hide_identity', label: 'إخفاء بيانات صاحب الشكوى', type: 'checkbox' },
  // citizen
  ID_FIELD,
  NAME_FIELD,
  PHONE_FIELD,
  // place
  { name: 'point', label: 'رقم النقطة', maxLength: 150, numeric: true, inputMode: 'numeric', third: true },
  { name: 'building_number', label: 'مبنى', maxLength: 20, numeric: true, third: true, placeholder: '5A' },
  { name: 'street_number', label: 'الشارع', maxLength: 20, numeric: true, third: true },
  // the complaint
  { name: 'category', label: 'نوع الشكوى', maxLength: 150, third: true },
  CHANNEL_FIELD,
  { name: 'address', label: 'العنوان', maxLength: 300, third: true },
  { name: 'details', label: 'تفاصيل الشكوى', maxLength: 3000, multiline: true, rows: 4, placeholder: 'اكتب تفاصيل الشكوى هنا…' },
]

/**
 * The form's fields for one kind. The inquiry «الحي» select lists the known neighborhood names;
 * `currentArea` (the edited record's value) is kept as an option even if it is not in that list,
 * so editing an older record never loses it.
 */
export function complaintFields(kind, neighborhoodNames = [], currentArea = '') {
  const fields = kind === 'inquiry' ? INQUIRY_FIELDS : COMPLAINT_FIELDS
  const names = [...neighborhoodNames]
  if (currentArea && !names.includes(currentArea)) names.unshift(currentArea)
  return fields.map((f) => (f.name === 'area' ? { ...f, options: names.map((n) => ({ value: n, label: n })) } : f))
}
