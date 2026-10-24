const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value) {
  const email = String(value || '').trim()
  if (!email) return ''
  return EMAIL_PATTERN.test(email) ? '' : 'Vui lòng nhập email đúng định dạng, ví dụ ten@domain.vn.'
}

export function validateVietnamesePhone(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const valid = /^0\d{9,10}$/.test(digits) || /^84\d{9}$/.test(digits)
  return valid ? '' : 'Vui lòng nhập số điện thoại Việt Nam gồm 10–11 số.'
}

export function contactFieldKind(input) {
  const type = String(input?.type || '').toLowerCase()
  if (type === 'email') return 'email'
  if (type === 'tel') return 'phone'

  const label = Array.from(input?.labels || []).map(item => item.textContent || '').join(' ')
  const identity = [input?.name, input?.id, input?.autocomplete, input?.getAttribute?.('autocomplete')]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[_-]+/g, ' ').toLowerCase()
  // A login identifier may accept either a username or an email. It must not
  // inherit email validation just because its label mentions email as an option.
  if (/\b(identifier|username|user name|ten dang nhap|tai khoan|login)\b/.test(identity)) return ''

  const hint = [input?.name, input?.id, input?.placeholder, input?.getAttribute?.('aria-label'), label]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[_-]+/g, ' ').toLowerCase()
  if (/\b(username|user name|ten dang nhap|tai khoan|login|identifier)\b/.test(hint) && /email|e-mail/.test(hint)) return ''
  if (/email|e-mail|thu dien tu/.test(hint)) return 'email'
  if (/phone|mobile|telephone|dien thoai|so dien thoai|\bsdt\b/.test(hint)) return 'phone'
  return ''
}

export function validateContactInput(input) {
  const kind = contactFieldKind(input)
  if (!kind) return ''
  return kind === 'email' ? validateEmail(input.value) : validateVietnamesePhone(input.value)
}

export function updateContactInputValidity(input) {
  const message = validateContactInput(input)
  const kind = contactFieldKind(input)
  if (!kind) return ''

  input.setCustomValidity?.(message)
  if (message) {
    input.setAttribute('aria-invalid', 'true')
    input.title = message
    const host = input.closest?.('.kiosk-staff-field, .operation-form-fields label, .workspace-form-field') || input.parentElement
    if (host) {
      host.classList.add('contact-validation-host')
      host.setAttribute('data-contact-validation-error', message)
    }
  } else {
    input.removeAttribute('aria-invalid')
    if (input.title && /định dạng|số điện thoại Việt Nam/.test(input.title)) input.removeAttribute('title')
    const host = input.closest?.('.contact-validation-host') || input.parentElement
    host?.removeAttribute('data-contact-validation-error')
    host?.classList.remove('contact-validation-host')
  }
  return message
}
