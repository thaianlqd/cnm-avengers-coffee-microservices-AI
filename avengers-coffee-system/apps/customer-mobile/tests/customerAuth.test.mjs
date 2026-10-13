import test from 'node:test'
import assert from 'node:assert/strict'
import { authError, identifierPayload, registrationPayload, resetPasswordPayload } from '../src/lib/customerAuth.mjs'

test('email is normalized and username remains an identifier, never an invented phone lookup', () => {
  assert.deepEqual(identifierPayload(' Me@Example.com '), { email: 'me@example.com' })
  assert.deepEqual(identifierPayload(' DemoUser '), { tai_khoan: 'DemoUser' })
  assert.throws(() => identifierPayload('  '))
})
test('registration preserves the exact password and rejects mismatched confirmation', () => {
  const form = { name:' An ', email:' Me@Example.com ', password:' secret ', confirm:' secret ' }
  assert.deepEqual(registrationPayload(form), { hoTen:'An', email:'me@example.com', password:' secret ' })
  assert.throws(() => registrationPayload({ ...form, confirm:'secret' }), /chưa khớp/)
  assert.throws(() => registrationPayload({ ...form, email:'invalid' }), /định dạng/)
})
test('OTP reset needs exactly six digits and never trims the new password', () => {
  assert.deepEqual(resetPasswordPayload('Me@Example.com', ' 123456 ', ' new pass ', ' new pass '), {email:'me@example.com', otp:'123456', newPassword:' new pass '})
  for (const otp of ['12345','1234567','12abc6']) assert.throws(() => resetPasswordPayload('me@example.com', otp, 'secret', 'secret'), /6 chữ số/)
})
test('auth errors show actionable network feedback and preserve backend validation', () => {
  assert.match(authError({code:'ERR_NETWORK', message:'Network Error'}), /kiểm tra mạng/)
  assert.match(authError({code:'ECONNABORTED'}), /thời gian/)
  assert.equal(authError({response:{data:{message:'Mã OTP không chính xác'}}}), 'Mã OTP không chính xác')
  assert.equal(authError({response:{data:{message:['Thiếu email','Thiếu mật khẩu']}}}), 'Thiếu email\nThiếu mật khẩu')
})
