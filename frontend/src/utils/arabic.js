/**
 * Same folding as the backend search: hamza forms, taa marbuta, alef maqsura, diacritics, Arabic digits;
 * also the invisible marks a pasted text may carry, and a stray hamza («الشاطيء» = «الشاطئ»).
 */
export function normalizeArabic(value) {
  return String(value || '')
    .replace(/[ؐ-ًؚ-ٰٟـ\u00ad\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/ء/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Does `text` (normalized) contain every search term (normalized)? A term may be part of a word
 * («ابداع» → «مدرسة ابداع بلا حدود»), may span a missing space («بلاحدود»), and an «ال» typed or left
 * out doesn't matter («الابداع» → «ابداع»).
 */
export function matchesTerms(text, terms) {
  const joined = text.replace(/ /g, '')
  return terms.every((t) => text.includes(t) || joined.includes(t) || (t.length > 3 && t.startsWith('ال') && text.includes(t.slice(2))))
}
