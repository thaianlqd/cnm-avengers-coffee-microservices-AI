import { Navigate } from 'react-router-dom'
import { useShipper } from '../context/ShipperContext'

export default function ProtectedRoute({ children }) {
  const { shipper, isLoading } = useShipper()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!shipper) {
    return <Navigate to="/login" replace />
  }

  return children
}
