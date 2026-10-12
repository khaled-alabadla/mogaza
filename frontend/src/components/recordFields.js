/** Field descriptions for RecordForm (see RecordForm for the format). */

export const LOCATION_FIELDS = [
  { name: 'place_name', label: 'اسم المكان', required: true, maxLength: 255, placeholder: 'مثال: مسجد الوحدة' },
  { name: 'description', label: 'الوصف / الموقع', maxLength: 500, multiline: true, placeholder: 'مثال: شارع المجادلة الشاطئ' },
  { name: 'building_number', label: 'رقم المبنى', maxLength: 20, numeric: true, half: true, placeholder: '122' },
  { name: 'street_number', label: 'رقم الشارع', maxLength: 20, numeric: true, half: true, placeholder: '60310' },
  // options are filled at runtime from /api/neighborhoods/ (see withNeighborhoodOptions)
  { name: 'neighborhood', label: 'الحي', type: 'select', options: [], emptyLabel: '— بدون حي —' },
]

/** LOCATION_FIELDS with the «الحي» select filled from a neighborhoods array. */
export function withNeighborhoodOptions(fields, neighborhoods) {
  const options = (neighborhoods || []).map((n) => ({ value: n.id, label: n.name }))
  return fields.map((f) => (f.name === 'neighborhood' ? { ...f, options } : f))
}

export const STREET_FIELDS = [
  { name: 'common_name', label: 'الاسم الشائع للشارع', required: true, maxLength: 255, placeholder: 'مثال: الشفا' },
  { name: 'official_name', label: 'الاسم الرسمي للشارع', required: true, maxLength: 255, placeholder: 'مثال: عزالدين القسام' },
]

// Shared by both forms (same order and labels as the main system's screens). All optional.
const ID_FIELD = { name: 'national_id', label: 'رقم الهوية', maxLength: 12, numeric: true, inputMode: 'numeric', half: true, placeholder: '401234567' }
const NAME_FIELD = { name: 'name', label: 'الاسم', maxLength: 150, half: true, placeholder: 'اسم المواطن' }
const PHONE_FIELD = { name: 'phone', label: 'رقم الجوال', maxLength: 16, numeric: true, inputMode: 'tel', half: true, placeholder: '0599123456' }
/** «المصدر» — how the citizen got in touch (same choices for complaints and inquiries). */
export const CHANNELS = [
  { value: 'phone', label: 'اتصال هاتفي' },
  { value: 'facebook', label: 'فيسبوك' },
  { value: 'whatsapp', label: 'واتساب' },
]
const CHANNEL_FIELD = { name: 'channel', label: 'المصدر', type: 'select', options: CHANNELS, emptyLabel: '— اختر المصدر —', half: true }

/** «إضافة استفسار» */
export const INQUIRY_FIELDS = [
  ID_FIELD,
  NAME_FIELD,
  PHONE_FIELD,
  { name: 'category', label: 'نوع الاستفسار', maxLength: 150, half: true },
  CHANNEL_FIELD,
  { name: 'area', label: 'الحي', maxLength: 150, half: true },
  { name: 'details', label: 'نص الاستفسار', maxLength: 3000, multiline: true, rows: 4, placeholder: 'اكتب نص الاستفسار بالتفصيل هنا…' },
]

/** «إضافة شكوى» */
export const COMPLAINT_FIELDS = [
  { name: 'hide_identity', label: 'إخفاء بيانات صاحب الشكوى', type: 'checkbox' },
  ID_FIELD,
  NAME_FIELD,
  { name: 'point', label: 'رقم النقطة', maxLength: 150, numeric: true, inputMode: 'numeric', half: true },
  PHONE_FIELD,
  { name: 'building_number', label: 'مبنى', maxLength: 20, numeric: true, half: true, placeholder: '5A' },
  { name: 'street_number', label: 'الشارع', maxLength: 20, numeric: true, half: true },
  { name: 'subscription', label: 'اشتراك', maxLength: 50, numeric: true, half: true },
  { name: 'category', label: 'نوع الشكوى', maxLength: 150, half: true },
  CHANNEL_FIELD,
  { name: 'area', label: 'المنطقة', maxLength: 150, half: true },
  { name: 'address', label: 'العنوان', maxLength: 300, half: true },
  { name: 'details', label: 'تفاصيل الشكوى', maxLength: 3000, multiline: true, rows: 4, placeholder: 'اكتب تفاصيل الشكوى هنا…' },
]

/** The form's fields for one kind, with «الحي / المنطقة» suggesting the known neighborhoods. */
export function complaintFields(kind, neighborhoodNames = []) {
  const fields = kind === 'inquiry' ? INQUIRY_FIELDS : COMPLAINT_FIELDS
  return fields.map((f) => (f.name === 'area' ? { ...f, suggestions: neighborhoodNames } : f))
}
