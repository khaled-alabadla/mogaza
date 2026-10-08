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
