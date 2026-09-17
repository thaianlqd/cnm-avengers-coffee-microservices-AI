import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';

export const BACKGROUND_LOCATION_TASK = 'AVENGERS_SHIPPER_BACKGROUND_LOCATION';
const SESSION_KEY = 'avengers_shipper_session';

// Đăng ký Background Task ở cấp độ module (top-level) để Expo runtime load ngay khi khởi động app
try {
  if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      if (error) {
        console.warn('[BackgroundLocation Task Error]:', error.message);
        return;
      }

      if (data && data.locations && data.locations.length > 0) {
        const latest = data.locations[data.locations.length - 1];
        if (!latest?.coords) return;

        try {
          const sessionData = await AsyncStorage.getItem(SESSION_KEY);
          if (!sessionData) return;

          const { shipper } = JSON.parse(sessionData);
          if (shipper?.id) {
            await apiClient.patch(`/shippers/${shipper.id}/location`, {
              latitude: latest.coords.latitude,
              longitude: latest.coords.longitude,
            });
            console.log(`[BackgroundLocation] Đã cập nhật GPS ngầm: ${latest.coords.latitude.toFixed(5)}, ${latest.coords.longitude.toFixed(5)}`);
          }
        } catch (apiErr) {
          // Bỏ qua lỗi mạng tạm thời trong background để không crash task
        }
      }
    });
  }
} catch (taskErr) {
  console.warn('[BackgroundLocation] Lỗi khi định nghĩa task:', taskErr?.message);
}

/**
 * Bắt đầu theo dõi vị trí dưới nền (Background Location Tracking).
 * Hoạt động ngay cả khi shipper chuyển qua Google Maps hoặc tắt màn hình.
 */
export async function startBackgroundLocationTracking(shipperId) {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isRunning) {
      return { success: true, alreadyRunning: true };
    }

    // 1. Kiểm tra quyền Foreground (Khi dùng app)
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      return { success: false, reason: 'foreground_permission_denied' };
    }

    // 2. Kiểm tra quyền Background (Luôn cho phép)
    let bgGranted = false;
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      bgGranted = bg.status === 'granted';
    } catch (e) {
      bgGranted = false;
    }

    // 3. Khởi chạy Location Updates ngầm
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: true, // Hiện dải xanh định vị trên thanh trạng thái iOS
      pausesLocationUpdatesAutomatically: false,
      activityType: Location.ActivityType?.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'Avengers Coffee - Đang giao hàng',
        notificationBody: 'Hệ thống đang chia sẻ vị trí của bạn cho khách hàng theo dõi',
        notificationColor: '#2563EB',
      },
    });

    console.log('[BackgroundLocation] Đã bật chế độ theo dõi GPS chạy nền thành công.');
    return { success: true, bgGranted };
  } catch (err) {
    // Trường hợp chạy trên Expo Go chuẩn (chưa build standalone / dev client), startLocationUpdatesAsync có thể báo lỗi
    console.warn('[BackgroundLocation] Không thể khởi chạy background task (có thể do môi trường Expo Go):', err.message);
    return { success: false, isExpoGo: true, error: err.message };
  }
}

/**
 * Dừng theo dõi vị trí dưới nền khi hoàn thành đơn giao hàng.
 */
export async function stopBackgroundLocationTracking() {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[BackgroundLocation] Đã dừng theo dõi GPS chạy nền.');
    }
  } catch (err) {
    // Bỏ qua lỗi dừng
  }
}

/**
 * Kiểm tra xem tác vụ chạy nền có đang kích hoạt không.
 */
export async function isBackgroundLocationActive() {
  return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
}
