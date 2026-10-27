/**
 * «نصائح للتعامل مع المواطن» on the home page: the «افعل» rules of the guide's «التعامل مع المواطن»
 * section (as edited from the developer dashboard, or the default), in the guide's order.
 */
export function guideTips(sections) {
  const citizens = (Array.isArray(sections) ? sections : []).find((s) => s?.id === 'citizens')
  const tips = []
  for (const stage of citizens?.stages || []) {
    for (const block of stage?.blocks || []) {
      if (block?.type !== 'table' || !Array.isArray(block.rows) || block.head?.[0] !== 'افعل') continue
      for (const row of block.rows) {
        if (Array.isArray(row) && row[0]) tips.push(row[0])
      }
    }
  }
  return tips
}
