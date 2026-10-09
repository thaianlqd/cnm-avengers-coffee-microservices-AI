import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineText, textBlocks } from './chatText.js';

test('policy paragraphs, emphasis and lists retain readable structure', () => {
  const blocks = textBlocks('Dạ, thông tin như sau:\n\n**Thời hạn:**\n- **24 giờ** kể từ khi nhận hàng.\n- Thức uống: *trong ngày*.\n\nBạn cần hỗ trợ thêm không ạ?');
  assert.deepEqual(blocks.map(b => b.type), ['paragraph', 'paragraph', 'unordered', 'paragraph']);
  assert.equal(blocks[2].items.length, 2);
  assert.equal(inlineText(blocks[2].items[1])[1].type, 'em');
});
test('store ordinals and multiline review comments are grouped correctly', () => {
  const blocks = textBlocks('1. **Quán Một**\nĐịa chỉ A\n\n2. **Quán Hai**\nĐịa chỉ B\n\nBạn muốn xem quán nào?');
  assert.equal(blocks[0].type, 'ordered');
  assert.deepEqual(blocks[0].items, ['**Quán Một**\nĐịa chỉ A', '**Quán Hai**\nĐịa chỉ B']);
  assert.equal(blocks[1].text, 'Bạn muốn xem quán nào?');
  assert.equal(textBlocks('5. Nhận xét thứ năm')[0].start, 5);
});
test('escaped review Markdown and HTML remain inert text', () => {
  const text = String.raw`\*\*ngọt\*\* \[mở\](javascript:alert(1)) <img src=x onerror=alert(1)>`;
  assert.deepEqual(inlineText(text), [{type: 'text', text: '**ngọt** [mở](javascript:alert(1)) <img src=x onerror=alert(1)>'}]);
  assert.equal(inlineText('**thiếu dấu đóng')[0].type, 'text');
});
test('headings, separator and nested italic have safe nodes', () => {
  assert.deepEqual(textBlocks('# Đánh giá\n\n---\n\nMô tả').map(b => b.type), ['heading', 'rule', 'paragraph']);
  assert.equal(inlineText('**thơm và *ngọt nhẹ***')[0].children[1].type, 'em');
});
