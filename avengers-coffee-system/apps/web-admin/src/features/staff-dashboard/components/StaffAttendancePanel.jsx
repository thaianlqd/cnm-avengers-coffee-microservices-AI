import { useEffect, useState } from 'react';

const API_BASE_URL = `http://${window.location.hostname}:8080/api`;

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || 'Yeu cau that bai';
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }

  return data;
}

/**
 * StaffAttendancePanel - Chấm Công / Check In-Out
 * Cho phép nhân viên check-in/check-out vào ca làm việc hôm nay
 */
export default function StaffAttendancePanel() {
  const [todayShift, setTodayShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const session = JSON.parse(localStorage.getItem('adminSession') || '{}');
  const staffUsername = session.user?.username || '';
  const staffName = session.user?.fullname || staffUsername;
  const branchCode = session.user?.co_so_ma || 'CHI_NHANH_1';
  const today = new Date().toISOString().split('T')[0];

  // Tải ca làm việc hôm nay
  useEffect(() => {
    const loadTodayShift = async () => {
      try {
        setLoading(true);
        const resp = await requestJson(
          `${API_BASE_URL}/staff/work-shifts?staff_username=${staffUsername}&from=${today}&to=${today}&branch_code=${branchCode}`
        );
        const shifts = resp.items || [];
        if (shifts.length > 0) {
          setTodayShift(shifts[0]); // Lấy ca đầu tiên hôm nay
        } else {
          setError('Hôm nay bạn không có ca làm việc nào.');
        }
      } catch (err) {
        console.error('Load today shift error:', err);
        setError(`Lỗi: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (staffUsername) {
      loadTodayShift();
    }
  }, [staffUsername, today, branchCode]);

  const handleCheckIn = async () => {
    if (!todayShift) return;
    try {
      setChecking(true);
      setError('');
      setMessage('');

      const payload = {
        shift_id: todayShift.ma_ca_lam_viec,
        action: 'CHECK_IN',
        branch_code: branchCode,
      };

      console.log('🔹 Staff checking in:', payload);
      const response = await requestJson(
        `${API_BASE_URL}/staff/work-shifts/self/attendance`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      console.log('✅ Check-in response:', response);
      setMessage('✅ Chấm công vào thành công!');
      setTodayShift({ ...todayShift, check_in_at: new Date() });

      // Reload sau 2 giây
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('❌ Check-in error:', err);
      setError(`Lỗi check-in: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todayShift) return;
    try {
      setChecking(true);
      setError('');
      setMessage('');

      const payload = {
        shift_id: todayShift.ma_ca_lam_viec,
        action: 'CHECK_OUT',
        branch_code: branchCode,
      };

      console.log('🔹 Staff checking out:', payload);
      const response = await requestJson(
        `${API_BASE_URL}/staff/work-shifts/self/attendance`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      console.log('✅ Check-out response:', response);
      setMessage('✅ Chấm công ra thành công!');
      setTodayShift({ ...todayShift, check_out_at: new Date() });

      // Reload sau 2 giây
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('❌ Check-out error:', err);
      setError(`Lỗi check-out: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  // Format time
  const formatTime = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN');
  };

  if (loading) {
    return (
      <div className="staff-attendance-panel">
        <div className="staff-attendance-loading">⏳ Đang tải dữ liệu...</div>
      </div>
    );
  }

  if (!todayShift) {
    return (
      <div className="staff-attendance-panel staff-attendance-empty">
        <div className="staff-attendance-message-error">⚠️ {error || 'Không có ca làm việc hôm nay'}</div>
      </div>
    );
  }

  const hasCheckedIn = !!todayShift.check_in_at;
  const hasCheckedOut = !!todayShift.check_out_at;
  const status = todayShift.trang_thai_cham_cong || 'ASSIGNED';

  return (
    <div className="staff-attendance-panel">
      <div className="staff-attendance-header">
        <h2>📋 Chấm Công - {today}</h2>
        <p>Xin chào, {staffName}!</p>
      </div>

      <div className="staff-attendance-card">
        <div className="staff-attendance-shift-info">
          <div className="shift-info-item">
            <span className="shift-info-label">Ca làm việc:</span>
            <strong className="shift-info-value">{todayShift.ten_ca}</strong>
          </div>
          <div className="shift-info-item">
            <span className="shift-info-label">Giờ bắt đầu:</span>
            <strong className="shift-info-value">{todayShift.gio_bat_dau}</strong>
          </div>
          <div className="shift-info-item">
            <span className="shift-info-label">Giờ kết thúc:</span>
            <strong className="shift-info-value">{todayShift.gio_ket_thuc}</strong>
          </div>
          <div className="shift-info-item">
            <span className="shift-info-label">Chi nhánh:</span>
            <strong className="shift-info-value">{branchCode}</strong>
          </div>
        </div>

        <div className="staff-attendance-status">
          <div className={`status-badge status-${status.toLowerCase()}`}>
            {status === 'PRESENT' && '✅ Có mặt'}
            {status === 'LATE' && '⏱️ Đi trễ'}
            {status === 'ABSENT' && '❌ Vắng'}
            {status === 'ASSIGNED' && '⏳ Chưa chấm công'}
          </div>
        </div>

        <div className="staff-attendance-times">
          <div className="time-row">
            <span className="time-label">Thời gian check-in:</span>
            <span className="time-value">{formatTime(todayShift.check_in_at)}</span>
          </div>
          <div className="time-row">
            <span className="time-label">Thời gian check-out:</span>
            <span className="time-value">{formatTime(todayShift.check_out_at)}</span>
          </div>
        </div>

        <div className="staff-attendance-actions">
          <button
            className="btn-attendance btn-checkin"
            onClick={handleCheckIn}
            disabled={checking || hasCheckedIn}
            title={hasCheckedIn ? 'Đã check-in rồi' : 'Check-in vào ca làm việc'}
          >
            {checking ? '⏳ Đang xử lý...' : '▶️ Check In'}
          </button>

          <button
            className="btn-attendance btn-checkout"
            onClick={handleCheckOut}
            disabled={checking || !hasCheckedIn || hasCheckedOut}
            title={
              !hasCheckedIn ? 'Phải check-in trước' : hasCheckedOut ? 'Đã check-out rồi' : 'Check-out khỏi ca làm việc'
            }
          >
            {checking ? '⏳ Đang xử lý...' : '⏹️ Check Out'}
          </button>
        </div>

        {message && <div className="staff-attendance-message-success">{message}</div>}
        {error && <div className="staff-attendance-message-error">{error}</div>}
      </div>

      <div className="staff-attendance-note">
        <strong>💡 Lưu ý:</strong>
        <ul>
          <li>✓ Bạn có thể check-in từ 30 phút trước giờ ca</li>
          <li>✓ Check-out chỉ có thể sau khi check-in</li>
          <li>✓ Quản lý sẽ duyệt và xác nhận thời gian chấm công của bạn</li>
          <li>✓ Nếu có vấn đề, vui lòng liên hệ quản lý chi nhánh</li>
        </ul>
      </div>
    </div>
  );
}
