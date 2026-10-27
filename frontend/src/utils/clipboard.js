/**
 * Copies text to the clipboard. The modern API first; when it is missing or refused (an http address,
 * a browser asking for permission), the old way: select the text in a hidden field and «copy».
 * Resolves when copied, rejects when neither worked.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    /* refused: try the old way below */
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    if (!document.execCommand?.('copy')) throw new Error('copy refused')
  } finally {
    field.remove()
  }
}
