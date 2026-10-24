import { franchiseApi as apiFetch } from './franchiseApi'
import { FranchiseFeedback } from './FranchiseWorkspaceUI'
import { KioskTableLoading } from './KioskShiftPanel'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Table } from '../../components/ui/table'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import SearchableSelect from '../../components/console/SearchableSelect'
import { PaginatedList } from '../../components/console/CompactPagination'
import CurrencyInput from '../../components/console/CurrencyInput'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { API_BASE_URL } from '../admin-dashboard/constants'
import { 
  ArrowRight, 
  Calendar, 
  Check, 
  CreditCard, 
  DollarSign, 
  Download, 
  FileText, 
  Filter, 
  Printer, 
  RefreshCw, 
  Search, 
  Store, 
  User 
} from '../../components/console/WorkspaceIcons'


const LOAI_PHIEU = {
  THU: { label: 'Phiếu Thu', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  CHI: { label: 'Phiếu Chi', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

const DANH_MUC = {
  DAT_COC: 'Tiền cọc giữ chỗ',
  NHUONG_QUYEN: 'Tất toán gói nhượng quyền',
  NGUYEN_LIEU: 'Thanh toán combo nguyên liệu',
  ROYALTY: "Chia sẻ doanh thu",
  HOAN_COC: 'Hoàn trả tiền cọc',
  CHI_PHI_VAN_HANH: 'Hỗ trợ / Chi phí vận hành',
  TIEN_PHAT: 'Tiền phạt vi phạm hợp đồng',
  KHAC: 'Giao dịch khác',
}

const fmtMoney = (v) => Number(v || 0).toLocaleString('vi-VN') + 'đ'
const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  const hh = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${hh}:${min} ${dd}/${mm}/${yyyy}`
}

export function DongTienTab() {
  const [data, setData] = useState({ danh_sach: [], thong_ke: { tong_thu: 0, tong_chi: 0, ton_quy: 0 } })
  const [kiosks, setKiosks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ loai_phieu: '', danh_muc: '', kiosk_id: '', keyword: '' })
  const [msg, setMsg] = useState(null)
  
  const [form, setForm] = useState(null)
  const [inPhieuModal, setInPhieuModal] = useState(null)
  const [submitting,setSubmitting]=useState(false)
  const submitLock=useRef(false)

  // Load danh sách Kiosk để gắn Kiosk vào phiếu
  useEffect(() => {
    apiFetch('/franchise/kiosk')
      .then(res => setKiosks(Array.isArray(res) ? res : []))
      .catch(console.error)
  }, [])

  const kioskMap = useMemo(() => {
    const map = {}
    kiosks.forEach(k => { map[k.id] = k })
    return map
  }, [kiosks])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (filter.loai_phieu) q.append('loai_phieu', filter.loai_phieu)
      if (filter.danh_muc) q.append('danh_muc', filter.danh_muc)
      if (filter.kiosk_id) q.append('kiosk_id', filter.kiosk_id)
      
      const res = await apiFetch(`/franchise/thu-chi?${q.toString()}`)
      setData(res)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }, [filter.loai_phieu, filter.danh_muc, filter.kiosk_id])

  useEffect(() => { load() }, [load])

  const submitForm = async (e) => {
    e.preventDefault()
    if (submitLock.current) return
    if (!form.so_tien || !Number.isFinite(Number(form.so_tien)) || Number(form.so_tien) <= 0) {
      setMsg({ type: 'error', text: 'Vui lòng nhập số tiền hợp lệ (> 0).' })
      return
    }
    submitLock.current=true
    setSubmitting(true)
    try {
      await apiFetch('/franchise/thu-chi', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          so_tien: Number(form.so_tien),
          kiosk_id: form.kiosk_id || null
        })
      })
      setMsg({ type: 'success', text: `Đã tạo ${form.loai_phieu === 'THU' ? 'Phiếu Thu' : 'Phiếu Chi'} thành công!` })
      setForm(null)
      load()
    } catch (error) {
      setMsg({ type: 'error', text: error.message })
    } finally { submitLock.current=false;setSubmitting(false) }
  }

  const inPhieu = () => {
    const content = document.getElementById('receipt-print-area')?.innerHTML
    if (!content) return
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Phiếu ${inPhieuModal?.loai_phieu === 'THU' ? 'Thu' : 'Chi'} - Avengers Coffee</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #1e293b; max-width: 680px; margin: 0 auto; line-height: 1.5; }
            h2 { margin: 0 0 4px 0; font-size: 20px; text-transform: uppercase; }
            .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
            .label { color: #64748b; font-weight: 500; }
            .val { font-weight: 600; color: #0f172a; }
            .amount { font-size: 20px; font-weight: 700; color: ${inPhieuModal?.loai_phieu === 'THU' ? '#16a34a' : '#dc2626'}; text-align: right; margin: 16px 0; padding: 12px; background: #f8fafc; border-radius: 8px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
            .sig-box { flex: 1; font-size: 13px; }
            .sig-space { height: 70px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 400)
  }

  const { tong_thu, tong_chi, ton_quy } = data?.thong_ke || { tong_thu: 0, tong_chi: 0, ton_quy: 0 }
  const rawList = Array.isArray(data?.danh_sach) ? data.danh_sach : []
  
  // Lọc thêm theo từ khóa nếu có
  const filteredList = useMemo(() => {
    if (!filter.keyword.trim()) return rawList
    const kw = filter.keyword.toLowerCase().trim()
    return rawList.filter(item => {
      const k = kioskMap[item.kiosk_id]
      const kioskText = k ? `${k.ten_kiosk} ${k.ma_kiosk}`.toLowerCase() : ''
      const noteText = (item.ghi_chu || '').toLowerCase()
      const catText = (DANH_MUC[item.danh_muc] || '').toLowerCase()
      return kioskText.includes(kw) || noteText.includes(kw) || catText.includes(kw)
    })
  }, [rawList, filter.keyword, kioskMap])

  return (
    <div className="workspace-cashflow" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 3 Thẻ Chỉ số Dòng tiền */}
      <div className="franchise-financial-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Tổng Thu Nhượng Quyền</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#15803d', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>+{fmtMoney(tong_thu)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Cọc, Hợp đồng, Chia sẻ doanh thu, Combo</div>
        </div>

        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Tổng Chi Trả / Hoàn Kiosk</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#b91c1c', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>-{fmtMoney(tong_chi)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Hoàn cọc, Hỗ trợ vận hành</div>
        </div>

        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: 12, border: '1.5px solid #16354d', boxShadow: '0 2px 8px rgba(178, 40, 48, 0.06)' }}>
          <div style={{ fontSize: 11.5, color: '#16354d', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Tồn Quỹ Dòng Tiền Ròng</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: ton_quy >= 0 ? '#0f172a' : '#b91c1c', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(ton_quy)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Thu thực tế trừ các khoản hoàn chi</div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="franchise-toolbar" style={{ background: '#ffffff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
        <div className="franchise-cashflow-filters">
          {/* Ô tìm kiếm */}
          <div className="franchise-search-box" style={{ position: 'relative', minWidth: 200, flex: '1 1 200px' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <Input
              type="text"
              placeholder="Tìm kiếm theo Kiosk, diễn giải..."
              value={filter.keyword}
              onChange={e => setFilter(f => ({ ...f, keyword: e.target.value }))}
              style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#f8fafc', color: '#0f172a', boxSizing: 'border-box' }}
            />
          </div>

          {/* Lọc Kiosk */}
          <SearchableSelect
            value={filter.kiosk_id} 
            onChange={e => setFilter(f => ({ ...f, kiosk_id: e.target.value }))} 
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">-- Mọi Kiosk / Toàn hệ thống --</option>
            {kiosks.map(k => (
              <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk})</option>
            ))}
          </SearchableSelect>

          {/* Lọc Loại phiếu */}
          <SearchableSelect
            value={filter.loai_phieu} 
            onChange={e => setFilter(f => ({ ...f, loai_phieu: e.target.value }))} 
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">-- Mọi Loại phiếu --</option>
            <option value="THU">Phiếu Thu (+)</option>
            <option value="CHI">Phiếu Chi (-)</option>
          </SearchableSelect>

          {/* Lọc Danh mục */}
          <SearchableSelect
            value={filter.danh_muc} 
            onChange={e => setFilter(f => ({ ...f, danh_muc: e.target.value }))} 
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">-- Mọi Danh mục --</option>
            {Object.entries(DANH_MUC).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </SearchableSelect>

          <Button
            onClick={load} 
            title="Tải lại danh sách"
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', fontWeight: 500 }}
          >
            <RefreshCw size={14} /> Làm mới
          </Button>
        </div>

        {/* Nút Lập phiếu */}
        <Button
          onClick={() => setForm({ loai_phieu: 'THU', danh_muc: 'DAT_COC', kiosk_id: kiosks[0]?.id || '', so_tien: '', ghi_chu: '' })}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#16354d', color: '#ffffff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        >
          + Lập Phiếu Giao Dịch
        </Button>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {/* Bảng Dữ Liệu Giao Dịch Tài Chính */}
      {loading ? (
        <KioskTableLoading label="Đang tải dữ liệu" />
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div className="console-table-scroll">
            <Table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Thời gian</th>
                  <th style={{ padding: '12px 16px' }}>Kiosk liên quan</th>
                  <th style={{ padding: '12px 16px' }}>Loại & Danh mục</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Số tiền</th>
                  <th style={{ padding: '12px 16px' }}>Diễn giải / Ghi chú</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Chứng từ</th>
                </tr>
              </thead>
              <tbody style={{ divideY: '1px solid #f1f5f9' }}>
                <PaginatedList items={filteredList} resetKey={JSON.stringify(filter)} layout="table" columns={6}>
                  {d => {
                    const lp = LOAI_PHIEU[d.loai_phieu] || { label: d.loai_phieu || '?', color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' }
                    const k = kioskMap[d.kiosk_id]
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .15s' }}>
                        <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {fmtDate(d.ngay_tao)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {k ? (
                            <div>
                              <div style={{ fontWeight: 500, color: '#0f172a' }}>{k.ten_kiosk}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.ma_kiosk} · {k.thanh_pho}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Chung hệ thống</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: lp.color }} />
                            <span style={{ fontWeight: 500, color: '#0f172a' }}>{DANH_MUC[d.danh_muc] || d.danh_muc}</span>
                          </div>
                          <div style={{ fontSize: 11, color: lp.color, marginTop: 2, fontWeight: 500 }}>
                            {lp.label}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: lp.color, fontSize: 14 }}>
                          {d.loai_phieu === 'THU' ? '+' : '-'}{fmtMoney(d.so_tien)}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569', maxWidth: 260 }}>
                          {d.ghi_chu || <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <Button
                            onClick={() => setInPhieuModal(d)}
                            title="In phiếu giao dịch"
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Printer size={13} /> In phiếu
                          </Button>
                        </td>
                      </tr>
                    )
                  }}
                </PaginatedList>
                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      Không có giao dịch tài chính nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      {/* Modal Lập Phiếu Thu / Chi */}
      {form && (
        <WorkspaceDialog busy={submitting} title={`Lập Phiếu Giao Dịch (${form.loai_phieu === 'THU' ? 'Thu Tiền' : 'Chi Tiền'})`} onClose={() => setForm(null)}>
          <form data-modal-body="true" onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            <div>
              <Label htmlFor="dongtientab-field-1" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Loại giao dịch *</Label>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, loai_phieu: 'THU' }))}
                  style={{
                    flex: 1, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: form.loai_phieu === 'THU' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                    background: form.loai_phieu === 'THU' ? '#f0fdf4' : '#fff',
                    color: form.loai_phieu === 'THU' ? '#166534' : '#475569'
                  }}
                >
                  + Phiếu Thu (Nhận tiền)
                </Button>
                <Button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, loai_phieu: 'CHI' }))}
                  style={{
                    flex: 1, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: form.loai_phieu === 'CHI' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                    background: form.loai_phieu === 'CHI' ? '#fef2f2' : '#fff',
                    color: form.loai_phieu === 'CHI' ? '#991b1b' : '#475569'
                  }}
                >
                  - Phiếu Chi (Chi / Hoàn trả)
                </Button>
              </div>
            </div>

            <div>
              <Label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Kiosk liên quan</Label>
              <SearchableSelect id="dongtientab-field-1"
                value={form.kiosk_id || ''} 
                onChange={e => setForm(f => ({ ...f, kiosk_id: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: '#fff' }}
              >
                <option value="">-- Toàn hệ thống (Chi phí chung) --</option>
                {kiosks.map(k => (
                  <option key={k.id} value={k.id}>{k.ten_kiosk} ({k.ma_kiosk}) - {k.dia_chi}</option>
                ))}
              </SearchableSelect>
            </div>

            <div>
              <Label htmlFor="dongtientab-field-2" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Danh mục giao dịch *</Label>
              <SearchableSelect id="dongtientab-field-2"
                value={form.danh_muc} 
                onChange={e => setForm(f => ({ ...f, danh_muc: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: '#fff' }}
              >
                {Object.entries(DANH_MUC).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </SearchableSelect>
            </div>

            <div>
              <Label htmlFor="dongtientab-field-3" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Số tiền (VNĐ) *</Label>
              <CurrencyInput id="dongtientab-field-3"
                required
                value={form.so_tien}
                onChange={e => setForm(f => ({ ...f, so_tien: e.target.value }))}
                placeholder="VD: 5.000.000"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <Label htmlFor="dongtientab-field-4" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Diễn giải / Ghi chú chứng từ</Label>
              <Textarea id="dongtientab-field-4"
                value={form.ghi_chu} 
                onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))} 
                rows={3} 
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} 
                placeholder="Mã giao dịch ngân hàng, số ủy nhiệm chi, lý do thu/chi..." 
              />
            </div>

            <div data-modal-footer="inset" data-modal-actions="true" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
              <Button data-intent="danger"
                type="button" disabled={submitting}
                onClick={() => setForm(null)} 
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#475569' }}
              >
                Hủy bỏ
              </Button>
              <Button data-intent="success"
                type="submit" disabled={submitting} variant="default"
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: form.loai_phieu === 'THU' ? '#16a34a' : '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                Xác nhận tạo {form.loai_phieu === 'THU' ? 'Phiếu Thu' : 'Phiếu Chi'}
              </Button>
            </div>
          </form>
        </WorkspaceDialog>
      )}

      {/* Modal Xem & In Phiếu Giao Dịch */}
      {inPhieuModal && (
        <WorkspaceDialog title={`Chứng Từ: PHIẾU ${inPhieuModal.loai_phieu === 'THU' ? 'THU' : 'CHI'}`} onClose={() => setInPhieuModal(null)}>
          <div data-modal-body="true" id="receipt-print-area" style={{ padding: '16px 20px', background: '#fff', color: '#0f172a' }}>
            <div className="header" style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: 14, marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#0f172a' }}>CÔNG TY CỔ PHẦN AVENGERS COFFEE</h2>
              <div style={{ fontSize: 12, color: '#64748b' }}>Hệ Thống Chuỗi Nhượng Quyền Cà Phê Avengers</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>MST: 0123456789 — Hotline: 1900 1234</div>
              <div style={{ margin: '14px 0 4px', fontSize: 17, fontWeight: 700, color: inPhieuModal.loai_phieu === 'THU' ? '#16a34a' : '#dc2626' }}>
                PHIẾU {inPhieuModal.loai_phieu === 'THU' ? 'THU TIỀN' : 'CHI TIỀN'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Mã chứng từ: {inPhieuModal.id}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Ngày lập: {fmtDate(inPhieuModal.ngay_tao)}</div>
            </div>

            <div style={{ display: 'grid', gap: 8, fontSize: 13, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Đơn vị / Kiosk liên quan:</span>
                <span style={{ fontWeight: 600 }}>{kioskMap[inPhieuModal.kiosk_id]?.ten_kiosk || 'Toàn hệ thống'} ({kioskMap[inPhieuModal.kiosk_id]?.ma_kiosk || 'SYSTEM'})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Danh mục giao dịch:</span>
                <span style={{ fontWeight: 600 }}>{DANH_MUC[inPhieuModal.danh_muc] || inPhieuModal.danh_muc}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Diễn giải:</span>
                <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: 300 }}>{inPhieuModal.ghi_chu || '—'}</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>Tổng số tiền:</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: inPhieuModal.loai_phieu === 'THU' ? '#16a34a' : '#dc2626' }}>
                {fmtMoney(inPhieuModal.so_tien)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, textAlign: 'center', fontSize: 12, color: '#475569' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Người nộp / nhận tiền</div>
                <div style={{ height: 50 }} />
                <div style={{ color: '#94a3b8' }}>(Ký, ghi rõ họ tên)</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Thủ quỹ / Kế toán</div>
                <div style={{ height: 50 }} />
                <div style={{ color: '#94a3b8' }}>Đã xác nhận hệ thống</div>
              </div>
            </div>
          </div>

          <div data-modal-footer="edge" data-modal-actions="true" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
            <Button data-intent="danger"
              onClick={() => setInPhieuModal(null)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569' }}
            >
              Đóng
            </Button>
            <Button
              onClick={inPhieu}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #0f172a)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Printer size={14} /> In phiếu ra máy in / PDF
            </Button>
          </div>
        </WorkspaceDialog>
      )}
    </div>
  )
}
