import { X, MapPin, Phone, Clock, Navigation2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useState } from 'react'

export default function DeliveryDetailModal({ delivery, onClose, onConfirmPickup, onStartDelivery, onComplete, onFail }) {
  const [loading, setLoading] = useState(false)
  const [failReason, setFailReason] = useState('')
  const [showFailForm, setShowFailForm] = useState(false)

  const handleConfirmPickup = async () => {
    setLoading(true)
    try {
      await onConfirmPickup()
    } finally {
      setLoading(false)
    }
  }

  const handleStartDelivery = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        setLoading(true)
        try {
          await onStartDelivery(position.coords.latitude, position.coords.longitude)
        } finally {
          setLoading(false)
        }
      })
    } else {
      alert('Không thể lấy vị trí GPS')
    }
  }

  const handleComplete = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        setLoading(true)
        try {
          await onComplete(position.coords.latitude, position.coords.longitude)
        } finally {
          setLoading(false)
        }
      })
    } else {
      alert('Không thể lấy vị trí GPS')
    }
  }

  const handleFail = async () => {
    if (!failReason.trim()) {
      alert('Vui lòng nhập lý do')
      return
    }
    setLoading(true)
    try {
      await onFail(failReason)
      setShowFailForm(false)
      setFailReason('')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 flex justify-between items-start rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold">Chi tiết đơn hàng</h2>
            <p className="text-sm text-purple-100">#{delivery.ma_don_hang?.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2">
            {delivery.status === 'DELIVERED' ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : delivery.status === 'FAILED' ? (
              <AlertCircle className="w-6 h-6 text-red-500" />
            ) : null}
            <span className={`px-4 py-2 rounded-full font-semibold text-sm ${getStatusColor(delivery.status)}`}>
              {getStatusLabel(delivery.status)}
            </span>
          </div>

          {/* Address Section */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl space-y-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-purple-600" />
              Địa chỉ giao hàng
            </h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              {delivery.delivery_address || 'Chưa có địa chỉ'}
            </p>
          </div>

          {/* Time & Fee */}
          <div className="grid grid-cols-2 gap-3">
            {delivery.estimated_time_minutes && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600">Thời gian dự kiến</p>
                <p className="text-lg font-bold text-purple-600 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {delivery.estimated_time_minutes}m
                </p>
              </div>
            )}
            {delivery.delivery_fee && (
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600">Phí giao</p>
                <p className="text-lg font-bold text-green-600">
                  {Number(delivery.delivery_fee).toLocaleString('vi-VN')}₫
                </p>
              </div>
            )}
          </div>

          {/* Note */}
          {delivery.delivery_note && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
              <p className="text-xs text-gray-600 font-semibold mb-1">Ghi chú:</p>
              <p className="text-sm text-gray-700">{delivery.delivery_note}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-bold text-gray-600 uppercase">TIẾN TRÌNH</p>
            {delivery.picked_up_at && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-600">✓</span>
                <span className="text-gray-700">Lấy hàng: {new Date(delivery.picked_up_at).toLocaleTimeString('vi-VN')}</span>
              </div>
            )}
            {delivery.delivered_at && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-600">✓</span>
                <span className="text-gray-700">Giao xong: {new Date(delivery.delivered_at).toLocaleTimeString('vi-VN')}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid gap-2 pt-4 border-t">
            {delivery.status === 'PENDING' && (
              <button
                onClick={handleConfirmPickup}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
              >
                {loading ? 'Đang xử lý...' : '✓ Xác nhận lấy hàng'}
              </button>
            )}

            {delivery.status === 'CONFIRMED' && (
              <button
                onClick={handleStartDelivery}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Navigation2 className="w-4 h-4" />
                {loading ? 'Đang xử lý...' : '🚛 Bắt đầu giao hàng'}
              </button>
            )}

            {delivery.status === 'IN_TRANSIT' && (
              <div className="space-y-2">
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {loading ? 'Đang xử lý...' : '✓ Hoàn thành giao hàng'}
                </button>
                <button
                  onClick={() => setShowFailForm(true)}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
                >
                  ✗ Giao thất bại
                </button>
              </div>
            )}
          </div>

          {/* Fail Form */}
          {showFailForm && (
            <div className="bg-red-50 border-2 border-red-200 p-4 rounded-lg space-y-3">
              <h4 className="font-bold text-red-800">Lý do giao thất bại</h4>
              <textarea
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                placeholder="Nhập lý do..."
                className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleFail}
                  disabled={loading || !failReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition"
                >
                  {loading ? 'Đang...' : 'Xác nhận'}
                </button>
                <button
                  onClick={() => {
                    setShowFailForm(false)
                    setFailReason('')
                  }}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 rounded-lg transition"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
