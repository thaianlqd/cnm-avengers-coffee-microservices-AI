import React, { useMemo, useState } from 'react'
import {
  Coffee,
  QrCode,
  User,
  CheckCircle2,
  X,
  Clock,
  Search,
  Filter,
  DollarSign,
  Receipt,
  Copy,
  ExternalLink,
  Grid,
  Sparkles,
  Utensils,
  Check,
  Store,
  ShoppingBag,
  ArrowRight,
  Printer,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import { ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeOrderStatus } from '../utils'

// Component hiển thị mã QR đặt món trực tiếp tại bàn
const QRCodeDisplay = ({ tableId, storeId }) => {
  const [copied, setCopied] = useState(false)
  const baseUrl = import.meta.env.VITE_CUSTOMER_WEB_URL || 'http://127.0.0.1:5175'
  const qrUrl = `${baseUrl}/?storeId=${storeId}&tableId=${tableId}&tab=cart`
  const imgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}&margin=10`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1rem 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '360px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.85rem',
          borderRadius: '9999px',
          background: '#eff6ff',
          color: '#2563eb',
          fontSize: '0.825rem',
          fontWeight: '600',
          marginBottom: '0.5rem'
        }}>
          <QrCode size={16} /> Mã Đặt Món Tự Động
        </div>
        <p style={{ color: '#4b5563', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
          Khách hàng quét mã này bằng camera hoặc Zalo để mở thực đơn và đặt món trực tiếp tại <strong>Bàn {tableId}</strong>.
        </p>
      </div>

      <div style={{
        padding: '1.25rem',
        background: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        border: '1px solid #f3f4f6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative'
      }}>
        <img
          src={imgSrc}
          alt={`Mã QR Bàn ${tableId}`}
          style={{ width: '220px', height: '220px', borderRadius: '8px', display: 'block' }}
        />
        <div style={{
          marginTop: '0.75rem',
          fontSize: '0.8rem',
          fontWeight: '600',
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem'
        }}>
          <Store size={14} color="#10b981" /> Cơ sở: {storeId}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '380px' }}>
        <button
          onClick={handleCopyLink}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1rem',
            borderRadius: '10px',
            border: '1px solid #d1d5db',
            background: copied ? '#ecfdf5' : '#ffffff',
            color: copied ? '#059669' : '#374151',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {copied ? <Check size={16} color="#059669" /> : <Copy size={16} />}
          {copied ? 'Đã sao chép link!' : 'Sao chép liên kết'}
        </button>

        <a
          href={qrUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1rem',
            borderRadius: '10px',
            background: '#2563eb',
            color: '#ffffff',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: '600',
            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            transition: 'all 0.2s ease'
          }}
        >
          <ExternalLink size={16} />
          Mở link thử nghiệm
        </a>
      </div>
    </div>
  )
}

export function TableManagementPanel({ ordersState, onUpdateStatus, session }) {
  const [selectedTable, setSelectedTable] = useState(null)
  const [activeModalTab, setActiveModalTab] = useState('orders') // 'orders' | 'qr'
  const [filterStatus, setFilterStatus] = useState('ALL') // 'ALL' | 'OCCUPIED' | 'EMPTY'
  const [searchQuery, setSearchQuery] = useState('')

  const renderItemOptions = (item) => {
    const opts = []
    if (item.kich_co) opts.push(`Size ${item.kich_co}`)
    if (item.luong_da) opts.push(`${item.luong_da}`)
    if (item.do_ngot) opts.push(`${item.do_ngot}`)
    if (item.loai_sua) opts.push(`${item.loai_sua}`)
    if (item.toppings && item.toppings.length > 0) opts.push(`+ ${item.toppings.join(', ')}`)
    if (item.ghi_chu) opts.push(`Ghi chú: ${item.ghi_chu}`)
    return opts.length > 0 ? opts.join(' | ') : ''
  }

  const storeId = session?.user?.coSoMa || session?.user?.co_so_ma || 'HCM_DIEN_BIEN_PHU'

  const getNumTables = (id) => {
    switch (id) {
      case 'HCM_DIEN_BIEN_PHU': return 25
      case 'Q1': return 20
      case 'Q3': return 15
      default: return 15
    }
  }

  const NUM_TABLES = getNumTables(storeId)
  const tables = Array.from({ length: NUM_TABLES }, (_, i) => String(i + 1))

  // Danh sách các đơn hàng đang phục vụ tại bàn
  const activeOrdersByTable = useMemo(() => {
    const map = {}
    if (!ordersState || !ordersState.items) return map

    ordersState.items.forEach(order => {
      const status = normalizeOrderStatus(order.trang_thai_don_hang)
      if (['DUNG_TAI_CHO', 'TAI_CHO', 'LAY_TAI_QUAN'].includes(order.loai_don_hang)) {
        if (order.ma_ban && status !== 'HOAN_THANH' && status !== 'DA_HUY') {
          if (!map[order.ma_ban]) {
            map[order.ma_ban] = []
          }
          map[order.ma_ban].push(order)
        }
      }
    })
    return map
  }, [ordersState])

  // Thống kê tổng quan
  const stats = useMemo(() => {
    let occupiedCount = 0
    let totalRevenue = 0

    tables.forEach(tableId => {
      const orders = activeOrdersByTable[tableId] || []
      if (orders.length > 0) {
        occupiedCount++
        orders.forEach(o => {
          totalRevenue += Number(o.tong_tien || 0)
        })
      }
    })

    return {
      total: tables.length,
      occupied: occupiedCount,
      empty: tables.length - occupiedCount,
      revenue: totalRevenue
    }
  }, [tables, activeOrdersByTable])

  // Lọc danh sách bàn hiển thị
  const filteredTables = useMemo(() => {
    return tables.filter(tableId => {
      const activeOrders = activeOrdersByTable[tableId] || []
      const isOccupied = activeOrders.length > 0

      // Lọc theo trạng thái tab
      if (filterStatus === 'OCCUPIED' && !isOccupied) return false
      if (filterStatus === 'EMPTY' && isOccupied) return false

      // Tìm kiếm theo số bàn hoặc tên khách
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchTableNumber = `bàn ${tableId}`.includes(query) || tableId.includes(query)
        const matchCustomerName = activeOrders.some(o => (o.ten_khach_hang || '').toLowerCase().includes(query))
        return matchTableNumber || matchCustomerName
      }

      return true
    })
  }, [tables, activeOrdersByTable, filterStatus, searchQuery])

  const renderTableGrid = () => {
    if (filteredTables.length === 0) {
      return (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1.5rem',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px dashed #e5e7eb',
          marginTop: '1.5rem'
        }}>
          <AlertCircle size={40} color="#9ca3af" style={{ marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#374151', fontSize: '1.1rem' }}>Không tìm thấy bàn phù hợp</h4>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Vui lòng thay đổi từ khóa tìm kiếm hoặc chọn tab bộ lọc khác.</p>
        </div>
      )
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: '1.25rem',
        marginTop: '1.5rem'
      }}>
        {filteredTables.map(tableId => {
          const activeOrders = activeOrdersByTable[tableId] || []
          const isOccupied = activeOrders.length > 0
          const primaryOrder = activeOrders[0]

          return (
            <div
              key={tableId}
              onClick={() => {
                setSelectedTable(tableId)
                setActiveModalTab(isOccupied ? 'orders' : 'qr')
              }}
              style={{
                background: isOccupied
                  ? 'linear-gradient(145deg, #ffffff 0%, #ecfdf5 100%)'
                  : '#ffffff',
                border: isOccupied ? '2px solid #10b981' : '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '1.25rem 1rem',
                cursor: 'pointer',
                boxShadow: isOccupied
                  ? '0 10px 15px -3px rgba(16, 185, 129, 0.12), 0 4px 6px -2px rgba(16, 185, 129, 0.05)'
                  : '0 2px 4px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = isOccupied
                  ? '0 14px 20px -3px rgba(16, 185, 129, 0.25)'
                  : '0 8px 16px -2px rgba(0, 0, 0, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = isOccupied
                  ? '0 10px 15px -3px rgba(16, 185, 129, 0.12), 0 4px 6px -2px rgba(16, 185, 129, 0.05)'
                  : '0 2px 4px rgba(0, 0, 0, 0.03)'
              }}
            >
              {/* Header Card: Icon Bàn & Tên Bàn */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: isOccupied ? '#10b981' : '#f3f4f6',
                  color: isOccupied ? '#ffffff' : '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  boxShadow: isOccupied ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none'
                }}>
                  <Utensils size={16} />
                </div>
                <span style={{ fontSize: '1.15rem', fontWeight: '700', color: '#111827' }}>
                  Bàn {tableId}
                </span>
              </div>

              {/* Status Content */}
              {isOccupied ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '100%' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    backgroundColor: '#d1fae5',
                    color: '#047857',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '9999px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                    {activeOrders.length} đơn ({ORDER_STATUS_LABEL[normalizeOrderStatus(primaryOrder.trang_thai_don_hang)] || 'Đang xử lý'})
                  </div>

                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    <User size={14} color="#059669" />
                    <span>{primaryOrder.ten_khach_hang || 'Khách vãng lai'}</span>
                  </div>

                  <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#059669', marginTop: '0.15rem' }}>
                    {fmtMoney(primaryOrder.tong_tien)}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0' }}>
                  <span style={{
                    fontSize: '0.8rem',
                    color: '#6b7280',
                    fontWeight: '500',
                    backgroundColor: '#f3f4f6',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px'
                  }}>
                    Bàn trống
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <QrCode size={12} /> Quét QR đặt món
                  </span>
                </div>
              )}

              {/* Bottom Quick Label / Action */}
              <div style={{
                width: '100%',
                paddingTop: '0.5rem',
                borderTop: isOccupied ? '1px solid #a7f3d0' : '1px solid #f3f4f6',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: '0.775rem',
                  fontWeight: '600',
                  color: isOccupied ? '#047857' : '#4b5563',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  {isOccupied ? 'Xem đơn & Trả bàn' : 'Xem mã QR đặt bàn'} <ArrowRight size={12} />
                </span>
              </div>
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
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}>
        <div style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '540px',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {/* Header Modal */}
          <div style={{
            padding: '1.25rem 1.5rem',
            background: isOccupied
              ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
              : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                padding: '0.5rem',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Coffee size={24} color="#ffffff" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#ffffff' }}>
                  Quản lý Bàn {selectedTable}
                </h3>
                <span style={{ fontSize: '0.8rem', opacity: 0.9, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: isOccupied ? '#34d399' : '#94a3b8'
                  }}></span>
                  {isOccupied ? 'Bàn đang có khách phục vụ' : 'Bàn trống sẵn sàng đón khách'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTable(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                color: '#ffffff',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Navigation Tabs */}
          <div style={{
            display: 'flex',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '0.35rem 1rem 0 1rem'
          }}>
            <button
              onClick={() => setActiveModalTab('orders')}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeModalTab === 'orders' ? '3px solid #10b981' : '3px solid transparent',
                color: activeModalTab === 'orders' ? '#059669' : '#64748b',
                fontWeight: activeModalTab === 'orders' ? '700' : '600',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease'
              }}
            >
              <Receipt size={16} /> Đơn Hàng Tại Bàn {isOccupied && `(${activeOrders.length})`}
            </button>

            <button
              onClick={() => setActiveModalTab('qr')}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeModalTab === 'qr' ? '3px solid #10b981' : '3px solid transparent',
                color: activeModalTab === 'qr' ? '#059669' : '#64748b',
                fontWeight: activeModalTab === 'qr' ? '700' : '600',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease'
              }}
            >
              <QrCode size={16} /> Mã QR Đặt Món
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
            {activeModalTab === 'orders' ? (
              isOccupied ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {activeOrders.map((order) => (
                    <div
                      key={order.ma_don_hang}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        background: '#ffffff',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                      }}
                    >
                      {/* Sub-header đơn hàng */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.85rem',
                        paddingBottom: '0.65rem',
                        borderBottom: '1px dashed #e2e8f0'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Mã đơn:</span>{' '}
                          <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
                            #{order.ma_don_hang.substring(0, 8).toUpperCase()}
                          </strong>
                        </div>
                        <span style={{
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '9999px',
                          backgroundColor: '#d1fae5',
                          color: '#047857'
                        }}>
                          {ORDER_STATUS_LABEL[normalizeOrderStatus(order.trang_thai_don_hang)]}
                        </span>
                      </div>

                      {/* Khách hàng */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#334155',
                        fontWeight: '600',
                        marginBottom: '1rem',
                        background: '#f8fafc',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px'
                      }}>
                        <User size={16} color="#059669" />
                        <span>Khách hàng: {order.ten_khach_hang || 'Khách vãng lai'}</span>
                      </div>

                      {/* Danh sách sản phẩm trong đơn */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
                        {(order.chi_tiet || []).map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              fontSize: '0.875rem',
                              paddingBottom: '0.5rem',
                              borderBottom: idx < (order.chi_tiet || []).length - 1 ? '1px solid #f1f5f9' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#1e293b', fontWeight: '600' }}>
                                <span style={{
                                  display: 'inline-block',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  fontSize: '0.75rem',
                                  textAlign: 'center',
                                  lineHeight: '20px',
                                  marginRight: '0.4rem',
                                  fontWeight: 'bold'
                                }}>
                                  {item.so_luong}
                                </span>
                                {item.ten_san_pham}
                              </span>
                              <span style={{ fontWeight: '700', color: '#0f172a' }}>
                                {fmtMoney(item.gia_ban * item.so_luong)}
                              </span>
                            </div>
                            {renderItemOptions(item) && (
                              <div style={{ fontSize: '0.775rem', color: '#64748b', marginTop: '0.2rem', paddingLeft: '1.7rem' }}>
                                {renderItemOptions(item)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Tổng tiền bill */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '2px solid #f1f5f9',
                        paddingTop: '0.85rem',
                        marginBottom: '1rem'
                      }}>
                        <span style={{ fontSize: '0.95rem', color: '#475569', fontWeight: '600' }}>Tổng thanh toán:</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#059669' }}>
                          {fmtMoney(order.tong_tien)}
                        </span>
                      </div>

                      {/* Nút hành động */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button
                          onClick={() => {
                            onUpdateStatus(order.ma_don_hang, 'HOAN_THANH')
                            setSelectedTable(null)
                          }}
                          style={{
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '0.65rem 1.25rem',
                            fontSize: '0.875rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#059669' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#10b981' }}
                        >
                          <CheckCircle2 size={18} /> Hoàn tất & Trả bàn
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '2.5rem 1rem',
                  background: '#f8fafc',
                  borderRadius: '14px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <Utensils size={36} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155', fontSize: '1.05rem' }}>Bàn hiện tại đang trống</h4>
                  <p style={{ margin: '0 0 1.25rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                    Chưa có đơn hàng nào phát sinh tại bàn này. Bạn có thể giơ mã QR cho khách hàng đặt món.
                  </p>
                  <button
                    onClick={() => setActiveModalTab('qr')}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.6rem 1.1rem',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <QrCode size={16} /> Xem mã QR đặt món
                  </button>
                </div>
              )
            ) : (
              <QRCodeDisplay tableId={selectedTable} storeId={storeId} />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8fafc',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Header Bar & Main Title */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
            }}>
              <Coffee size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
                Quản lý & Sơ đồ Bàn
              </h2>
              <span style={{ fontSize: '0.825rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Store size={14} color="#059669" /> Cơ sở: <strong>{storeId}</strong>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#ffffff',
            padding: '0.4rem 0.85rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            fontSize: '0.825rem',
            fontWeight: '600',
            color: '#334155'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
            Bàn có khách ({stats.occupied})
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#ffffff',
            padding: '0.4rem 0.85rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            fontSize: '0.825rem',
            fontWeight: '600',
            color: '#334155'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }}></span>
            Bàn trống ({stats.empty})
          </div>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {/* Total Tables Card */}
        <div style={{
          background: '#ffffff',
          padding: '1.15rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Grid size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Tổng số bàn</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#1e293b' }}>{stats.total} bàn</div>
          </div>
        </div>

        {/* Occupied Tables Card */}
        <div style={{
          background: '#ffffff',
          padding: '1.15rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#ecfdf5',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Utensils size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Đang phục vụ</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#059669' }}>{stats.occupied} bàn</div>
          </div>
        </div>

        {/* Available Tables Card */}
        <div style={{
          background: '#ffffff',
          padding: '1.15rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#f8fafc',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Bàn trống</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#334155' }}>{stats.empty} bàn</div>
          </div>
        </div>

        {/* Active Revenue Card */}
        <div style={{
          background: '#ffffff',
          padding: '1.15rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#fef3c7',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <DollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Doanh thu tạm tính</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#d97706' }}>{fmtMoney(stats.revenue)}</div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filter Tabs & Search Bar */}
      <div style={{
        background: '#ffffff',
        padding: '1rem 1.25rem',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem'
      }}>
        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
          <button
            onClick={() => setFilterStatus('ALL')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: filterStatus === 'ALL' ? '#ffffff' : 'transparent',
              color: filterStatus === 'ALL' ? '#0f172a' : '#64748b',
              fontWeight: filterStatus === 'ALL' ? '700' : '500',
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: filterStatus === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Tất cả ({stats.total})
          </button>

          <button
            onClick={() => setFilterStatus('OCCUPIED')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: filterStatus === 'OCCUPIED' ? '#10b981' : 'transparent',
              color: filterStatus === 'OCCUPIED' ? '#ffffff' : '#64748b',
              fontWeight: filterStatus === 'OCCUPIED' ? '700' : '500',
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: filterStatus === 'OCCUPIED' ? '0 2px 4px rgba(16, 185, 129, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Đang phục vụ ({stats.occupied})
          </button>

          <button
            onClick={() => setFilterStatus('EMPTY')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: filterStatus === 'EMPTY' ? '#ffffff' : 'transparent',
              color: filterStatus === 'EMPTY' ? '#0f172a' : '#64748b',
              fontWeight: filterStatus === 'EMPTY' ? '700' : '500',
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: filterStatus === 'EMPTY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Bàn trống ({stats.empty})
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '360px' }}>
          <Search
            size={18}
            color="#94a3b8"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Tìm theo số bàn hoặc tên khách..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.5rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border 0.2s ease',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => { e.target.style.borderColor = '#10b981' }}
            onBlur={(e) => { e.target.style.borderColor = '#cbd5e1' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Grid of Table Cards */}
      {renderTableGrid()}

      {/* Details & QR Code Modal */}
      {renderModal()}
    </div>
  )
}
