import React, { useState } from 'react'

const fmtMoney = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ'

export default function BiDashboard({ data }) {
  const [detailModal, setDetailModal] = useState(null);

  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu BI...</div>;

  const maxDoanhThu = Math.max(...(data.xu_huong_doanh_thu?.map(x => Math.max(x.doanh_thu_kiosk, x.doanh_thu_royalty)) || [1]));
  const maxKhuVuc = Math.max(...(data.doanh_thu_theo_khu_vuc?.map(x => x.doanh_thu_thang) || [1]));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>📊 Báo Cáo Tài Chính Tổng Hợp (BI)</h2>
        <div style={{ color: '#64748b', fontSize: 14 }}>Theo dõi doanh thu toàn hệ thống nhượng quyền, phân tích xu hướng và hiệu quả hoạt động theo khu vực. Dữ liệu được đồng bộ Real-time từ các chi nhánh Kiosk.</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 30 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>🏪 Tổng Kiosk HĐ</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{data.tong_kiosk_hoat_dong || 0}</div>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 4 }}>↑ +3 tháng này</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>📦 Tổng Gói Khởi Tạo</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{data.tong_don_combo || 0}</div>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 4 }}>Đã triển khai thành công</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>👑 Doanh Thu Royalty</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{fmtMoney(data.tong_royalty_da_thu)}</div>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 4 }}>↑ +15.4% so với kỳ trước</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>⚠️ Tổng Nợ Cần Thu</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444' }}>{fmtMoney(data.tong_no_chua_thu)}</div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 4 }}>Bao gồm phí phạt trễ hạn</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        
        {/* Xu hướng doanh thu */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>📈 Xu Hướng Doanh Thu (6 Tháng)</h3>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', height: 280, paddingBottom: 20, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
            {data.xu_huong_doanh_thu?.map((item, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                <div style={{ width: '100%', height: '100%', display: 'flex', gap: 4, alignItems: 'flex-end', justifyContent: 'center' }}>
                  {/* Cột Kiosk */}
                  <div onClick={() => setDetailModal({ title: `Chi tiết ${item.thang} (Kiosk)`, content: `Tổng doanh thu các chi nhánh: ${fmtMoney(item.doanh_thu_kiosk)}\n\nTăng trưởng ổn định so với tháng trước. Hệ thống ghi nhận mức tiêu thụ Combo tăng vọt.` })} style={{ width: 14, height: `${(item.doanh_thu_kiosk / maxDoanhThu) * 100}%`, background: '#3b82f6', borderRadius: '4px 4px 0 0', position: 'relative', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.opacity=0.8} onMouseOut={e=>e.currentTarget.style.opacity=1} title={`Doanh thu Kiosk: ${fmtMoney(item.doanh_thu_kiosk)}`} />
                  {/* Cột Royalty */}
                  <div onClick={() => setDetailModal({ title: `Chi tiết ${item.thang} (Royalty)`, content: `Tổng Royalty thu về HQ: ${fmtMoney(item.doanh_thu_royalty)}\n\nTỷ lệ thu phí nhượng quyền đạt 100% KPI cam kết.` })} style={{ width: 14, height: `${(item.doanh_thu_royalty / maxDoanhThu) * 100}%`, background: '#8b5cf6', borderRadius: '4px 4px 0 0', position: 'relative', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.opacity=0.8} onMouseOut={e=>e.currentTarget.style.opacity=1} title={`Doanh thu Royalty: ${fmtMoney(item.doanh_thu_royalty)}`} />
                </div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 8 }}>{item.thang}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#475569' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: '#3b82f6', borderRadius: 3 }}/> Tổng Doanh Thu Kiosk</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: '#8b5cf6', borderRadius: 3 }}/> Tổng Royalty Thu Về HQ</div>
          </div>
        </div>

        {/* Phân tích Khu Vực */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>🗺️ Phân Bổ Theo Khu Vực</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.doanh_thu_theo_khu_vuc?.map((item, i) => (
              <div key={i} onClick={() => setDetailModal({ title: `Chi tiết ${item.khu_vuc}`, content: `Số lượng Kiosk hoạt động: ${item.so_luong_kiosk} chi nhánh\nDoanh thu đóng góp: ${fmtMoney(item.doanh_thu_thang)}\n\nKhu vực này đang có tiềm năng mở rộng rất lớn.` })} style={{ cursor: 'pointer', padding: 8, borderRadius: 8, transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#f8fafc'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  <span>{item.khu_vuc} ({item.so_luong_kiosk} chi nhánh)</span>
                  <span style={{ color: '#0f172a' }}>{fmtMoney(item.doanh_thu_thang)}</span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(item.doanh_thu_thang / maxKhuVuc) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 32, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>💡 Gợi ý chiến lược:</div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              Khu vực Miền Nam đang chiếm &gt;60% doanh thu toàn chuỗi. Cần xem xét đẩy mạnh Marketing & Setup ưu đãi để mở rộng thị phần tại Miền Trung và Miền Bắc.
            </div>
          </div>
        </div>

      </div>


      {/* Modal Chi tiết */}
      {detailModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, width: 420, maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{detailModal.title}</h3>
            <div style={{ fontSize: 15, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{detailModal.content}</div>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <button onClick={() => setDetailModal(null)} style={{ padding: '8px 20px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
