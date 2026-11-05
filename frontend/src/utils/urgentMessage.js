const toLatinDigits = (text) => text.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))

/**
 * The fields of «إضافة شكوى عاجلة» from the message of مركز خدمات الجمهور, which always reads:
 *
 *     شكوى رقم/56923
 *     صرف صحي - طفح صرف صحي          ← the type
 *     الشيخ عجلين ـ شمال المسجد …        ← the place (goes to the «notes» field, shown as «العنوان»)
 *     المواطن/ …
 *     رقم الجوال: 0599…
 *
 *     مقدمة منذ: 0 يوم
 *
 *     مركز خدمات الجمهور …             ← the signature (ignored)
 *
 * Returns only what it found (the form shows it to be checked), or null when it isn't such a message.
 */
export function parseUrgentMessage(message) {
  const lines = toLatinDigits(String(message || ''))
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const find = (pattern) => {
    const at = lines.findIndex((line) => pattern.test(line))
    return { at, value: at < 0 ? '' : lines[at].match(pattern)[1].trim() }
  }

  const number = find(/شكوى\s*رقم\s*[/:\\-]?\s*(\d+)/)
  const name = find(/^المواطن\s*[/:\\-]?\s*(.*)$/)
  const phone = find(/(?:رقم\s*)?(?:الجوال|الهاتف)\s*[/:\\-]?\s*(\d[\d\s-]*)/)
  const days = find(/مقدمة\s*منذ\s*[/:\\-]?\s*(\d+)/)
  if (number.at < 0 && name.at < 0 && phone.at < 0 && days.at < 0) return null

  // between the number and the citizen: the type, then the place
  const stops = [name.at, phone.at, days.at].filter((at) => at > number.at)
  const between = number.at < 0 ? [] : lines.slice(number.at + 1, stops.length ? Math.min(...stops) : undefined)

  const fields = {
    number: number.value,
    name: name.value,
    category: between[0] || '',
    phone: phone.value.replace(/[\s-]/g, ''),
    submitted_days_ago: days.value, // text: «0» is an age, not an empty field
    notes: between.slice(1).join('\n'),
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value))
}
