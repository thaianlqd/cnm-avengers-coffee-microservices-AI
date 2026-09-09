import { useState, useEffect, useCallback } from 'react'
import { MapPin, Store, Plus, Edit2, RefreshCw, ChevronDown, ChevronRight, Map, X, Check, UserPlus, Package, PackageCheck } from 'lucide-react'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { KioskDetailPanel } from './KioskDetailPanel'

const LOAI_VI_TRI_META = {
  TRUNG_TAM_TM:  { label: 'Trung tâm TM',   color: '#6366f1', bg: '#eef2ff' },
  VIA_HE:        { label: 'Vỉa hè',          color: '#f59e0b', bg: '#fffbeb' },
  CONG_TRUONG:   { label: 'Cổng trường',     color: '#10b981', bg: '#ecfdf5' },
  TOA_VAN_PHONG: { label: 'Tòa văn phòng',   color: '#3b82f6', bg: '#eff6ff' },
  KHU_DAN_CU:    { label: 'Khu dân cư',      color: '#8b5cf6', bg: '#f5f3ff' },
}

function apiFetch(token, path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json() })
}

const DEFAULT_FORM = {
  ma_chi_nhanh: '', ten_chi_nhanh: '', dia_chi: '', thanh_pho: 'Hồ Chí Minh',
  gio_mo_cua: '07:00', gio_dong_cua: '22:00', loai_vi_tri: 'TRUNG_TAM_TM',
  vi_do: '', kinh_do: '', khu_vuc_id: '', chi_nhanh_me_ma: '', mo_ta: '',
}

const DEFAULT_STAFF_FORM = { ho_ten: '', ten_dang_nhap: '', mat_khau: '', co_so_ma: '' }
const DEFAULT_COMBO_FORM = { ten_combo: '', mo_ta: '' }

