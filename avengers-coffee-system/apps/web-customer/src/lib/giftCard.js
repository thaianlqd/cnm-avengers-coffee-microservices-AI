export const compactGiftCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatGiftCode = value => compactGiftCode(value).slice(0, 16).match(/.{1,4}/g)?.join('-') || '';
export const validGiftCode = value => /^[A-Z0-9]{12,16}$/.test(compactGiftCode(value));
export function giftCardError(error) {
  const messages = {
    GIFT_CARD_INVALID: 'Mã thẻ phải gồm 12–16 ký tự chữ hoặc số',
    GIFT_CARD_NOT_FOUND: 'Mã thẻ không tồn tại',
    GIFT_CARD_USED: 'Thẻ quà tặng đã được sử dụng',
    GIFT_CARD_EXPIRED: 'Thẻ quà tặng đã hết hạn',
  };
  return messages[error?.response?.data?.code] || 'Không thể kiểm tra hoặc nạp thẻ. Vui lòng thử lại.';
}
