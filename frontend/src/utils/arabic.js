/** Same folding as the backend search: hamza forms, taa marbuta, alef maqsura, diacritics, Arabic digits. */
export function normalizeArabic(value) {
  return String(value || '')
    .replace(/[ؐ-ًؚ-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
