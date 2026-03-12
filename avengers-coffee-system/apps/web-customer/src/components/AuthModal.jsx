import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [isLoginView, setIsLoginView] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', hoTen: '', soDienThoai: '' });
  const [error, setError] = useState('');

  const authMutation = useMutation({
    mutationFn: async ({ endpoint, payload }) => {
      const response = await apiClient.post(endpoint, payload);
      return response.data;
    },
  });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const endpoint = isLoginView ? '/auth/login' : '/auth/register';
    authMutation.mutate(
      { endpoint, payload: formData },
      {
        onSuccess: (data) => {
          if (isLoginView) {
            localStorage.setItem('token', data.accessToken);
            onLoginSuccess(data.user);
            onClose();
            return;
          }

          alert('Dang ky thanh cong! Moi bac dang nhap.');
          setIsLoginView(true);
        },
        onError: (err) => {
          setError(err?.response?.data?.message || 'Co loi xay ra, bac kiem tra lai nhe!');
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full">
          <XMarkIcon className="h-6 w-6 text-gray-400" />
        </button>

        <div className="p-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter">
              {isLoginView ? 'Chào mừng bác trở lại!' : 'Gia nhập Avengers House'}
            </h2>
            <p className="text-gray-400 text-sm mt-2 font-medium">
              {isLoginView ? 'Đăng nhập để nhận ưu đãi đặc biệt' : 'Đăng ký để tích điểm đổi quà'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoginView && (
              <input
                type="text" placeholder="Họ và tên" required
                className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-tch-orange outline-none font-bold text-sm"
                onChange={e => setFormData({...formData, hoTen: e.target.value})}
              />
            )}
            <input
              type="email" placeholder="Email của bác" required
              className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-tch-orange outline-none font-bold text-sm"
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
            <input
              type="password" placeholder="Mật khẩu" required
              className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-tch-orange outline-none font-bold text-sm"
              onChange={e => setFormData({...formData, password: e.target.value})}
            />

            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

            <button
              disabled={authMutation.isPending}
              className="w-full py-4 bg-tch-orange text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all disabled:bg-gray-300"
            >
              {authMutation.isPending ? 'Dang xu ly...' : (isLoginView ? 'Dang nhap' : 'Dang ky ngay')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setIsLoginView(!isLoginView)}
              className="text-xs font-black uppercase text-gray-400 hover:text-tch-orange transition-colors"
            >
              {isLoginView ? 'Bác chưa có tài khoản? Đăng ký' : 'Bác đã có tài khoản? Đăng nhập'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}