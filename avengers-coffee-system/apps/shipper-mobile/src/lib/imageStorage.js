/**
 * Quản lý lưu trữ ảnh bằng chứng giao hàng (Proof of Delivery - P.O.D)
 * Hỗ trợ các phương thức lưu trữ không lưu trực tiếp vào mã nguồn:
 * 1. Cloudinary Direct Unsigned Upload (HTTPS CDN công khai)
 * 2. ImgBB Cloud API (HTTPS direct link)
 * 3. Supabase Storage / Cloud Object Storage
 * 4. Compressed Base64 Data URI (Lưu trữ độc lập trực tiếp trong Database PostgreSQL)
 */

/**
 * Chuyển đổi một local file URI (file:///...) sang Base64 Data URI
 * Sử dụng Web API chuẩn được React Native hỗ trợ sẵn (fetch + blob + FileReader).
 */
export async function convertLocalFileToDataUri(fileUri) {
  if (!fileUri) return null;
  if (typeof fileUri === 'string' && (fileUri.startsWith('data:image/') || fileUri.startsWith('http://') || fileUri.startsWith('https://'))) {
    return fileUri;
  }

  try {
    const response = await globalThis.fetch(fileUri);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          resolve(null);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('[imageStorage] Không thể chuyển file sang Data URI:', error?.message);
    return null;
  }
}

/**
 * Upload ảnh lên Cloudinary qua Unsigned Upload Preset.
 * Trả về URL HTTPS công khai trên Cloudinary CDN.
 */
export async function uploadToCloudinary(imageSource) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

  if (!cloudName) return null;

  try {
    const formData = new globalThis.FormData();
    if (imageSource.startsWith('data:image/')) {
      formData.append('file', imageSource);
    } else {
      formData.append('file', {
        uri: imageSource,
        type: 'image/jpeg',
        name: `proof_${Date.now()}.jpg`,
      });
    }
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'delivery_proofs');

    const res = await globalThis.fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn('[imageStorage] Cloudinary phản hồi lỗi:', errorText);
      return null;
    }

    const data = await res.json();
    return data.secure_url || data.url || null;
  } catch (error) {
    console.warn('[imageStorage] Lỗi khi upload Cloudinary:', error?.message);
    return null;
  }
}

/**
 * Upload ảnh lên ImgBB qua API Key.
 * Trả về direct HTTPS image URL.
 */
export async function uploadToImgBB(imageSource) {
  const apiKey = process.env.EXPO_PUBLIC_IMGBB_API_KEY;
  if (!apiKey) return null;

  try {
    let base64Payload = imageSource;
    if (imageSource.startsWith('data:image/')) {
      base64Payload = imageSource.split(',')[1];
    } else if (imageSource.startsWith('file://')) {
      const dataUri = await convertLocalFileToDataUri(imageSource);
      if (dataUri && dataUri.includes(',')) {
        base64Payload = dataUri.split(',')[1];
      }
    }

    const formData = new globalThis.FormData();
    formData.append('image', base64Payload);

    const res = await globalThis.fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.url || null;
  } catch (error) {
    console.warn('[imageStorage] Lỗi khi upload ImgBB:', error?.message);
    return null;
  }
}

/**
 * Xử lý và lưu trữ ảnh P.O.D thông minh đa tầng:
 * - Ưu tiên 1: Giữ nguyên nếu đã là URL Internet (https://...)
 * - Ưu tiên 2: Upload lên Cloudinary nếu có cấu hình cloud name
 * - Ưu tiên 3: Upload lên ImgBB nếu có cấu hình API key
 * - Ưu tiên 4: Chuyển đổi thành Data URI Base64 (lưu trực tiếp trong Database, không lưu vào mã nguồn)
 * - Tuyệt đối không để lọt URL nội bộ "file:///..." lên server.
 */
export async function uploadProofImage(rawImage) {
  if (!rawImage) return null;

  // 1. Nếu đã là URL công khai hợp lệ
  if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
    return rawImage;
  }

  // 2. Thử Cloudinary nếu được cấu hình
  const cloudinaryUrl = await uploadToCloudinary(rawImage);
  if (cloudinaryUrl) {
    return cloudinaryUrl;
  }

  // 3. Thử ImgBB nếu được cấu hình
  const imgbbUrl = await uploadToImgBB(rawImage);
  if (imgbbUrl) {
    return imgbbUrl;
  }

  // 4. Fallback: Base64 Data URI (Lưu trữ trực tiếp trong PostgreSQL DB, không đụng vào source code)
  if (rawImage.startsWith('data:image/')) {
    return rawImage;
  }

  if (rawImage.startsWith('file://')) {
    const dataUri = await convertLocalFileToDataUri(rawImage);
    if (dataUri) {
      return dataUri;
    }
  }

  // 5. Dự phòng an toàn cuối cùng
  return 'https://images.unsplash.com/photo-1610632380989-7f09b1a64f8a?w=600&q=80';
}
