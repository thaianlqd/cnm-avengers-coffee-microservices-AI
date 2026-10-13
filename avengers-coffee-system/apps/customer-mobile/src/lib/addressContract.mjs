// Saved addresses may already include the ward and city selected by the customer.
export function formatAddress(...parts) {
  const seen = new Set()
  return parts.flatMap(part => String(part || '').split(',')).map(part => part.trim()).filter(part => {
    if (!part) return false
    const key = part.normalize('NFC').toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(', ')
}
