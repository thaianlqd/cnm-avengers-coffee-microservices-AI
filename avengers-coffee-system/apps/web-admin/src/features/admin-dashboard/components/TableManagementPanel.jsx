import React, { useMemo, useState } from 'react'
import { ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeOrderStatus } from '../utils'

// Component hiển thị mã QR
const QRCodeDisplay = ({ tableId, storeId }) => {
  // Thay thế base_url bằng URL thực tế nếu chạy trên môi trường khác
  const baseUrl = import.meta.env.VITE_CUSTOMER_WEB_URL || 'http://127.0.0.1:5175'
  const qrUrl = `${baseUrl}/?storeId=${storeId}&tableId=${tableId}&tab=cart`
  
  // Dùng api.qrserver.com để sinh ảnh QR tĩnh
  const imgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}&margin=10`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}>
      <p style={{ color: '#4b5563', fontSize: '0.9rem', textAlign: 'center' }}>
        Giơ mã này cho khách quét để đặt món trực tiếp tại <strong>Bàn {tableId}</strong>.
      </p>
      <div style={{ padding: '1rem', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <img src={imgSrc} alt={`QR Code Bàn ${tableId}`} style={{ width: '200px', height: '200px' }} />
      </div>
      <a 
        href={qrUrl} 
        target="_blank" 
        rel="noreferrer"
        style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem', marginTop: '0.5rem' }}
      >
        Mở link trực tiếp
      </a>
    </div>
  )
}

export function TableManagementPanel({ ordersState, onUpdateStatus, session }) {
  const [selectedTable, setSelectedTable] = useState(null) // tableId
  
  const renderItemOptions = (item) => {
    const opts = [];
    if (item.kich_co) opts.push(`Size ${item.kich_co}`);
    if (item.luong_da) opts.push(`${item.luong_da}`);
    if (item.do_ngot) opts.push(`${item.do_ngot}`);
    if (item.loai_sua) opts.push(`${item.loai_sua}`);
    if (item.toppings && item.toppings.length > 0) opts.push(`+ ${item.toppings.join(', ')}`);
    if (item.ghi_chu) opts.push(`Ghi chú: ${item.ghi_chu}`);
    return opts.length > 0 ? opts.join(' | ') : '';
  };

  
  const storeId = session?.user?.coSoMa || session?.user?.co_so_ma || 'HCM_DIEN_BIEN_PHU'
  
  // Tuỳ chỉnh số lượng bàn cho từng cơ sở
  const getNumTables = (id) => {
    switch(id) {
      case 'HCM_DIEN_BIEN_PHU': return 25;
      case 'Q1': return 20;
      case 'Q3': return 15;
      default: return 15;
    }
  }

  const NUM_TABLES = getNumTables(storeId)
  const tables = Array.from({ length: NUM_TABLES }, (_, i) => String(i + 1))

  // Tìm kiếm đơn hàng đang hoạt động cho mỗi bàn
  // Điều kiện: loai_don_hang in ['DUNG_TAI_CHO', 'TAI_CHO', 'LAY_TAI_QUAN'], trạng thái != HOAN_THANH và != DA_HUY, có ma_ban
  const activeOrdersByTable = useMemo(() => {
    const map = {}
    if (!ordersState || !ordersState.items) return map
    
    ordersState.items.forEach(order => {
      const status = normalizeOrderStatus(order.trang_thai_don_hang)
      if (['DUNG_TAI_CHO', 'TAI_CHO', 'LAY_TAI_QUAN'].includes(order.loai_don_hang)) {
        if (order.ma_ban && status !== 'HOAN_THANH' && status !== 'DA_HUY') {
          // Nếu một bàn có nhiều đơn, ta có thể lưu thành mảng, ở đây tạm lấy đơn mới nhất
          if (!map[order.ma_ban]) {
            map[order.ma_ban] = []
          }
          map[order.ma_ban].push(order)
        }
      }
    })
    return map
  }, [ordersState])

  const renderTableGrid = () => {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '1rem',
        marginTop: '1.5rem'
      }}>
        {tables.map(tableId => {
          const activeOrders = activeOrdersByTable[tableId] || []
          const isOccupied = activeOrders.length > 0
          
          return (
            <div 
              key={tableId}
              onClick={() => setSelectedTable(tableId)}
              style={{
                background: isOccupied ? 'linear-gradient(135deg, #10b981, #059669)' : '#fff',
                border: isOccupied ? 'none' : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1rem',
                cursor: 'pointer',
                boxShadow: isOccupied ? '0 4px 10px rgba(5, 150, 105, 0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'transform 0.2s, box-shadow 0.2s',
                color: isOccupied ? '#fff' : '#1f2937'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = isOccupied ? '0 6px 14px rgba(5, 150, 105, 0.4)' : '0 4px 6px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = isOccupied ? '0 4px 10px rgba(5, 150, 105, 0.3)' : '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ fontSize: '1.25rem', fontWeight: '800' }}>Bàn {tableId}</div>
              
              {isOccupied ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
                    {activeOrders.length} đơn
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                    {ORDER_STATUS_LABEL[normalizeOrderStatus(activeOrders[0].trang_thai_don_hang)]}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '500', marginTop: '4px', textAlign: 'center', wordBreak: 'break-word', width: '100%' }}>
                    👤 {activeOrders[0].ten_khach_hang || 'Khách vãng lai'}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Trống</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderModal = () => {
    if (!selectedTable) return null
    
    const activeOrders = activeOrdersByTable[selectedTable] || []
    const isOccupied = activeOrders.length > 0

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          background: '#fff', width: '90%', maxWidth: '500px',
          borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh'
        }}>
          {/* Header */}
          <div style={{
            padding: '1rem 1.5rem', background: isOccupied ? '#059669' : '#f3f4f6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: isOccupied ? 'none' : '1px solid #e5e7eb'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: isOccupied ? '#fff' : '#111827' }}>
              Bàn số {selectedTable} {isOccupied ? '(Đang phục vụ)' : '(Trống)'}
            </h3>
            <button 
              onClick={() => setSelectedTable(null)}
              style={{
                background: 'none', border: 'none', color: isOccupied ? 'rgba(255,255,255,0.8)' : '#6b7280',
                fontSize: '1.5rem', cursor: 'pointer', padding: '0 0.5rem'
              }}
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
            {isOccupied ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {activeOrders.map(order => (
                  <div key={order.ma_don_hang} style={{ 
                    border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem',
                    background: '#f9fafb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#374151' }}>Mã: {order.ma_don_hang.substring(0, 8).toUpperCase()}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 'bold' }}>
                        {ORDER_STATUS_LABEL[normalizeOrderStatus(order.trang_thai_don_hang)]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.75rem', fontWeight: '500' }}>
                      👤 Khách hàng: {order.ten_khach_hang || 'Khách vãng lai'}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      {(order.chi_tiet || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#4b5563', fontWeight: '500' }}>{item.so_luong}x {item.ten_san_pham}</span>
                            <span style={{ fontWeight: '500' }}>{fmtMoney(item.gia_ban * item.so_luong)}</span>
                          </div>
                          {renderItemOptions(item) && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px', paddingLeft: '1rem' }}>
                              {renderItemOptions(item)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>Tổng bill:</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#c41230' }}>
                        {fmtMoney(order.tong_tien)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                      <button
                        onClick={() => {
                          onUpdateStatus(order.ma_don_hang, 'HOAN_THANH')
                          setSelectedTable(null)
                        }}
                        style={{
                          background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px',
                          padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.25rem'
                        }}
                      >
                        ✅ Hoàn tất & Trả bàn
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <QRCodeDisplay tableId={selectedTable} storeId={storeId} />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-container" style={{ padding: '1.5rem', background: '#f9fafb', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>Quản lý Bàn</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }}></span> Đang phục vụ
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff' }}></span> Bàn trống
          </div>
        </div>
      </div>
      
      {renderTableGrid()}
      {renderModal()}
    </div>
  )
}
