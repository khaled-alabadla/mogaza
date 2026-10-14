/** Texts and permission keys of the two logs (complaints / inquiries), shared by the list and its print report. */
export const KINDS = {
  complaint: {
    perm: 'complaints',
    path: '/complaints',
    title: 'الشكاوى',
    subtitle: 'سجّل شكاوى المواطنين أثناء تعطل النظام الرئيسي، ثم علّمها «تم الرفع» بعد إدخالها إليه.',
    reportTitle: 'سجل الشكاوى',
    searchLabel: 'البحث في الشكاوى',
    add: 'إضافة شكوى',
    addTitle: 'إضافة شكوى جديدة',
    editTitle: 'تعديل الشكوى',
    created: 'تمت إضافة الشكوى.',
    deleted: 'تم حذف الشكوى.',
    deleteMessage: 'هل أنت متأكد من حذف هذه الشكوى؟',
    pendingEmpty: 'لا توجد شكاوى بانتظار الرفع',
    empty: 'لا توجد شكاوى',
  },
  inquiry: {
    perm: 'inquiries',
    path: '/inquiries',
    title: 'الاستفسارات',
    subtitle: 'سجّل استفسارات المواطنين أثناء تعطل النظام الرئيسي، ثم علّمها «تم الرفع» بعد إدخالها إليه.',
    reportTitle: 'سجل الاستفسارات',
    searchLabel: 'البحث في الاستفسارات',
    add: 'إضافة استفسار',
    addTitle: 'إضافة استفسار جديد',
    editTitle: 'تعديل الاستفسار',
    created: 'تمت إضافة الاستفسار.',
    deleted: 'تم حذف الاستفسار.',
    deleteMessage: 'هل أنت متأكد من حذف هذا الاستفسار؟',
    pendingEmpty: 'لا توجد استفسارات بانتظار الرفع',
    empty: 'لا توجد استفسارات',
  },
}

export const UPLOAD_TABS = [
  { value: 'pending', label: 'بانتظار الرفع' },
  { value: 'uploaded', label: 'تم الرفع' },
  { value: '', label: 'الكل' },
]

/** The list's filters as API / URL params (empty ones dropped). */
export function filterParams(kind, upload, search) {
  const params = { kind }
  if (upload) params.upload = upload
  if (search) params.search = search
  return params
}
