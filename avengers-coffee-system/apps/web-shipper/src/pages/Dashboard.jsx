import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import Header from '../components/Header'
import DeliveryCard from '../components/DeliveryCard'
import DeliveryDetailModal from '../components/DeliveryDetailModal'
import StatsCard from '../components/StatsCard'
import { apiClient } from '../lib/apiClient'
import { queryKeys } from '../lib/queryKeys'
import { useShipper } from '../context/ShipperContext'

export default function Dashboard() {
  const { shipper } = useShipper()
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [filter, setFilter] = useState('PENDING')
  const queryClient = useQueryClient()

  // Fetch deliveries
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: [...queryKeys.deliveries(), filter],
    queryFn: async () => {
      const response = await apiClient.get(`/shippers/${shipper?.id}/deliveries`, {
        params: { status: filter },
      })
      return response || []
    },
    enabled: !!shipper?.id,
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  })

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: queryKeys.stats(),
    queryFn: async () => {
      const response = await apiClient.get(`/shippers/${shipper?.id}/stats`)
      return response
    },
    enabled: !!shipper?.id,
    refetchInterval: 30000,
  })

  // Confirm pickup mutation
  const confirmPickupMutation = useMutation({
    mutationFn: async (deliveryId) => {
      return await apiClient.post(`/shippers/${shipper?.id}/deliveries/${deliveryId}/confirm-pickup`)
    },
    onSuccess: () => {
      toast.success('✓ Đã xác nhận lấy hàng')
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveries() })
      setSelectedDelivery(null)
    },
    onError: (error) => {
      toast.error(error?.message || 'Lỗi xác nhận')
    },
  })

  // Start delivery mutation
  const startDeliveryMutation = useMutation({
    mutationFn: async (data) => {
      return await apiClient.post(`/shippers/${shipper?.id}/deliveries/${data.deliveryId}/start`, {
        latitude: data.latitude,
        longitude: data.longitude,
      })
    },
    onSuccess: () => {
      toast.success('🚛 Bắt đầu giao hàng')
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveries() })
      setSelectedDelivery(null)
    },
    onError: (error) => {
      toast.error(error?.message || 'Lỗi bắt đầu')
    },
  })

  // Complete delivery mutation
  const completeDeliveryMutation = useMutation({
    mutationFn: async (data) => {
      return await apiClient.post(`/shippers/${shipper?.id}/deliveries/${data.deliveryId}/complete`, {
        latitude: data.latitude,
        longitude: data.longitude,
        proof_image_url: data.proofUrl,
      })
    },
    onSuccess: () => {
      toast.success('✓ Giao hàng thành công')
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveries() })
      setSelectedDelivery(null)
    },
    onError: (error) => {
      toast.error(error?.message || 'Lỗi hoàn thành')
    },
  })

  // Fail delivery mutation
  const failDeliveryMutation = useMutation({
    mutationFn: async (data) => {
      return await apiClient.post(`/shippers/${shipper?.id}/deliveries/${data.deliveryId}/fail`, {
        reason: data.reason,
      })
    },
    onSuccess: () => {
      toast.success('Đã ghi nhận thất bại')
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveries() })
      setSelectedDelivery(null)
    },
    onError: (error) => {
      toast.error(error?.message || 'Lỗi ghi nhận')
    },
  })

  const statusTabs = [
    { value: 'PENDING', label: '⏳ Chờ xác nhận', count: 0 },
    { value: 'CONFIRMED', label: '✓ Đã xác nhận', count: 0 },
    { value: 'PICKING_UP', label: '📦 Đang lấy', count: 0 },
    { value: 'IN_TRANSIT', label: '🚛 Đang giao', count: 0 },
    { value: 'DELIVERED', label: '✓ Đã giao', count: 0 },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            icon={CheckCircle2}
            label="Tổng giao hàng"
            value={stats?.total_deliveries || 0}
            color="purple"
          />
          <StatsCard
            icon={Zap}
            label="Hôm nay"
            value={stats?.completed_today || 0}
            color="green"
          />
          <StatsCard
            icon={Clock}
            label="Đang chờ"
            value={stats?.pending_deliveries || 0}
            color="orange"
          />
          <StatsCard
            icon={AlertCircle}
            label="Thất bại"
            value={stats?.failed_deliveries || 0}
            color="blue"
          />
        </div>

        {/* Status Tabs */}
        <div className="bg-white rounded-xl shadow-sm p-2 mb-6 flex gap-1 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition ${ filter === tab.value
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Deliveries List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Đang tải dữ liệu...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-2">Không có đơn hàng</p>
              <p className="text-gray-400 text-sm">Chọn một trạng thái khác để xem</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {deliveries.map((delivery) => (
                <DeliveryCard
                  key={delivery.id}
                  delivery={delivery}
                  isActive={selectedDelivery?.id === delivery.id}
                  onSelect={() => setSelectedDelivery(delivery)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onConfirmPickup={() =>
            confirmPickupMutation.mutate(selectedDelivery.id)
          }
          onStartDelivery={(lat, lng) =>
            startDeliveryMutation.mutate({
              deliveryId: selectedDelivery.id,
              latitude: lat,
              longitude: lng,
            })
          }
          onComplete={(lat, lng) =>
            completeDeliveryMutation.mutate({
              deliveryId: selectedDelivery.id,
              latitude: lat,
              longitude: lng,
            })
          }
          onFail={(reason) =>
            failDeliveryMutation.mutate({
              deliveryId: selectedDelivery.id,
              reason,
            })
          }
        />
      )}
    </div>
  )
}
