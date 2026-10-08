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

export const COMPLAINT_KINDS = [
  { value: 'complaint', label: 'شكوى' },
  { value: 'inquiry', label: 'استفسار' },
]

export const COMPLAINT_FIELDS = [
  { name: 'kind', label: 'نوع الطلب', type: 'select', options: COMPLAINT_KINDS, required: true, emptyLabel: '— اختر —', half: true },
  { name: 'category', label: 'نوع الشكوى', required: true, maxLength: 150, half: true, placeholder: 'مثال: انقطاع مياه' },
  { name: 'national_id', label: 'رقم الهوية', required: true, maxLength: 12, numeric: true, inputMode: 'numeric', half: true, placeholder: '401234567' },
  { name: 'name', label: 'الاسم', required: true, maxLength: 150, half: true, placeholder: 'الاسم الرباعي' },
  { name: 'phone', label: 'رقم الجوال', required: true, maxLength: 16, numeric: true, inputMode: 'tel', half: true, placeholder: '0599123456' },
  { name: 'point', label: 'النقطة', maxLength: 150, half: true },
  { name: 'building_number', label: 'رقم المبنى', maxLength: 20, numeric: true, half: true, placeholder: '5A' },
  { name: 'street_number', label: 'رقم الشارع', maxLength: 20, numeric: true, half: true, placeholder: '1050' },
  { name: 'address', label: 'العنوان', maxLength: 300, multiline: true, placeholder: 'مثال: تل الهوا - شارع القدس' },
]
