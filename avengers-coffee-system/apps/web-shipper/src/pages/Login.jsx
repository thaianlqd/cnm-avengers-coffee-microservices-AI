import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { MapPin, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '../lib/apiClient'
import { useShipper } from '../context/ShipperContext'

export default function Login() {
  const navigate = useNavigate()
  const { updateShipper } = useShipper()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const loginMutation = useMutation({
    mutationFn: async (credentials) => {
      const response = await apiClient.post('/shippers/login', credentials)
      return response
    },
    onSuccess: (data) => {
      const token = data.access_token || data.accessToken
      if (!token || !data.shipper?.id) {
        toast.error('Máy chủ chưa xác nhận phiên đăng nhập. Vui lòng thử lại.')
        return
      }
      localStorage.setItem('shipper_token', token)
      const shipperData = { ...data.shipper, status: data.shipper.status || 'INACTIVE' }
      localStorage.setItem('shipper_data', JSON.stringify(shipperData))
      updateShipper(shipperData)

      toast.success('✓ Đăng nhập thành công!')
      navigate('/dashboard')
    },
    onError: (error) => {
      toast.error(error?.message || 'Lỗi đăng nhập')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Vui lòng nhập đầy đủ thông tin')
      return
    }
    loginMutation.mutate({ username, password })
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-900 p-8 text-center text-white">
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-full p-4">
              <img src="/images/brand/logo.svg" alt="Avengers Coffee" className="w-14 h-12 object-contain"/>
            </div>
          </div>
          <h1 className="text-2xl font-medium">Avengers Delivery</h1>
          <p className="text-sm text-neutral-300 mt-2">Ứng dụng giao hàng cho shipper</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tên đăng nhập
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-neutral-800 transition"
              disabled={loginMutation.isPending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-neutral-800 transition"
              disabled={loginMutation.isPending}
            />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-neutral-900 hover:bg-neutral-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2 mt-6"
          >
            <LogIn className="w-5 h-5" />
            {loginMutation.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

        </form>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-6 border-t">
          <p className="text-xs text-gray-600 text-center">
            Phiên bản 1.0.0 - Ứng dụng giao hàng Avengers Coffee
          </p>
        </div>
      </div>
    </div>
  )
}
