/**
 * Turn an axios/DRF error into Arabic messages:
 *   { message: string, fields: { fieldName: string } }
 */
export function parseApiError(error, fallback = 'حدث خطأ غير متوقع. حاول مرة أخرى.') {
  if (!error?.response) {
    if (error?.code === 'ECONNABORTED') return { message: 'انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.', fields: {} }
    return { message: 'تعذر الاتصال بالخادم. تحقق من الاتصال بالشبكة.', fields: {} }
  }
  const { status, data } = error.response
  const fields = {}
  let message = ''

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const text = Array.isArray(value) ? value.join(' ') : String(value)
      if (key === 'detail' || key === 'non_field_errors') message = text
      else fields[key] = text
    }
  }

  if (!message) {
    if (Object.keys(fields).length) message = 'يرجى تصحيح الحقول المشار إليها.'
    else if (status === 401 || status === 403) message = 'ليست لديك صلاحية لتنفيذ هذه العملية.'
    else if (status === 404) message = 'السجل المطلوب غير موجود أو تم حذفه.'
    else if (status === 429) message = 'محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مجدداً.'
    else if (status >= 500) message = 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.'
    else message = fallback
  }
  return { message, fields }
}
