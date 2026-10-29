import L from 'leaflet'

/*
 * The icons of the city's places on «الخريطة» (from src/data/gazaPlaces.json): one small round badge
 * per kind of place — its colour and drawing say what it is (mosque, school, health…).
 * The drawings are fixed SVG strings (never text from the data).
 */

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const GROUPS = {
  worship: { color: '#0a6b38', glyph: svg('<path d="M12 3c2.5 2.2 5 3.6 5 7v1H7v-1c0-3.4 2.5-4.8 5-7z"/><path d="M6 11v9h12v-9M10 20v-4a2 2 0 0 1 4 0v4"/>') },
  school: { color: '#2563eb', glyph: svg('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>') },
  health: { color: '#dc2626', glyph: svg('<path d="M12 5v14M5 12h14"/>') },
  food: { color: '#ea580c', glyph: svg('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-1.7 1.5-2.5 3.5-2.5 6.5H17V21"/>') },
  shop: { color: '#9333ea', glyph: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>') },
  gov: { color: '#0f766e', glyph: svg('<path d="M3 10l9-6 9 6M5 10v9M19 10v9M9.5 10v9M14.5 10v9M3 20h18"/>') },
  money: { color: '#ca8a04', glyph: svg('<rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2.5"/>') },
  leisure: { color: '#16a34a', glyph: svg('<path d="M12 21v-6M12 15c-4 0-6-2.5-6-5.5S8.7 3 12 3s6 3.5 6 6.5S16 15 12 15z"/>') },
  fuel: { color: '#475569', glyph: svg('<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 9h6M15 8l3 3v7a1.5 1.5 0 0 0 3 0v-8l-3-3"/>') },
  other: { color: '#64748b', glyph: svg('<circle cx="12" cy="10" r="3"/><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/>') },
}

const KIND_GROUP = {
  مسجد: 'worship', كنيسة: 'worship', مقبرة: 'worship',
  مدرسة: 'school', 'روضة أطفال': 'school', جامعة: 'school', كلية: 'school', مكتبة: 'school',
  مستشفى: 'health', عيادة: 'health', 'عيادة أسنان': 'health', صيدلية: 'health', 'مركز صحي': 'health',
  مطعم: 'food', مقهى: 'food', مخبز: 'food',
  محل: 'shop', سوبرماركت: 'shop', 'مجمع تجاري': 'shop', سوق: 'shop', ورشة: 'shop',
  'مؤسسة حكومية': 'gov', 'مبنى حكومي': 'gov', شرطة: 'gov', 'دفاع مدني': 'gov', محكمة: 'gov', بريد: 'gov',
  مؤسسة: 'gov', 'مركز مجتمعي': 'gov', مكتب: 'gov',
  بنك: 'money', 'صراف آلي': 'money', صرافة: 'money',
  حديقة: 'leisure', ملعب: 'leisure', 'نادي رياضي': 'leisure', 'مرفق ترفيهي': 'leisure', فندق: 'leisure', متحف: 'leisure',
  'محطة وقود': 'fuel', 'موقف سيارات': 'fuel', موقف: 'fuel',
}

/** «دليل الرموز»: what each colour means (in the order shown). */
export const LEGEND = [
  ['worship', 'مساجد وكنائس'],
  ['school', 'مدارس وجامعات'],
  ['health', 'مستشفيات وعيادات وصيدليات'],
  ['gov', 'مؤسسات ومبانٍ حكومية'],
  ['shop', 'محلات وأسواق'],
  ['food', 'مطاعم ومخابز'],
  ['money', 'بنوك وصرافة'],
  ['leisure', 'حدائق وملاعب وفنادق'],
  ['fuel', 'وقود ومواقف'],
  ['other', 'معالم أخرى'],
].map(([group, label]) => ({ group, label, color: GROUPS[group].color, glyph: GROUPS[group].glyph }))

/** Kinds that are not one spot on the map (a street is lit up when searched instead). */
export const NOT_ICONS = new Set(['شارع', 'منطقة', 'إشارة مرور'])

/** The group of a kind of place («مسجد» → 'worship'). */
export const groupOf = (kind) => KIND_GROUP[kind] || 'other'

/** The groups shown as soon as icons appear; the others (shops, food…) only closer in, where there is room. */
export const MAIN_GROUPS = new Set(['worship', 'school', 'health', 'gov'])

const cache = new Map()

/** The icon for a kind of place («مسجد», «مدرسة», …): the same object for the same kind. */
export function placeIcon(kind) {
  const group = groupOf(kind)
  if (!cache.has(group)) {
    const { color, glyph } = GROUPS[group]
    cache.set(
      group,
      L.divIcon({
        className: 'place-icon',
        html: `<span style="background:${color}">${glyph}</span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    )
  }
  return cache.get(group)
}
