import { TrendingUp, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export default function StatsCard({ icon: Icon, label, value, color = 'purple' }) {
  const colorClasses = {
    purple: 'bg-gradient-to-br from-purple-50 to-pink-50 text-purple-600 border-purple-200',
    green: 'bg-gradient-to-br from-green-50 to-emerald-50 text-green-600 border-green-200',
    orange: 'bg-gradient-to-br from-orange-50 to-red-50 text-orange-600 border-orange-200',
    blue: 'bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600 border-blue-200',
  }

  return (
    <div className={`p-4 rounded-xl border-2 ${colorClasses[color] || colorClasses.purple}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg bg-white ${colorClasses[color].split(' ')[2]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}
