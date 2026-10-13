export const identifierPayload = identifier => {
  const value = String(identifier || '').trim()
  if (!value) throw new Error('Bạn hãy nhập email hoặc tên đăng nhập.')
  return value.includes('@') ? { email: value.toLowerCase() } : { tai_khoan: value }
}
export function registrationPayload({ name, email, password, confirm }) {
  const address = String(email || '').trim().toLowerCase(), fullName = String(name || '').trim()
  if (!fullName) throw new Error('Bạn hãy nhập họ tên.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Email chưa đúng định dạng.')
  validateNewPassword(password, confirm)
  return { email: address, password, hoTen: fullName }
}
export function validateNewPassword(password, confirm) {
  if (typeof password !== 'string' || password.length < 6 || !password.trim()) throw new Error('Mật khẩu cần ít nhất 6 ký tự.')
  if (password !== confirm) throw new Error('Mật khẩu xác nhận chưa khớp.')
}
export function resetPasswordPayload(identifier, otp, password, confirm) {
  const code = String(otp || '').trim()
  if (!/^\d{6}$/.test(code)) throw new Error('Mã xác thực cần đủ 6 chữ số.')
  validateNewPassword(password, confirm)
  return { ...identifierPayload(identifier), otp: code, newPassword: password }
}
export function authError(error) {
  const message = error?.response?.data?.message
  if (Array.isArray(message)) return message.join('\n')
  if (!message && ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return 'Kết nối mất quá nhiều thời gian. Bạn hãy thử lại.'
  if (!message && error?.code === 'ERR_NETWORK') return 'Chưa kết nối được hệ thống. Bạn hãy kiểm tra mạng rồi thử lại.'
  return (typeof message === 'string' && message) || error?.message || 'Chưa thể kết nối. Bạn hãy thử lại.'
}
