import React, { useState, useEffect } from 'react';


export default function ManagerDeliveryDashboard() {
  const [stats, setStats] = useState({
    activeInternal: 0,
    activeLalamove: 0,
    completedToday: 0,
    avgDeliveryTime: '0p'
  });

  // Mock data for now, real implementation would fetch from API
  useEffect(() => {
    setStats({
      activeInternal: 3,
      activeLalamove: 1,
      completedToday: 42,
      avgDeliveryTime: '24p'
    });
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <span>📊</span> Tổng quan Giao hàng
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
          <p className="text-sm font-medium text-indigo-600 mb-1">Shipper Nội Bộ Đang Giao</p>
          <p className="text-3xl font-black text-indigo-900">{stats.activeInternal}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
          <p className="text-sm font-medium text-orange-600 mb-1">Lalamove Đang Giao</p>
          <p className="text-3xl font-black text-orange-900">{stats.activeLalamove}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-sm font-medium text-green-600 mb-1">Đã Giao Hôm Nay</p>
          <p className="text-3xl font-black text-green-900">{stats.completedToday}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-sm font-medium text-blue-600 mb-1">Thời Gian Giao TB</p>
          <p className="text-3xl font-black text-blue-900">{stats.avgDeliveryTime}</p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-bold text-gray-700 flex justify-between items-center">
          <span>Bản đồ Shipper (Real-time)</span>
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        </div>
        <div className="h-[400px] w-full bg-gray-100 flex items-center justify-center">
          {/* We would mount the Leaflet map here similar to ShipperMapView */}
          <div className="text-center text-gray-500">
            <span className="text-4xl block mb-2">🗺️</span>
            <p className="font-medium">Map View Component Placeholder</p>
            <p className="text-sm">Hiển thị tất cả shipper đang hoạt động</p>
          </div>
        </div>
      </div>
    </div>
  );
}
