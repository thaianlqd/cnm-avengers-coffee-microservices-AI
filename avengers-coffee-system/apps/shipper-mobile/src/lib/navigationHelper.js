import { Linking, Platform } from 'react-native';

/**
 * Mở trực tiếp ứng dụng Google Maps (hoặc website Google Maps) để chỉ đường.
 * Tuyệt đối không bao giờ mở Apple Maps trên iOS.
 * 
 * @param {string} destinationAddress - Địa chỉ giao hàng đầy đủ
 * @param {object} coords - { latitude, longitude } (nếu có)
 */
export async function openGoogleMapsNavigation(destinationAddress, coords = null) {
  const cleanAddr = String(destinationAddress || '').trim();
  const encodedAddr = encodeURIComponent(cleanAddr);

  // Ưu tiên truyền địa chỉ dạng chuỗi để Google Maps tự động tìm kiếm số nhà chính xác nhất
  const destParam = encodedAddr || (coords?.latitude && coords?.longitude ? `${coords.latitude},${coords.longitude}` : '');
  if (!destParam) return;

  // 1. URL Scheme mở trực tiếp ứng dụng Google Maps
  const appSchemeUrl = Platform.OS === 'ios'
    ? `comgooglemaps://?daddr=${destParam}&directionsmode=driving`
    : `google.navigation:q=${destParam}&mode=d`;

  // 2. Web URL mở Google Maps qua trình duyệt (Safari/Chrome) nếu chưa cài app Google Maps
  const webGoogleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destParam}&travelmode=driving`;

  if (Platform.OS === 'ios') {
    // Thử kiểm tra và mở ứng dụng Google Maps nếu đã cài trên iPhone
    try {
      const canOpen = await Linking.canOpenURL('comgooglemaps://').catch(() => false);
      if (canOpen) {
        await Linking.openURL(appSchemeUrl);
        return;
      }
    } catch (e) {
      // bỏ qua
    }

    // Khi chạy trên Expo Go, canOpenURL thường trả về false do chưa whitelist comgooglemaps trong binary của Expo Go.
    // Vì vậy ta chủ động gọi openURL(appSchemeUrl) trong try-catch: nếu máy có app Google Maps thì sẽ mở ngay.
    try {
      await Linking.openURL(appSchemeUrl);
      return;
    } catch (e) {
      // Máy iPhone chưa cài app Google Maps -> mở website Google Maps qua Safari (tuyệt đối không mở Apple Maps)
    }

    try {
      await Linking.openURL(webGoogleMapsUrl);
    } catch (err) {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${destParam}`);
    }
    return;
  }

  // Trên Android:
  try {
    const isAppInstalled = await Linking.canOpenURL(appSchemeUrl).catch(() => false);
    if (isAppInstalled) {
      await Linking.openURL(appSchemeUrl);
      return;
    }
  } catch (e) {
    // bỏ qua lỗi kiểm tra scheme
  }

  try {
    await Linking.openURL(appSchemeUrl);
  } catch (e) {
    await Linking.openURL(webGoogleMapsUrl);
  }
}
