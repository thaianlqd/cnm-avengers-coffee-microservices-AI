export const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateAvatarFile(file) {
  if (!file || !AVATAR_TYPES.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return 'Chỉ chấp nhận ảnh JPG, JPEG, PNG hoặc WebP.';
  }
  if (file.size > MAX_AVATAR_BYTES) return 'Ảnh vượt quá 3 MB. Vui lòng chọn ảnh nhỏ hơn.';
  if (file.size === 0) return 'Tệp ảnh trống hoặc không đọc được.';
  return '';
}

// Keep the persisted avatar small enough for the profile response and browser storage.
export async function prepareAvatar(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' })) : reject(new Error('Invalid image')),
      'image/jpeg', 0.85,
    ));
  } finally {
    bitmap.close();
  }
}
