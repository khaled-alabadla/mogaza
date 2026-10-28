/**
 * A chosen picture → a small square (the middle of it, `size` px) as a data URL, ready to upload:
 * WebP where the browser can make it, JPEG otherwise. Rejects what isn't a readable image.
 */
export async function squareImage(file, size = 256) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('الصورة يجب أن تكون بصيغة JPG أو PNG أو WebP.')
  if (file.size > 15 * 1024 * 1024) throw new Error('الصورة كبيرة جداً.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('تعذر قراءة الصورة.'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    // the centre square of the picture
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    const webp = canvas.toDataURL('image/webp', 0.85)
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
