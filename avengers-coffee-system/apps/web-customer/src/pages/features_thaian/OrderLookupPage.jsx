import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';

export default function OrderLookupPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/shippers/delivery/tracking/by-code/lookup?code=${encodeURIComponent(code.trim())}`);
      if (res.data?.order?.ma_don_hang) {
        navigate(`/tracking/${res.data.order.ma_don_hang}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Banner */}
        <div className="bg-indigo-600 h-32 relative overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <div className="text-5xl relative z-10">🔍</div>
        </div>
        
        <div className="p-8">
          <h1 className="text-2xl font-black text-gray-900 text-center mb-2">Tra cứu đơn hàng</h1>
          <p className="text-gray-500 text-center text-sm mb-8">Nhập mã đơn hàng (VD: DH12345) hoặc mã tra cứu (VD: AC-A1B2C) để xem tiến trình giao hàng.</p>
          
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-bold text-gray-700 mb-1">
                Mã tra cứu
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Nhập mã tra cứu..."
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all font-medium"
                required
              />
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100 flex gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Tra cứu ngay'
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <button onClick={() => navigate('/')} className="text-indigo-600 font-bold text-sm hover:underline">
              ← Về trang chủ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
