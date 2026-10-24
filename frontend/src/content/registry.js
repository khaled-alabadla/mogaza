/**
 * Every text the developer dashboard («/dashboard») can change, with the site's own default.
 * A component reads one with useText(key) (or useContentValue(key) for JSON); an edit saved in the
 * dashboard overrides the default for everyone, «استعادة الافتراضي» brings the default back.
 *
 * type: 'text' (one line) | 'textarea' | 'json' (structured content, e.g. «دليل القسم»)
 * A large default is loaded only when needed (`loadDefault`), to keep it out of the main bundle.
 */
export const CONTENT_GROUPS = [
  {
    title: 'الهوية',
    fields: [
      { key: 'brand.name', label: 'اسم القسم', default: 'قسم المعلومات والشكاوي' },
      { key: 'brand.org', label: 'اسم الجهة', default: 'بلدية غزة' },
    ],
  },
  {
    title: 'شاشة تسجيل الدخول',
    fields: [
      { key: 'login.quote1', label: 'العبارة: السطر الأول', default: 'أثرٌ جميل' },
      { key: 'login.quote2', label: 'العبارة: السطر الثاني', default: 'قبل الرحيل' },
      { key: 'login.welcome', label: 'الترحيب', default: 'مرحباً بك' },
      { key: 'login.subtitle', label: 'النص تحت الترحيب', default: 'سجّل الدخول للوصول إلى قسم المعلومات والشكاوي' },
    ],
  },
  {
    title: 'فريق العمل',
    fields: [
      { key: 'credits.1.role', label: 'الأول: الدور', default: 'تم برمجة النظام بواسطة' },
      { key: 'credits.1.name', label: 'الأول: الاسم', default: 'المهندس بلال سمير قنوع' },
      { key: 'credits.2.role', label: 'الثاني: الدور', default: 'تم جمع البيانات بواسطة' },
      { key: 'credits.2.name', label: 'الثاني: الاسم', default: 'الأستاذ سليمان معين حبيب' },
      { key: 'credits.3.role', label: 'الثالث: الدور', default: 'تحت إشراف' },
      { key: 'credits.3.name', label: 'الثالث: الاسم', default: 'المهندس محمد ابراهيم بهار' },
    ],
  },
  {
    title: 'البحث عن المواقع',
    fields: [
      { key: 'search.title', label: 'العنوان', default: 'ابحث عن اسم مكان أو تقاطع' },
      { key: 'search.subtitle', label: 'النص تحت العنوان', default: 'يمكنك كتابة جزء من الاسم أو الوصف أو رقم المبنى أو الشارع' },
    ],
  },
  {
    title: 'جدول المياه',
    fields: [
      { key: 'water.title', label: 'العنوان', default: 'جدول توزيع المياه' },
      { key: 'water.subtitle', label: 'النص تحت العنوان', default: 'حسب توجيهات المواطنين' },
    ],
  },
  {
    title: 'الشكاوى والاستفسارات',
    fields: [
      { key: 'complaints.title', label: 'الشكاوى: العنوان', default: 'الشكاوى' },
      {
        key: 'complaints.subtitle',
        label: 'الشكاوى: النص تحت العنوان',
        type: 'textarea',
        default: 'سجّل شكاوى المواطنين أثناء تعطل النظام الرئيسي، ثم علّمها «تم الرفع» بعد إدخالها إليه.',
      },
      { key: 'urgent.title', label: 'الشكاوى العاجلة: العنوان', default: 'الشكاوى العاجلة' },
      {
        key: 'urgent.subtitle',
        label: 'الشكاوى العاجلة: النص تحت العنوان',
        type: 'textarea',
        default: 'شكاوى تحتاج متابعة حتى تُحل: الأقدم أولاً.',
      },
      { key: 'inquiries.title', label: 'الاستفسارات: العنوان', default: 'الاستفسارات' },
      {
        key: 'inquiries.subtitle',
        label: 'الاستفسارات: النص تحت العنوان',
        type: 'textarea',
        default: 'سجّل استفسارات المواطنين أثناء تعطل النظام الرئيسي، ثم علّمها «تم الرفع» بعد إدخالها إليه.',
      },
    ],
  },
  {
    title: 'دليل القسم',
    fields: [
      { key: 'guide.title', label: 'العنوان', default: 'دليل القسم' },
      { key: 'guide.subtitle', label: 'النص تحت العنوان', default: 'خطوات العمل في قسم المعلومات والشكاوى.' },
      {
        key: 'guide.sections',
        label: 'محتوى الدليل (أقسامه ومراحله)',
        type: 'json',
        default: null,
        loadDefault: () => import('../pages/guideSections').then((m) => m.GUIDE_DEFAULT),
      },
    ],
  },
  {
    title: 'الإدارة',
    fields: [
      { key: 'users.subtitle', label: 'المستخدمون: النص تحت العنوان', default: 'الحسابات وأدوارها، والصفحات والخيارات التي يملكها كل مستخدم.' },
      { key: 'audit.subtitle', label: 'سجل العمليات: النص تحت العنوان', default: 'من قام بالتعديل، وماذا تغيّر، ومتى.' },
    ],
  },
  {
    title: 'تذييل الصفحة',
    fields: [
      { key: 'footer.about', label: 'وصف الموقع', type: 'textarea', default: 'قاعدة بيانات المواقع والتقاطعات وجدول توزيع المياه لخدمة المواطنين.' },
      { key: 'footer.rights', label: 'سطر الحقوق (بعد السنة)', default: 'بلدية غزة، جميع الحقوق محفوظة' },
    ],
  },
]

/** key → field */
export const CONTENT_FIELDS = Object.fromEntries(CONTENT_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f]))
