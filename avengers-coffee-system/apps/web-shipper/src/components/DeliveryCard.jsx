import { MapPin, Phone, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { formatDistance } from 'date-fns'
import { vi } from 'date-fns/locale'

export default function DeliveryCard({ delivery, onSelect, isActive }) {
  const getStatusColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-50 border-yellow-200',
      CONFIRMED: 'bg-blue-50 border-blue-200',
      PICKING_UP: 'bg-orange-50 border-orange-200',
      IN_TRANSIT: 'bg-purple-50 border-purple-200',
      DELIVERED: 'bg-green-50 border-green-200',
      FAILED: 'bg-red-50 border-red-200',
    }
    return colors[status] || 'bg-gray-50 border-gray-200'
  }

  const getStatusLabel = (status) => {
    const labels = {
      PENDING: '⏳ Chờ xác nhận',
      CONFIRMED: '✓ Đã xác nhận',
      PICKING_UP: '📦 Đang lấy hàng',
      IN_TRANSIT: '🚛 Đang giao',
      DELIVERED: '✓ Đã giao',
      FAILED: '✗ Lỗi giao',
    }
    return labels[status] || status
  }

  const getStatusBadgeColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-blue-100 text-blue-800',
      PICKING_UP: 'bg-orange-100 text-orange-800',
      IN_TRANSIT: 'bg-purple-100 text-purple-800',
      DELIVERED: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border-2 cursor-pointer transition-all transform hover:shadow-lg ${getStatusColor(
        delivery.status,
      )} ${isActive ? 'ring-2 ring-purple-500 scale-102' : 'hover:border-opacity-50'}`}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg text-gray-900">
              Đơn #{delivery.ma_don_hang?.slice(0, 8)}
            </h3>
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${ getStatusBadgeColor(delivery.status)}`}>
              {getStatusLabel(delivery.status)}
            </span>
          </div>
          <div className="text-right">
            {delivery.status === 'DELIVERED' ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : delivery.status === 'FAILED' ? (
              <AlertCircle className="w-6 h-6 text-red-500" />
            ) : (
              <Clock className="w-6 h-6 text-purple-500" />
            )}
          </div>
        </div>

        {/* Address */}
        <div className="flex gap-2">
          <MapPin className="w-4 h-4 text-gray-600 flex-shrink-0 mt-1" />
          <div className="text-sm text-gray-700">
            <p className="line-clamp-2">{delivery.delivery_address || 'Chưa có địa chỉ'}</p>
            {delivery.estimated_time_minutes && (
              <p className="text-xs text-gray-500 mt-1">
                ⏱️ {delivery.estimated_time_minutes} phút
              </p>
            )}
          </div>
        </div>

        {/* Fee */}
        {delivery.delivery_fee && (
          <div className="bg-white/50 px-3 py-2 rounded-lg flex justify-between items-center text-sm">
            <span className="text-gray-600">Phí giao:</span>
            <span className="font-bold text-green-600">
              {Number(delivery.delivery_fee).toLocaleString('vi-VN')} ₫
            </span>
          </div>
        )}

        {/* Timeline */}
        {delivery.picked_up_at && (
          <p className="text-xs text-gray-600">
            ✓ Lấy hàng: {formatDistance(new Date(delivery.picked_up_at), new Date(), { locale: vi, addSuffix: true })}
          </p>
        )}
      </div>
    </div>
  )
}
