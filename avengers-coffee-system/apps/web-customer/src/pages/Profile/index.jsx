import React, { useState } from 'react';

export default function ProfilePage({ user, onOpenOrderHistory }) {
  const userName = user?.ho_ten || user?.hoTen || user?.full_name || user?.username || user?.ten_dang_nhap || 'Bạn';
  const userEmail = user?.email || '';
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="flex flex-col w-full bg-white">
      {/* Breadcrumb */}
      <div className="bg-[#f5f5f5] py-2 px-4 text-[13px] text-gray-500 w-full">
        <div className="mx-auto max-w-[1380px] px-4 md:px-6">
          <span className="cursor-pointer hover:text-[#b22830]" onClick={() => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'order' } }))}>Trang chủ</span>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-bold">Trang khách hàng</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1380px] px-4 md:px-6 py-8 md:py-12 flex flex-col md:flex-row gap-8 min-h-[500px]">
        {/* Left Sidebar */}
        <div className="w-full md:w-[280px] flex-shrink-0">
          <h2 className="text-[18px] font-black uppercase text-gray-800 mb-2">Trang tài khoản</h2>
          <p className="text-[14px] text-gray-600 mb-6 font-bold">
            Xin chào, <span className="text-[#b22830]">{userName}</span> !
          </p>

          <ul className="space-y-4">
            <li>
              <button 
                type="button" 
                onClick={() => setActiveTab('profile')}
                className={`text-[14px] font-bold transition-colors cursor-pointer bg-transparent border-none p-0 ${activeTab === 'profile' ? 'text-[#b22830]' : 'text-gray-600 hover:text-[#b22830]'}`}
              >
                Thông tin tài khoản
              </button>
            </li>
            <li>
              <button 
                type="button" 
                onClick={() => onOpenOrderHistory?.()} 
                className="text-[14px] font-semibold text-gray-600 hover:text-[#b22830] transition-colors bg-transparent border-none p-0 cursor-pointer"
              >
                Đơn hàng của bạn
              </button>
            </li>
            <li>
              <button 
                type="button" 
                onClick={() => setActiveTab('password')}
                className={`text-[14px] font-bold transition-colors cursor-pointer bg-transparent border-none p-0 ${activeTab === 'password' ? 'text-[#b22830]' : 'text-gray-600 hover:text-[#b22830]'}`}
              >
                Đổi mật khẩu
              </button>
            </li>
            <li>
              <button 
                type="button" 
                onClick={() => setActiveTab('address')}
                className={`text-[14px] font-bold transition-colors cursor-pointer bg-transparent border-none p-0 ${activeTab === 'address' ? 'text-[#b22830]' : 'text-gray-600 hover:text-[#b22830]'}`}
              >
                Sổ địa chỉ (0)
              </button>
            </li>
          </ul>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <>
              <h2 className="text-[18px] font-black uppercase text-gray-800 mb-6">Thông tin tài khoản</h2>
              <div className="space-y-4">
                <p className="text-[14px] text-gray-800">
                  <span className="font-bold mr-2">Họ tên:</span>
                  {userName}
                </p>
                <p className="text-[14px] text-gray-800">
                  <span className="font-bold mr-2">Email:</span>
                  {userEmail}
                </p>
              </div>
            </>
          )}

          {activeTab === 'password' && (
            <div className="max-w-md rounded-2xl border border-gray-200/90 bg-white p-6 shadow-2xs">
              <div className="flex items-center gap-2.5 border-b border-gray-100 pb-4 mb-4">
                <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-[#b22830] border border-red-100 shrink-0">
                  <span className="text-sm">🔒</span>
                </div>
                <div>
                  <h2 className="text-base font-black uppercase text-gray-900 tracking-wide font-sans">Đổi Mật Khẩu</h2>
                  <p className="text-xs font-semibold text-gray-500 mt-0.5">Đặt mật khẩu an toàn với ít nhất 6 ký tự để bảo vệ tài khoản</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-gray-700">Mật khẩu hiện tại</label>
                  <input type="password" placeholder="Nhập mật khẩu hiện tại" className="w-full rounded-xl border border-gray-200/90 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-red-100 transition-all text-gray-800" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-gray-700">Mật khẩu mới</label>
                  <input type="password" placeholder="Nhập mật khẩu mới" className="w-full rounded-xl border border-gray-200/90 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-red-100 transition-all text-gray-800" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-gray-700">Xác nhận mật khẩu mới</label>
                  <input type="password" placeholder="Xác nhận lại mật khẩu mới" className="w-full rounded-xl border border-gray-200/90 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-red-100 transition-all text-gray-800" />
                </div>
                <button className="w-full sm:w-auto rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-all cursor-pointer active:scale-95">
                  Cập nhật mật khẩu
                </button>
              </div>
            </div>
          )}

          {activeTab === 'address' && (
            <>
              <h2 className="text-[18px] font-black uppercase text-gray-800 mb-6">Sổ địa chỉ</h2>
              <div className="border border-gray-200 p-6 flex flex-col items-center justify-center text-center">
                <p className="text-[14px] text-gray-600 mb-4">Bạn chưa có địa chỉ nào được lưu.</p>
                <button className="bg-black text-white px-6 py-3 font-bold text-[14px] hover:bg-gray-800 transition-colors">THÊM ĐỊA CHỈ MỚI</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
