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
 * ManagerAttendanceVerificationPanel - Duyệt & Xác nhận Chấm Công
 * Manager xem lại chấm công của nhân viên và xác nhận "Đúng giờ", "Đi trễ", hoặc "Vắng"
 */
export default function ManagerAttendanceVerificationPanel() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(null);
  const [expandedShiftId, setExpandedShiftId] = useState(null);
  const [notes, setNotes] = useState({});

  const session = JSON.parse(localStorage.getItem('adminSession') || '{}');
  const managerUsername = session.user?.username || '';
  const branchCode = session.user?.co_so_ma || 'CHI_NHANH_1';
  const today = new Date().toISOString().split('T')[0];

  // Tải danh sách ca làm việc hôm nay của các nhân viên
  useEffect(() => {
    const loadTodayShifts = async () => {
      try {
        setLoading(true);
        // Lấy tất cả ca hôm nay (có thể filter thêm chi nhánh)
        const resp = await requestJson(
          `${API_BASE_URL}/manager/work-shifts?from=${today}&to=${today}&branch_code=${branchCode}`
        );
        const allShifts = resp.items || [];
        // Filter chỉ lấy các ca có staff_username != manager (không lấy shift của chính mình)
        const staffShifts = allShifts.filter((s) => s.staff_username !== managerUsername);
        setShifts(staffShifts);
      } catch (err) {
        console.error('Load shifts error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (managerUsername) {
      loadTodayShifts();
    }
  }, [managerUsername, today, branchCode]);

  const handleVerify = async (shiftId, verifyStatus) => {
    try {
      setVerifying(shiftId);
      const payload = {
        verify_status: verifyStatus,
        verify_note: notes[shiftId] || '',
        branch_code: branchCode,
      };

      console.log('🔹 Manager verifying attendance:', { shiftId, ...payload });
      const response = await requestJson(
        `${API_BASE_URL}/manager/attendance/verify/${shiftId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      console.log('✅ Verify response:', response);
      // Update shift status in the list
      setShifts((prev) =>
        prev.map((s) =>
          s.ma_ca_lam_viec === shiftId
            ? { ...s, trang_thai_cham_cong: verifyStatus, verified_at: new Date() }
            : s
        )
      );
      setExpandedShiftId(null);
      setNotes((prev) => {
        const copy = { ...prev };
        delete copy[shiftId];
        return copy;
      });
    } catch (err) {
      console.error('❌ Verify error:', err);
      alert(`Lỗi: ${err.message}`);
    } finally {
      setVerifying(null);
    }
  };

  const formatTime = (date) => {
    if (!date) return 'Chưa check-in';
    const d = new Date(date);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'PRESENT':
        return { icon: '✅', label: 'Có mặt', color: '#1f7a4f' };
      case 'LATE':
        return { icon: '⏱️', label: 'Đi trễ', color: '#b87208' };
      case 'ABSENT':
        return { icon: '❌', label: 'Vắng mặt', color: '#b42318' };
      default:
        return { icon: '⏳', label: 'Chưa xác nhận', color: '#9a7a65' };
    }
  };

  if (loading) {
    return <div className="manager-attendance-panel manager-attendance-loading">⏳ Đang tải dữ liệu...</div>;
  }

  if (shifts.length === 0) {
    return (
      <div className="manager-attendance-panel manager-attendance-empty">
        <div className="manager-attendance-message">⚠️ Hôm nay không có ca làm việc nào của nhân viên.</div>
      </div>
    );
  }

  return (
    <div className="manager-attendance-panel">
      <div className="manager-attendance-header">
        <h2>👁️ Duyệt & Xác nhận Chấm Công - {today}</h2>
        <p>Kiểm tra thời gian check-in/out và xác nhận chấm công của nhân viên</p>
      </div>

      <div className="manager-attendance-summary">
        <div className="summary-card summary-total">
          <span className="summary-label">Tổng ca làm:</span>
          <strong className="summary-value">{shifts.length}</strong>
        </div>
        <div className="summary-card summary-verified">
          <span className="summary-label">Đã xác nhận:</span>
          <strong className="summary-value">{shifts.filter((s) => s.trang_thai_cham_cong !== 'ASSIGNED').length}</strong>
        </div>
        <div className="summary-card summary-pending">
          <span className="summary-label">Chờ xác nhận:</span>
          <strong className="summary-value">{shifts.filter((s) => s.trang_thai_cham_cong === 'ASSIGNED').length}</strong>
        </div>
      </div>

      <div className="manager-attendance-list">
        {shifts.map((shift) => {
          const statusInfo = getStatusDisplay(shift.trang_thai_cham_cong);
          const isExpanded = expandedShiftId === shift.ma_ca_lam_viec;
          const isVerifying = verifying === shift.ma_ca_lam_viec;

          return (
            <div
              key={shift.ma_ca_lam_viec}
              className={`manager-attendance-card ${
                shift.trang_thai_cham_cong !== 'ASSIGNED' ? 'verified' : 'pending'
              }`}
            >
              {/* Header */}
              <div className="manager-attendance-card-header">
                <div className="card-info-left">
                  <div className="staff-name-badge">
                    <strong>{shift.staff_name}</strong>
                    <span className="staff-code">{shift.staff_username}</span>
                  </div>
                  <div className="shift-brief">
                    <span className="shift-time-badge">{shift.ten_ca}</span>
                    <span className="shift-slot">{shift.gio_bat_dau} - {shift.gio_ket_thuc}</span>
                  </div>
                </div>

                <div className="card-status-badge" style={{ color: statusInfo.color }}>
                  <span className="status-icon">{statusInfo.icon}</span>
                  <span className="status-label">{statusInfo.label}</span>
                </div>
              </div>

              {/* Check-in/out Times */}
              <div className="manager-attendance-times">
                <div className="time-cell">
                  <span className="time-label">Check-in:</span>
                  <span className="time-value">{formatTime(shift.check_in_at)}</span>
                </div>
                <div className="time-cell">
                  <span className="time-label">Check-out:</span>
                  <span className="time-value">{formatTime(shift.check_out_at)}</span>
                </div>
              </div>

              {/* Expand/Verify Section */}
              {shift.trang_thai_cham_cong === 'ASSIGNED' && (
                <>
                  <button
                    type="button"
                    className="manager-attendance-expand-btn"
                    onClick={() => setExpandedShiftId(isExpanded ? null : shift.ma_ca_lam_viec)}
                  >
                    {isExpanded ? '▼ Ẩn xác nhận' : '▶ Xác nhận'} ({shift.staff_name})
                  </button>

                  {isExpanded && (
                    <div className="manager-attendance-verification-form">
                      <div className="verify-options">
                        <label className="verify-option">
                          <input
                            type="radio"
                            name={`verify-${shift.ma_ca_lam_viec}`}
                            value="PRESENT"
                            defaultChecked
                          />
                          <span className="verify-label">✅ Đúng giờ</span>
                        </label>

                        <label className="verify-option">
                          <input
                            type="radio"
                            name={`verify-${shift.ma_ca_lam_viec}`}
                            value="LATE"
                          />
                          <span className="verify-label">⏱️ Đi trễ</span>
                        </label>

                        <label className="verify-option">
                          <input
                            type="radio"
                            name={`verify-${shift.ma_ca_lam_viec}`}
                            value="ABSENT"
                          />
                          <span className="verify-label">❌ Vắng mặt</span>
                        </label>
                      </div>

                      <textarea
                        className="verify-note-input"
                        placeholder="Ghi chú (nếu có)... ví dụ: Đi trễ 15 phút vì sự cố giao thông"
                        value={notes[shift.ma_ca_lam_viec] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [shift.ma_ca_lam_viec]: e.target.value }))}
                      />

                      <div className="verify-actions">
                        <button
                          type="button"
                          className="btn-verify-submit"
                          onClick={() => {
                            const selected = document.querySelector(
                              `input[name="verify-${shift.ma_ca_lam_viec}"]:checked`
                            );
                            if (selected) {
                              handleVerify(shift.ma_ca_lam_viec, selected.value);
                            }
                          }}
                          disabled={isVerifying}
                        >
                          {isVerifying ? '⏳ Đang gửi...' : '📤 Xác nhận'}
                        </button>

                        <button
                          type="button"
                          className="btn-verify-cancel"
                          onClick={() => setExpandedShiftId(null)}
                          disabled={isVerifying}
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {shift.trang_thai_cham_cong !== 'ASSIGNED' && (
                <div className="manager-attendance-verified-badge">
                  Đã xác nhận: {shift.trang_thai_cham_cong === 'PRESENT' && 'Đúng giờ'}
                  {shift.trang_thai_cham_cong === 'LATE' && 'Đi trễ'}
                  {shift.trang_thai_cham_cong === 'ABSENT' && 'Vắng mặt'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="manager-attendance-note">
        <strong>📌 Hướng dẫn:</strong>
        <ul>
          <li>✓ Kiểm tra thời gian check-in/out của từng nhân viên</li>
          <li>✓ Chọn trạng thái phù hợp: "Đúng giờ", "Đi trễ", hoặc "Vắng mặt"</li>
          <li>✓ Ghi chú lý do nếu nhân viên đi trễ hoặc vắng</li>
          <li>✓ Bấm "Xác nhận" để lưu lại trạng thái chấm công ngày hôm nay</li>
        </ul>
      </div>
    </div>
  );
}
