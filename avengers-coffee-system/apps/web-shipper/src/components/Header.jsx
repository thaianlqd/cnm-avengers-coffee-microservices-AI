import { MapPin, Bell, LogOut, Battery, Wifi } from 'lucide-react'
import { useShipper } from '../context/ShipperContext'

export default function Header() {
  const { shipper, logout } = useShipper()

  const handleLogout = () => {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
      logout()
      window.location.href = '/login'
    }
  }

  return (
    <header className="bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-2">
              <MapPin className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Avengers Delivery</h1>
              <p className="text-xs text-purple-100">Ứng dụng giao hàng</p>
            </div>
          </div>

          {/* Status & Info */}
          <div className="hidden md:flex items-center gap-6">
            {shipper && (
              <>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-semibold text-sm">{shipper.full_name}</p>
                    <p className="text-xs text-purple-100">
                      {shipper.status === 'ACTIVE' ? '🟢 Đang hoạt động' : '🔴 Không hoạt động'}
                    </p>
                  </div>
                  <img
                    src={shipper.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + shipper.id}
                    alt={shipper.full_name}
                    className="w-10 h-10 rounded-full border-2 border-white"
                  />
                </div>
              </>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-white/10 rounded-lg transition">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 bg-red-400 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                3
              </span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
