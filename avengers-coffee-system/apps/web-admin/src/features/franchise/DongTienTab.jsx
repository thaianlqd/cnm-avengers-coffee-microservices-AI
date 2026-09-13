import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../admin-dashboard/constants'

const apiFetch = async (path, opts = {}) => {
  const t = localStorage.getItem('adminSession') ? JSON.parse(localStorage.getItem('adminSession')).token : ''
  const res = await fetch(API_BASE_URL + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...opts.headers }
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.message || 'Lỗi API')
  }
  return res.json()
}

const LOAI_PHIEU = {
  THU: { label: 'Thu', color: '#16a34a', bg: '#f0fdf4' },
  CHI: { label: 'Chi', color: '#dc2626', bg: '#fef2f2' },
}

const DANH_MUC = {
  DAT_COC: 'Tiền cọc',
  NHUONG_QUYEN: 'Phí nhượng quyền',
  NGUYEN_LIEU: 'Công nợ nguyên liệu',
  ROYALTY: 'Phí Royalty',
  HOAN_COC: 'Hoàn cọc',
  CHI_PHI_VAN_HANH: 'Chi phí vận hành',
  TIEN_PHAT: 'Tiền phạt',
  KHAC: 'Khác',
}

const fmtMoney = (v) => Number(v || 0).toLocaleString('vi-VN') + 'đ'
const fmtDate = (d) => {
  if (!d) return ''
  return new Date(d).toLocaleString('vi-VN')
}

export function DongTienTab() {
  const [data, setData] = useState({ danh_sach: [], thong_ke: { tong_thu: 0, tong_chi: 0, ton_quy: 0 } })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ loai_phieu: '', danh_muc: '' })
  const [msg, setMsg] = useState(null)
  
  const [form, setForm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (filter.loai_phieu) q.append('loai_phieu', filter.loai_phieu)
      if (filter.danh_muc) q.append('danh_muc', filter.danh_muc)
      
      const res = await apiFetch(`/franchise/thu-chi?${q.toString()}`)
      setData(res)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const submitForm = async (e) => {
    e.preventDefault()
    try {
      await apiFetch('/franchise/thu-chi', {
        method: 'POST',
        body: JSON.stringify(form)
      })
      setMsg({ type: 'success', text: `Đã tạo phiếu ${form.loai_phieu} thành công!` })
      setForm(null)
      load()
    } catch (error) {
      setMsg({ type: 'error', text: error.message })
    }
  }

  const { tong_thu, tong_chi, ton_quy } = data?.thong_ke || { tong_thu: 0, tong_chi: 0, ton_quy: 0 }
  const danh_sach = Array.isArray(data?.danh_sach) ? data.danh_sach : []

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, padding: '16px 20px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>TỔNG THU</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>{fmtMoney(tong_thu)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200, padding: '16px 20px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>TỔNG CHI</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>{fmtMoney(tong_chi)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200, padding: '16px 20px', borderRadius: 10, background: '#1e3a8a', border: '1px solid #1e40af' }}>
          <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>TỒN QUỸ (THỰC TẾ)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 4 }}>{fmtMoney(ton_quy)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', background: '#fff', padding: '12px 16px', borderRadius: 10, border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700 }}>Danh sách Thu/Chi</h3>
        
        <select value={filter.loai_phieu} onChange={e => setFilter(f => ({ ...f, loai_phieu: e.target.value }))} style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
          <option value="">-- Tất cả loại phiếu --</option>
          <option value="THU">Phiếu Thu</option>
          <option value="CHI">Phiếu Chi</option>
        </select>
        
        <select value={filter.danh_muc} onChange={e => setFilter(f => ({ ...f, danh_muc: e.target.value }))} style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
          <option value="">-- Tất cả danh mục --</option>
          {Object.entries(DANH_MUC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <button style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }} onClick={load}>Tải lại</button>
        <button style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: '#1e40af', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }} onClick={() => setForm({ loai_phieu: 'THU', danh_muc: 'KHAC', so_tien: '', ghi_chu: '' })}>+ Lập Phiếu</button>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
          <thead>
            <tr style={{ fontSize: 12, color: '#6b7280', textAlign: 'left' }}>
              <th style={{ padding: '0 12px' }}>Thời gian</th>
              <th style={{ padding: '0 12px' }}>Loại</th>
              <th style={{ padding: '0 12px' }}>Danh mục</th>
              <th style={{ padding: '0 12px', textAlign: 'right' }}>Số tiền</th>
              <th style={{ padding: '0 12px' }}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {danh_sach.map(d => {
              const lp = LOAI_PHIEU[d.loai_phieu] || { label: d.loai_phieu || '?', color: '#374151', bg: '#e5e7eb' }
              return (
                <tr key={d.id} style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '12px', fontSize: 13, color: '#4b5563' }}>{fmtDate(d.ngay_tao)}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: lp.bg, color: lp.color, padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      {lp.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 500 }}>{DANH_MUC[d.danh_muc] || d.danh_muc}</td>
                  <td style={{ padding: '12px', fontSize: 14, fontWeight: 700, color: lp.color, textAlign: 'right' }}>
                    {d.loai_phieu === 'THU' ? '+' : (d.loai_phieu === 'CHI' ? '-' : '')}{fmtMoney(d.so_tien)}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#6b7280' }}>{d.ghi_chu || '-'}</td>
                </tr>
              )
            })}
            {danh_sach.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 8 }}>Chưa có phiếu thu/chi nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {form && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, minWidth: 400, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 700 }}>Lập Phiếu Thu / Chi</h2>
            <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Loại phiếu</label>
                <select value={form.loai_phieu} onChange={e => setForm(f => ({ ...f, loai_phieu: e.target.value }))} style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
                  <option value="THU">Phiếu Thu</option>
                  <option value="CHI">Phiếu Chi</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Danh mục</label>
                <select value={form.danh_muc} onChange={e => setForm(f => ({ ...f, danh_muc: e.target.value }))} style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
                  {Object.entries(DANH_MUC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Số tiền (VNĐ)</label>
                <input type="number" required min="1" value={form.so_tien} onChange={e => setForm(f => ({ ...f, so_tien: e.target.value }))} placeholder="VD: 5000000" style={{ padding: '8px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Ghi chú</label>
                <textarea value={form.ghi_chu} onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))} rows={3} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #d1d5db' }} placeholder="Diễn giải nội dung thu chi..." />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setForm(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Hủy</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Lưu Phiếu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
