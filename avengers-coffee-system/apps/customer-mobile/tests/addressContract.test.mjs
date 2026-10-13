import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAddress } from '../src/lib/addressContract.mjs'
test('a saved full address is not appended with duplicate ward and city at checkout', () => {
  assert.equal(formatAddress('42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh', 'Phường Tây Thạnh', 'Thành phố Hồ Chí Minh'), '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh')
})
test('address composition preserves house, floor and distinct administrative areas', () => {
  assert.equal(formatAddress(' 12 Nguyễn Huệ, Tầng 3 ', '', 'Phường Bến Nghé', 'Thành phố Hồ Chí Minh'), '12 Nguyễn Huệ, Tầng 3, Phường Bến Nghé, Thành phố Hồ Chí Minh')
})
