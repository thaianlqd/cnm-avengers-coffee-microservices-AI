import { PAYMENT_METHOD_LABEL } from './constants'

export const fmtMoney = (value) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)

export const paymentTag = (value) => PAYMENT_METHOD_LABEL[value] || value || 'N/A'

export const normalizeViText = (value) => {
  const text = String(value ?? '')
  if (!text) return text

  // Fix common UTF-8 mojibake (e.g. "Cà Phê" rendered as "CÃ  PhÃª").
  try {
    const bytes = Uint8Array.from(Array.from(text).map((char) => char.charCodeAt(0) & 0xff))
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    const score = (input) => (input.match(/[ăâđêôơưáàảãạấầẩẫậéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/gi) || []).length
    return score(decoded) >= score(text) ? decoded : text
  } catch {
    return text
  }
}

export const toDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const toDateLabel = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

export const cutTimeByRange = (range, nowTimestamp) => {
  const map = {
    '24h': nowTimestamp - 24 * 60 * 60 * 1000,
    '7d': nowTimestamp - 7 * 24 * 60 * 60 * 1000,
    '30d': nowTimestamp - 30 * 24 * 60 * 60 * 1000,
  }
  return map[range] || map['7d']
}
