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
  const [username, setUsername] = useState('shipper_demo')
  const [password, setPassword] = useState('123456')

  const loginMutation = useMutation({
    mutationFn: async (credentials) => {
      const response = await apiClient.post('/shippers/login', credentials)
      return response
    },
    onSuccess: (data) => {
      // Store token and shipper data
      localStorage.setItem('shipper_token', data.access_token || data.accessToken || 'mock-token-' + Date.now())
      const shipperData = {
        id: data.shipper?.id || 'mock-shipper-id',
        username: data.shipper?.username || username,
        full_name: data.shipper?.full_name || 'Shipper Demo',
        avatar_url: data.shipper?.avatar_url || null,
        status: data.shipper?.status || 'ACTIVE',
        rating: data.shipper?.rating || 4.8,
      }
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

  // Demo mode helper
  const handleDemoLogin = () => {
    const demoShipper = {
      id: 'demo-shipper-001',
      username: 'shipper_demo',
      full_name: 'Phạm Văn A',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
      status: 'ACTIVE',
      rating: 4.8,
    }
    localStorage.setItem('shipper_token', 'mock-token-' + Date.now())
    localStorage.setItem('shipper_data', JSON.stringify(demoShipper))
    updateShipper(demoShipper)
    toast.success('✓ Đã vào chế độ Demo')
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-8 text-center text-white">
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-full p-4">
              <MapPin className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Avengers Delivery</h1>
          <p className="text-sm text-purple-100 mt-2">Ứng dụng giao hàng cho shipper</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tên đăng nhập
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600 transition"
              disabled={loginMutation.isPending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600 transition"
              disabled={loginMutation.isPending}
            />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 mt-6"
          >
            <LogIn className="w-5 h-5" />
            {loginMutation.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

          {/* Demo Button */}
          <button
            type="button"
            onClick={handleDemoLogin}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 rounded-lg transition text-sm"
          >
            🧪 Dùng Demo
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
