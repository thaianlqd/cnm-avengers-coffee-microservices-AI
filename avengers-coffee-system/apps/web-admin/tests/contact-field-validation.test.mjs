import test from 'node:test'
import assert from 'node:assert/strict'
import { contactFieldKind, validateEmail, validateVietnamesePhone } from '../src/utils/contactFieldValidation.js'

test('validates optional email values without blocking an empty field', () => {
  assert.equal(validateEmail(''), '')
  assert.equal(validateEmail('staff@example.vn'), '')
  assert.match(validateEmail('staff@invalid'), /email đúng định dạng/)
})

test('accepts Vietnamese domestic and +84 phone formats', () => {
  assert.equal(validateVietnamesePhone(''), '')
  assert.equal(validateVietnamesePhone('0912 345 678'), '')
  assert.equal(validateVietnamesePhone('+84 912 345 678'), '')
  assert.match(validateVietnamesePhone('12345'), /số điện thoại Việt Nam/)
})

test('recognizes contact inputs by semantic type or Vietnamese field name', () => {
  assert.equal(contactFieldKind({ type: 'email' }), 'email')
  assert.equal(contactFieldKind({ type: 'tel' }), 'phone')
  assert.equal(contactFieldKind({ type: 'text', name: 'so_dien_thoai' }), 'phone')
  assert.equal(contactFieldKind({ type: 'text', placeholder: 'Tìm kiếm' }), '')
})

test('does not apply email validation to a username-or-email login identifier', () => {
  const mixedLabel = { textContent: 'Tên đăng nhập hoặc email' }
  assert.equal(contactFieldKind({ type: 'text', id: 'identifier', labels: [mixedLabel] }), '')
  assert.equal(contactFieldKind({ type: 'text', labels: [mixedLabel] }), '')
  assert.equal(contactFieldKind({ type: 'text', autoComplete: 'username', labels: [mixedLabel] }), '')
})