export function AdminSatelliteKioskPanel({ session }) {
  const token = session?.token || session?.accessToken || ''
  const isManager = session?.user?.vai_tro === 'MANAGER' || session?.user?.vaiTro === 'MANAGER'
  const [zones, setZones] = useState([])
  const [kiosks, setKiosks] = useState([])
  const [standardBranches, setStandardBranches] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('list')
  const [filterZone, setFilterZone] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [editingMa, setEditingMa] = useState(null)
  const [expandedZone, setExpandedZone] = useState(null)

  // ── Xem chi tiết Kiosk ──
  const [selectedKiosk, setSelectedKiosk] = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [zonesData, kiosksData, statsData, branchesData] = await Promise.all([
        apiFetch(token, '/admin/zones'),
        apiFetch(token, '/admin/satellite-kiosks'),
        apiFetch(token, '/admin/satellite-kiosks/stats'),
        apiFetch(token, '/users/admin/branches'),
      ])
      setZones(Array.isArray(zonesData) ? zonesData : [])
      setKiosks(Array.isArray(kiosksData) ? kiosksData : [])
      setStats(statsData)
      
      const allBranches = branchesData?.items || []
      const stdBranches = allBranches.filter(b => b.loai_diem_ban === 'CHI_NHANH_CHINH' || !b.loai_diem_ban)
      setStandardBranches(stdBranches)
    } catch { setError('Không thể tải dữ liệu.') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadAll() }, [loadAll])

  const filteredKiosks = kiosks.filter(k => {
    if (filterZone && k.khu_vuc?.id !== filterZone) return false
    if (filterStatus && k.trang_thai !== filterStatus) return false
    return true
  })

  const handleSave = async () => {
    if (!form.ten_chi_nhanh?.trim() || !form.dia_chi?.trim()) {
      setError('Vui lòng nhập tên và địa chỉ.'); return
    }
    setSaving(true); setError(null)
    try {
      const payload = {
        ...form,
        vi_do: form.vi_do ? parseFloat(form.vi_do) : undefined,
        kinh_do: form.kinh_do ? parseFloat(form.kinh_do) : undefined,
      }
      if (editingMa) {
        await apiFetch(token, `/admin/satellite-kiosks/${editingMa}`, { method: 'PATCH', body: JSON.stringify(payload) })
        setSuccess('Cập nhật thành công!')
      } else {
        await apiFetch(token, '/admin/satellite-kiosks', { method: 'POST', body: JSON.stringify(payload) })
        setSuccess('Tạo kiosk mới thành công!')
      }
      setShowForm(false); setForm(DEFAULT_FORM); setEditingMa(null); await loadAll()
    } catch (e) { setError(e?.message || 'Lưu thất bại.') }
    finally { setSaving(false); setTimeout(() => setSuccess(null), 4000) }
  }

  const startEdit = (k) => {
    setForm({
      ma_chi_nhanh: k.ma_chi_nhanh, ten_chi_nhanh: k.ten_chi_nhanh || '',
      dia_chi: k.dia_chi || '', thanh_pho: k.thanh_pho || '',
      gio_mo_cua: k.gio_mo_cua || '07:00', gio_dong_cua: k.gio_dong_cua || '22:00',
      loai_vi_tri: k.loai_vi_tri || 'TRUNG_TAM_TM',
      vi_do: k.vi_do || '', kinh_do: k.kinh_do || '',
      khu_vuc_id: k.khu_vuc?.id || '', chi_nhanh_me_ma: k.chi_nhanh_me_ma || '', mo_ta: k.mo_ta || '',
    })
    setEditingMa(k.ma_chi_nhanh); setShowForm(true)
  }

  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
  const lbl = { fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu kiosk...</div>

  if (selectedKiosk) {
    return <KioskDetailPanel kiosk={selectedKiosk} onBack={() => setSelectedKiosk(null)} session={session} />
  }

  return (
    <div className="panel system-admin-panel" style={{ padding: '1.5rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #4f46e5, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' }}>
            <MapPin size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Kiosk Vệ Tinh Nội Bộ</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Quản lý {kiosks.length} điểm bán takeaway trực thuộc công ty — {zones.length} khu vực</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadAll} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} /> Làm mới
          </button>
          <button onClick={() => { setForm(DEFAULT_FORM); setEditingMa(null); setShowForm(true) }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <Plus size={14} /> Thêm kiosk mới
          </button>
        </div>
      </div>

      {/* ALERTS */}
      {error && (
        <div style={{ padding: '10px 16px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <X size={14} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 16px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} /> {success}
        </div>
      )}

      {/* VIEW TABS */}
      <div style={{ display: 'flex', marginBottom: '1.25rem', borderBottom: '2px solid #f1f5f9' }}>
        {[{ id: 'list', label: 'Danh sách Kiosk' }, { id: 'stats', label: 'Thống kê Zone' }, { id: 'zones', label: 'Khu vực' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveView(tab.id)} style={{ padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: activeView === tab.id ? '#4f46e5' : '#64748b', borderBottom: activeView === tab.id ? '2px solid #4f46e5' : '2px solid transparent', marginBottom: -2 }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* FORM MODAL */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '2rem', width: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{editingMa ? 'Cập nhật Kiosk Vệ Tinh' : 'Tạo Kiosk Vệ Tinh Mới'}</h3>
              <button onClick={() => { setShowForm(false); setError(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {!editingMa && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Mã Kiosk *</label>
                  <input value={form.ma_chi_nhanh} onChange={e => setForm(f => ({ ...f, ma_chi_nhanh: e.target.value.toUpperCase() }))} placeholder="VD: KVT011" style={inp} />
                </div>
              )}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Tên Kiosk *</label>
                <input value={form.ten_chi_nhanh} onChange={e => setForm(f => ({ ...f, ten_chi_nhanh: e.target.value }))} placeholder="VD: Avengers Coffee - Landmark 81" style={inp} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Địa chỉ *</label>
                <input value={form.dia_chi} onChange={e => setForm(f => ({ ...f, dia_chi: e.target.value }))} placeholder="Tầng, tòa nhà, phường, quận..." style={inp} />
              </div>
              <div>
                <label style={lbl}>Loại vị trí</label>
                <select value={form.loai_vi_tri} onChange={e => setForm(f => ({ ...f, loai_vi_tri: e.target.value }))} style={inp}>
                  {Object.entries(LOAI_VI_TRI_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Khu vực (Zone)</label>
                <select value={form.khu_vuc_id} onChange={e => setForm(f => ({ ...f, khu_vuc_id: e.target.value }))} style={inp}>
                  <option value="">-- Chưa phân --</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.ten_khu_vuc}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Chi nhánh mẹ</label>
                <select value={form.chi_nhanh_me_ma} onChange={e => setForm(f => ({ ...f, chi_nhanh_me_ma: e.target.value }))} style={inp}>
                  <option value="">-- Chọn chi nhánh chuẩn --</option>
                  {standardBranches.map(b => <option key={b.ma_chi_nhanh} value={b.ma_chi_nhanh}>{b.ten_chi_nhanh} ({b.ma_chi_nhanh})</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Giờ mở cửa</label>
                <input type="time" value={form.gio_mo_cua} onChange={e => setForm(f => ({ ...f, gio_mo_cua: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Vĩ độ</label>
                <input type="number" step="0.000001" value={form.vi_do} onChange={e => setForm(f => ({ ...f, vi_do: e.target.value }))} placeholder="10.7769" style={inp} />
              </div>
              <div>
                <label style={lbl}>Kinh độ</label>
                <input type="number" step="0.000001" value={form.kinh_do} onChange={e => setForm(f => ({ ...f, kinh_do: e.target.value }))} placeholder="106.7009" style={inp} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Mô tả vị trí</label>
                <textarea value={form.mo_ta} onChange={e => setForm(f => ({ ...f, mo_ta: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => { setShowForm(false); setError(null) }} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}>Hủy</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Đang lưu...' : editingMa ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      <>
        {/* LIST VIEW */}
        {activeView === 'list' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white' }}>
                <option value="">Tất cả khu vực</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.ten_khu_vuc}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: 'white' }}>
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="INACTIVE">Tạm dừng</option>
              </select>
              <span style={{ fontSize: 13, color: '#94a3b8', alignSelf: 'center' }}>{filteredKiosks.length} kết quả</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 }}>
              {filteredKiosks.map(k => {
                const vtm = LOAI_VI_TRI_META[k.loai_vi_tri] || {}
                return (
                  <div key={k.ma_chi_nhanh}
                    style={{ background: 'white', border: '1.5px solid #f1f5f9', borderRadius: 14, padding: '1rem 1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s', cursor: 'pointer' }}
                    onClick={() => setSelectedKiosk(k)}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#4f46e5', background: '#e0e7ff', padding: '2px 8px', borderRadius: 20 }}>{k.ma_chi_nhanh}</span>
                          {k.loai_vi_tri && <span style={{ fontSize: 11, fontWeight: 700, color: vtm.color, background: vtm.bg, padding: '2px 8px', borderRadius: 20 }}>{vtm.label}</span>}
                          <span style={{ fontSize: 11, fontWeight: 700, color: k.trang_thai === 'ACTIVE' ? '#16a34a' : '#dc2626', background: k.trang_thai === 'ACTIVE' ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 20 }}>
                            {k.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm dừng'}
                          </span>
                        </div>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.4 }}>{k.ten_chi_nhanh}</h4>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6 }}><MapPin size={12} style={{ flexShrink: 0, color: '#4f46e5' }} /><span style={{ lineHeight: 1.5 }}>{k.dia_chi}</span></div>
                      {k.khu_vuc && <div style={{ display: 'flex', gap: 6 }}><Map size={12} style={{ color: '#6366f1' }} /><span style={{ color: '#6366f1', fontWeight: 600 }}>{k.khu_vuc.ten_khu_vuc}</span></div>}
                      {k.chi_nhanh_me_ma && (() => {
                        const p = standardBranches.find(b => b.ma_chi_nhanh === k.chi_nhanh_me_ma)
                        return (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Store size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span style={{ lineHeight: 1.5 }}>
                              Chi nhánh mẹ: <strong title={k.chi_nhanh_me_ma}>{p ? p.ten_chi_nhanh : k.chi_nhanh_me_ma}</strong>
                            </span>
                          </div>
                        )
                      })()}
                      {(k.gio_mo_cua || k.gio_dong_cua) && <div style={{ fontSize: 11, color: '#94a3b8' }}>{k.gio_mo_cua} - {k.gio_dong_cua}</div>}
                      {k.mo_ta && <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', borderTop: '1px dashed #f1f5f9', paddingTop: 5, marginTop: 3 }}>{k.mo_ta}</div>}
                    </div>
                  </div>
                )
              })}
              {filteredKiosks.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  <MapPin size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p>Chưa có kiosk vệ tinh nào</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* STATS VIEW */}
        {activeView === 'stats' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: '1.5rem' }}>
              {[
                { label: 'Tổng Kiosk Vệ Tinh', value: stats.tong_tat_ca, color: '#4f46e5' },
                { label: 'Đang hoạt động', value: (stats.theo_cum || []).reduce((s, z) => s + z.dang_hoat_dong, 0), color: '#16a34a' },
                { label: 'Số Khu vực', value: (stats.theo_cum || []).length, color: '#6366f1' },
              ].map(card => (
                <div key={card.label} style={{ background: 'white', border: '1.5px solid #f1f5f9', borderRadius: 14, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{card.label}</div>
                </div>
              ))}
            </div>
            {(stats.theo_cum || []).map(cluster => (
              <div key={cluster.zone.id} style={{ background: 'white', border: '1.5px solid #f1f5f9', borderRadius: 14, overflow: 'hidden', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <button onClick={() => setExpandedZone(expandedZone === cluster.zone.id ? null : cluster.zone.id)}
                  style={{ width: '100%', padding: '14px 20px', border: 'none', background: expandedZone === cluster.zone.id ? '#f5f3ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Map size={16} color="#4f46e5" /></div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{cluster.zone.ten_khu_vuc}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{cluster.zone.thanh_pho}</div>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#4f46e5' }}>{cluster.tong_diem_ban}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 12 }}>điểm</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>{cluster.dang_hoat_dong}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>hđ</span>
                  {expandedZone === cluster.zone.id ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#94a3b8" />}
                </button>
                {expandedZone === cluster.zone.id && (
                  <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cluster.diem_ban.map(k => (
                      <div key={k.ma_chi_nhanh} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                        <MapPin size={13} color="#4f46e5" />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#334155' }}>{k.ten_chi_nhanh}</span>
                        {k.loai_vi_tri && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: (LOAI_VI_TRI_META[k.loai_vi_tri] || {}).color, background: (LOAI_VI_TRI_META[k.loai_vi_tri] || {}).bg, padding: '2px 6px', borderRadius: 12 }}>
                            {(LOAI_VI_TRI_META[k.loai_vi_tri] || {}).label || k.loai_vi_tri}
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 700, color: k.trang_thai === 'ACTIVE' ? '#16a34a' : '#dc2626' }}>
                          {k.trang_thai === 'ACTIVE' ? 'OK' : 'Tạm dừng'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              ))}
            </div>
          )}

          {/* ZONES VIEW */}
          {activeView === 'zones' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
              {zones.map(z => (
                <div key={z.id} style={{ background: 'white', border: '1.5px solid #f1f5f9', borderRadius: 14, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Map size={16} color="#4f46e5" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{z.ten_khu_vuc}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', background: '#e0e7ff', padding: '1px 6px', borderRadius: 10 }}>{z.ma_khu_vuc}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {z.thanh_pho && <div>{z.thanh_pho}</div>}
                    {z.mo_ta && <div style={{ fontStyle: 'italic' }}>{z.mo_ta}</div>}
                    <div style={{ fontWeight: 700, color: '#6366f1', marginTop: 6 }}>
                      {kiosks.filter(k => k.khu_vuc?.id === z.id).length} kiosk vệ tinh
                    </div>
                  </div>
                </div>
              ))}
              {zones.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Chưa có khu vực nào.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
