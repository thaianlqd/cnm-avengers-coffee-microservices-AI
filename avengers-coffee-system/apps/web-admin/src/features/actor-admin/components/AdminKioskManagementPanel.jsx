import React, { useState, useEffect } from 'react';
import { Store, CheckCircle2, XCircle, Search, RefreshCw, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

const ITEMS_PER_PAGE = 6;

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`;

function fmtMoney(num) {
  if (!num) return '0đ';
  return Number(num).toLocaleString('vi-VN') + 'đ';
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

export function AdminKioskManagementPanel({ session }) {
  const [kiosks, setKiosks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const loadKiosks = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/franchise/kiosk`, {
        headers: {
          'Authorization': `Bearer ${session.token}`,
        },
      });
      if (!res.ok) throw new Error('Không thể tải danh sách Kiosk');
      const data = await res.json();
      setKiosks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      loadKiosks();
    }
  }, [session]);

  const filteredKiosks = kiosks.filter(k => 
    k.ten_kiosk?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    k.ma_kiosk?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredKiosks.length / ITEMS_PER_PAGE));
  const paginatedKiosks = filteredKiosks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Store size={22} color="#f59e0b" /> Quản Lý Kiosk Toàn Hệ Thống
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Xem danh sách toàn bộ các điểm Kiosk nhượng quyền, trạng thái hoạt động và hợp đồng.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={async () => {
            if (!confirm('Bạn có chắc muốn chạy Demo Xử lý nợ quá hạn? (Sẽ quét toàn bộ công nợ và áp dụng hình phạt)')) return;
            try {
              setLoading(true);
              const res = await fetch(`${API_URL}/franchise/cron/xu-ly-no-qua-han`, { method: 'POST', headers: { 'Authorization': `Bearer ${session.token}` } });
              const data = await res.json();
              alert(data.message || 'Xử lý thành công');
              loadKiosks();
            } catch (err) { alert(err.message); setLoading(false); }
          }} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #ef4444', background: '#fef2f2', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
             Demo Xử lý Nợ
          </button>
          <button onClick={loadKiosks} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
      </div>

      {/* FILTER */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 10 }} />
          <input
            type="text"
            placeholder="Tìm theo mã Kiosk, Tên Kiosk..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
          />
        </div>
        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
          Tìm thấy: <span style={{ color: '#0f172a' }}>{filteredKiosks.length}</span> Kiosk
        </div>
      </div>

      {/* ERROR / LOADING */}
      {error && <div style={{ padding: '16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontWeight: 600 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontWeight: 600 }}>Đang tải dữ liệu Kiosk...</div>}

      {/* LIST */}
      {!loading && !error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {paginatedKiosks.map(k => (
            <div key={k.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fff', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{k.ten_kiosk}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>Mã: {k.ma_kiosk}</div>
                </div>
                <div style={{
                  padding: '4px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 800,
                  background: k.trang_thai === 'DANG_HOAT_DONG' ? '#dcfce7' : 
                              k.trang_thai === 'TAM_DUNG' ? '#ffedd5' :
                              k.trang_thai === 'NGUNG_HOAT_DONG' ? '#f3f4f6' : 
                              k.trang_thai === 'CHO_KY_HOP_DONG' ? '#e0e7ff' : '#fef9c3',
                  color: k.trang_thai === 'DANG_HOAT_DONG' ? '#059669' : 
                         k.trang_thai === 'TAM_DUNG' ? '#c2410c' :
                         k.trang_thai === 'NGUNG_HOAT_DONG' ? '#4b5563' : 
                         k.trang_thai === 'CHO_KY_HOP_DONG' ? '#4338ca' : '#d97706'
                }}>
                  {k.trang_thai === 'DANG_HOAT_DONG' ? 'ĐANG HOẠT ĐỘNG' : 
                   k.trang_thai === 'TAM_DUNG' ? 'TẠM DỪNG' :
                   k.trang_thai === 'NGUNG_HOAT_DONG' ? 'ĐÃ ĐÓNG' : 
                   k.trang_thai === 'CHO_KY_HOP_DONG' ? 'CHỜ KÝ HĐ' : 'ĐANG SETUP'}
                </div>
              </div>
              <div style={{ padding: '16px', fontSize: '0.85rem', color: '#475569' }}>
                <div style={{ marginBottom: 8 }}><strong>Loại Kiosk:</strong> {k.loai_kiosk}</div>
                <div style={{ marginBottom: 8 }}><strong>Địa chỉ:</strong> {k.dia_chi_day_du}</div>
                <div style={{ marginBottom: 8 }}><strong>ID Đối tác (Franchisee):</strong> <span style={{ fontFamily: 'monospace' }}>{k.franchisee_id}</span></div>
                
                {k.hop_dong ? (
                  <div style={{ marginTop: 16, padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px dashed #bae6fd' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0369a1', marginBottom: 8 }}>
                      <FileText size={16} /> Hợp đồng hiệu lực
                    </div>
                    <div><strong>Tỷ lệ Royalty:</strong> {k.hop_dong.ty_le_royalty_phan_tram}%</div>
                    <div><strong>Ngày ký:</strong> {fmtDate(k.hop_dong.ngay_ky)}</div>
                    <div><strong>Hết hạn:</strong> {fmtDate(k.hop_dong.ngay_het_han)}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 16, padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '1px dashed #fca5a5', color: '#b91c1c', fontWeight: 600 }}>
                    <XCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> Chưa có hợp đồng chính thức
                  </div>
                )}
                
                {k.so_cong_no_chua_thanh_toan > 0 && (
                  <div style={{ marginTop: 10, color: '#dc2626', fontWeight: 700, fontSize: '0.8rem' }}>
                    ⚠️ Đang có {k.so_cong_no_chua_thanh_toan} khoản nợ chưa thanh toán.
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {k.trang_thai === 'CHO_KY_HOP_DONG' && (
                    <button onClick={async () => {
                      if (!confirm('Tạo hợp đồng với mức Royalty mặc định 7%?')) return;
                      await fetch(`${API_URL}/franchise/kiosk/${k.id}/hop-dong`, { method: 'POST', headers: { 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ngay_ky: new Date().toISOString(), ngay_het_han: new Date(Date.now() + 5*365*24*60*60*1000).toISOString(), ty_le_royalty_phan_tram: 7, so_combo_khoi_diem: 5 }) });
                      loadKiosks();
                    }} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer', fontWeight: 600 }}>Ký HĐ & Thiết Lập</button>
                  )}
                  {k.trang_thai === 'DANG_THIET_LAP' && (
                    <button onClick={async () => {
                      if (!confirm('Xác nhận Kiosk đã thiết lập xong và khai trương?')) return;
                      await fetch(`${API_URL}/franchise/kiosk/${k.id}/khai-truong`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' } });
                      loadKiosks();
                    }} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', background: '#fff', color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>🎉 Khai trương</button>
                  )}
                  {k.trang_thai === 'DANG_HOAT_DONG' && (
                    <button onClick={async () => {
                      await fetch(`${API_URL}/franchise/kiosk/${k.id}/trang-thai`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trang_thai: 'TAM_DUNG' }) });
                      loadKiosks();
                    }} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fed7aa', background: '#fff', color: '#ea580c', cursor: 'pointer', fontWeight: 600 }}>Tạm dừng</button>
                  )}
                  {k.trang_thai === 'TAM_DUNG' && (
                    <button onClick={async () => {
                      await fetch(`${API_URL}/franchise/kiosk/${k.id}/trang-thai`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trang_thai: 'DANG_HOAT_DONG' }) });
                      loadKiosks();
                    }} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', background: '#fff', color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>Mở lại</button>
                  )}
                  {k.trang_thai !== 'NGUNG_HOAT_DONG' && (
                    <button onClick={async () => {
                      if (!confirm('Chắc chắn đóng Kiosk này vĩnh viễn?')) return;
                      await fetch(`${API_URL}/franchise/kiosk/${k.id}/trang-thai`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trang_thai: 'NGUNG_HOAT_DONG' }) });
                      loadKiosks();
                    }} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', color: '#4b5563', cursor: 'pointer', fontWeight: 600 }}>Đóng Kiosk</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredKiosks.length === 0 && !loading && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>
              Không tìm thấy Kiosk nào phù hợp.
            </div>
          )}
        </div>

        {filteredKiosks.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem', padding: '10px 0' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', color: currentPage === 1 ? '#94a3b8' : '#0f172a' }}
            >
              <ChevronLeft size={16} /> Trước
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
              Trang {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === totalPages ? '#f1f5f9' : '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', color: currentPage === totalPages ? '#94a3b8' : '#0f172a' }}
            >
              Sau <ChevronRight size={16} />
            </button>
          </div>
        )}
      </>
      )}
    </section>
  );
}
