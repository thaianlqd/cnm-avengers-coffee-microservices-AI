import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Users, Package, BarChart2, PlusCircle, CheckCircle, Clock } from 'lucide-react'
import { API_BASE_URL } from '../../admin-dashboard/constants'

function apiFetch(token, path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json() })
}

export function KioskDetailPanel({ kiosk, onBack, session }) {
  const token = session?.token || session?.accessToken || ''
  const isManager = session?.user?.vai_tro === 'MANAGER' || session?.user?.vaiTro === 'MANAGER'
  const managerBranch = session?.user?.coSoMa || session?.user?.co_so_ma || ''

  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'staff', 'combo'

  // Staff State
  const [staffList, setStaffList] = useState([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [staffForm, setStaffForm] = useState({ ho_ten: '', ten_dang_nhap: '', mat_khau: '' })
  const [creatingStaff, setCreatingStaff] = useState(false)

  // Combo State
  const [combos, setCombos] = useState([])
  const [loadingCombos, setLoadingCombos] = useState(false)
  const [comboForm, setComboForm] = useState({ ten_combo: '', mo_ta: '' })
  const [creatingCombo, setCreatingCombo] = useState(false)

  const loadCombos = useCallback(async () => {
    setLoadingCombos(true)
    try {
      const data = await apiFetch(token, `/inventory/kiosk-combos?ma_kiosk=${kiosk.ma_chi_nhanh}`)
      setCombos(Array.isArray(data) ? data : [])
    } catch { setCombos([]) }
    finally { setLoadingCombos(false) }
  }, [token, kiosk.ma_chi_nhanh])

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true)
    try {
      const data = await apiFetch(token, `/users/workforce?branch_code=${kiosk.ma_chi_nhanh}`)
      setStaffList(data && Array.isArray(data.items) ? data.items : [])
    } catch { setStaffList([]) }
    finally { setLoadingStaff(false) }
  }, [token, kiosk.ma_chi_nhanh])

  useEffect(() => {
    if (activeTab === 'combo') loadCombos()
    if (activeTab === 'staff') loadStaff()
  }, [activeTab, loadCombos, loadStaff])

  const handleCreateStaff = async () => {
    if (!staffForm.ten_dang_nhap || !staffForm.mat_khau) return alert('Nhập username & password')
    setCreatingStaff(true)
    try {
      await apiFetch(token, '/users/manager/kiosk-staff', {
        method: 'POST',
        body: JSON.stringify({ ...staffForm, co_so_ma: kiosk.ma_chi_nhanh }),
      })
      alert('Tạo nhân viên thành công!')
      setStaffForm({ ho_ten: '', ten_dang_nhap: '', mat_khau: '' })
      loadStaff() // Tải lại danh sách sau khi tạo
    } catch (e) { alert(e?.message || 'Lỗi tạo NV') }
    finally { setCreatingStaff(false) }
  }

  const handleSendCombo = async () => {
    if (!comboForm.ten_combo) return alert('Nhập tên combo')
    setCreatingCombo(true)
    try {
      await apiFetch(token, '/inventory/kiosk-combos', {
        method: 'POST',
        body: JSON.stringify({ ma_chi_nhanh_me: managerBranch, ma_kiosk: kiosk.ma_chi_nhanh, ...comboForm }),
      })
      alert('Giao combo thành công!')
      setComboForm({ ten_combo: '', mo_ta: '' })
      loadCombos()
    } catch (e) { alert(e?.message || 'Lỗi giao combo') }
    finally { setCreatingCombo(false) }
  }

  return (
    <div style={{ padding: '1.5rem', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', minHeight: 500 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', marginBottom: '1.5rem', fontSize: 13, fontWeight: 600 }}>
        <ArrowLeft size={16} /> Quay lại danh sách
      </button>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{kiosk.ten_chi_nhanh}</h2>
        <p style={{ margin: 0, color: '#64748b' }}>Mã: <strong style={{ color: '#4f46e5' }}>{kiosk.ma_chi_nhanh}</strong> • Địa chỉ: {kiosk.dia_chi}</p>
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid #f1f5f9', marginBottom: '1.5rem' }}>
        {[
          { id: 'overview', icon: BarChart2, label: 'Thống kê' },
          { id: 'staff', icon: Users, label: 'Nhân viên Kiosk' },
          { id: 'combo', icon: Package, label: 'Giao Combo Nguyên liệu' }
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: activeTab === t.id ? '#ea580c' : '#64748b', borderBottom: activeTab === t.id ? '2px solid #ea580c' : '2px solid transparent', marginBottom: -2 }}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '1rem' }}>
            <div style={{ background: '#fff7ed', padding: '1.5rem', borderRadius: 16, border: '1px solid #fed7aa', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#ea580c', fontSize: 14, fontWeight: 700 }}>DOANH THU HÔM NAY</div>
              <div style={{ color: '#431407', fontSize: 32, fontWeight: 800 }}>0 ₫</div>
              <div style={{ color: '#9a3412', fontSize: 13 }}>Chưa có dữ liệu giao dịch</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: '1.5rem', borderRadius: 16, border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 700 }}>ĐƠN HÀNG HOÀN THÀNH</div>
              <div style={{ color: '#14532d', fontSize: 32, fontWeight: 800 }}>0</div>
              <div style={{ color: '#166534', fontSize: 13 }}>Tỷ lệ thành công: 0%</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#475569', fontSize: 14, fontWeight: 700 }}>COMBO NGUYÊN LIỆU TỒN</div>
              <div style={{ color: '#0f172a', fontSize: 32, fontWeight: 800 }}>{combos.filter(c => c.trang_thai === 'RECEIVED').length}</div>
              <div style={{ color: '#334155', fontSize: 13 }}>Đã nhận trong tháng này</div>
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
            {isManager && (
              <div style={{ background: '#fff7ed', padding: '1.5rem', borderRadius: 12, border: '1px solid #fed7aa' }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: 15, fontWeight: 700, color: '#ea580c' }}>Tạo tài khoản Kiosk Staff</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input value={staffForm.ho_ten} onChange={e => setStaffForm(f => ({...f, ho_ten: e.target.value}))} placeholder="Họ tên (tuỳ chọn)" style={{ padding: 10, borderRadius: 8, border: '1px solid #fbd38d' }} />
                  <input value={staffForm.ten_dang_nhap} onChange={e => setStaffForm(f => ({...f, ten_dang_nhap: e.target.value}))} placeholder="Tên đăng nhập *" style={{ padding: 10, borderRadius: 8, border: '1px solid #fbd38d' }} />
                  <input type="password" value={staffForm.mat_khau} onChange={e => setStaffForm(f => ({...f, mat_khau: e.target.value}))} placeholder="Mật khẩu *" style={{ padding: 10, borderRadius: 8, border: '1px solid #fbd38d' }} />
                  <button onClick={handleCreateStaff} disabled={creatingStaff} style={{ padding: '10px', background: '#ea580c', color: 'white', borderRadius: 8, border: 'none', fontWeight: 700, cursor: creatingStaff ? 'not-allowed' : 'pointer' }}>
                    {creatingStaff ? 'Đang tạo...' : 'Tạo Kiosk Staff'}
                  </button>
                </div>
              </div>
            )}
            <div>
              <h4 style={{ margin: '0 0 1rem', fontSize: 15, fontWeight: 700 }}>Danh sách nhân viên</h4>
              {loadingStaff ? <p>Đang tải...</p> : staffList.length === 0 ? <p style={{ color: '#94a3b8' }}>Chưa có nhân viên nào.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {staffList.map(s => (
                    <div key={s.ma_nguoi_dung} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 12, background: '#fff7ed' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                        {(s.ho_ten || s.ten_dang_nhap).charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#431407', fontSize: 14 }}>{s.ho_ten || s.ten_dang_nhap}</div>
                        <div style={{ fontSize: 12, color: '#9a3412' }}>@{s.ten_dang_nhap}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>
                        Hoạt động
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'combo' && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem' }}>
            {isManager && (
              <div style={{ background: '#fff7ed', padding: '1.5rem', borderRadius: 12, border: '1px solid #fed7aa' }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: 15, fontWeight: 700, color: '#ea580c' }}>Giao Combo mới</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input value={comboForm.ten_combo} onChange={e => setComboForm(f => ({...f, ten_combo: e.target.value}))} placeholder="Tên Combo (VD: Combo sáng 09/09) *" style={{ padding: 10, borderRadius: 8, border: '1px solid #fbd38d' }} />
                  <textarea value={comboForm.mo_ta} onChange={e => setComboForm(f => ({...f, mo_ta: e.target.value}))} placeholder="Mô tả chi tiết nguyên liệu..." rows={3} style={{ padding: 10, borderRadius: 8, border: '1px solid #fbd38d', resize: 'vertical' }} />
                  <button onClick={handleSendCombo} disabled={creatingCombo} style={{ padding: '10px', background: '#ea580c', color: 'white', borderRadius: 8, border: 'none', fontWeight: 700, cursor: creatingCombo ? 'not-allowed' : 'pointer' }}>
                    {creatingCombo ? 'Đang giao...' : 'Giao Combo'}
                  </button>
                </div>
              </div>
            )}
            <div>
              <h4 style={{ margin: '0 0 1rem', fontSize: 15, fontWeight: 700 }}>Lịch sử giao Combo</h4>
              {loadingCombos ? <p>Đang tải...</p> : combos.length === 0 ? <p style={{ color: '#94a3b8' }}>Chưa có phiếu giao nào.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {combos.map(c => (
                    <div key={c.id} style={{ padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong style={{ display: 'block', fontSize: 15 }}>{c.ten_combo}</strong>
                        <span style={{ fontSize: 13, color: '#64748b' }}>Giao lúc: {new Date(c.thoi_gian_giao).toLocaleString('vi-VN')}</span>
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: c.trang_thai === 'RECEIVED' ? '#dcfce7' : '#fff7ed', color: c.trang_thai === 'RECEIVED' ? '#16a34a' : '#ea580c' }}>
                        {c.trang_thai === 'RECEIVED' ? 'Đã nhận' : 'Chờ xác nhận'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
