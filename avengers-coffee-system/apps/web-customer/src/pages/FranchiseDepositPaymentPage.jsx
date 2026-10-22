import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';
import { uiText as ui } from '../lib/uiText';

export default function FranchiseDepositPaymentPage({ hoSoId: propHoSoId, onNavigate }) {
  const [hoSoId, setHoSoId] = useState(propHoSoId || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('vietqr'); // 'vietqr' | 'vnpay'
  const [processing, setProcessing] = useState(false);
  const [successResult, setSuccessResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [timeLeft, setTimeLeft] = useState(900); // 15 phút đếm ngược

  useEffect(() => {
    if (!propHoSoId) {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('ho_so_id') || params.get('id');
      if (urlId) setHoSoId(urlId);
    }
  }, [propHoSoId]);

  useEffect(() => {
    if (!hoSoId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/franchise/ho-so/${hoSoId}/thanh-toan-coc-info`);
        if (isMounted) {
          setData(res.data.data);
          if (res.data.data?.trang_thai === 'DA_DUYET') {
            setSuccessResult({
              alreadyApproved: true,
              message: 'Hồ sơ này đã hoàn tất đặt cọc và đã được kích hoạt điểm bán.',
              data: res.data.data
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || err.message || 'Không thể tải thông tin thanh toán cọc');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInfo();
    return () => { isMounted = false; };
  }, [hoSoId]);

  // Countdown timer
  useEffect(() => {
    if (successResult || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, successResult]);

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConfirmPayment = async () => {
    if (!hoSoId) return;
    setProcessing(true);
    try {
      const res = await apiClient.post(`/franchise/ho-so/${hoSoId}/xac-nhan-thanh-toan-coc`, {
        payment_method: paymentMethod,
      });
      setSuccessResult({
        alreadyApproved: false,
        message: res.data.message || 'Xác nhận đặt cọc thành công! Tài khoản quản trị Kiosk đã được kích hoạt.',
        data: res.data.data
      });
    } catch (err) {
      alert('Lỗi xác nhận thanh toán: ' + (err.response?.data?.message || err.message));
    } finally {
      setProcessing(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const getPackageName = (code) => {
    switch (code) {
      case 'XE_LUU_DONG': return 'Xe Cà Phê Lưu Động (Street Coffee)';
      case 'KIOSK_CO_DINH': return 'Kiosk Cố Định (Takeaway Standard)';
      case 'CONTAINER_CAFE': return 'Container Cafe Hiện Đại (Premium Hub)';
      default: return code || 'Gói Nhượng Quyền Tiêu Chuẩn';
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 bg-stone-50">
        <div className="w-10 h-10 border-4 border-stone-300 border-t-red-600 rounded-full animate-spin mb-4" />
        <p className="text-stone-600 text-sm font-medium">Đang tải thông tin thanh toán đặt cọc...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 bg-stone-50 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-2xl font-bold mb-4">✕</div>
        <h2 className="text-xl font-bold text-stone-800 mb-2">Không tìm thấy yêu cầu đặt cọc</h2>
        <p className="text-stone-600 max-w-md text-sm mb-6">{error || 'Mã hồ sơ không hợp lệ hoặc hồ sơ chưa được chuyển sang trạng thái chờ đặt cọc.'}</p>
        <button
          onClick={() => onNavigate ? onNavigate('nhuong-quyen') : (window.location.href = '/?tab=nhuong-quyen')}
          className="px-6 py-2.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium transition"
        >
          Quay lại trang Nhượng Quyền
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 py-10 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb / Back button */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => onNavigate ? onNavigate('nhuong-quyen') : (window.location.href = '/?tab=nhuong-quyen')}
            className="inline-flex items-center gap-2 text-stone-600 hover:text-stone-900 text-sm font-medium"
          >
            ← {ui('Quay lại Cổng Nhượng Quyền')}
          </button>
          <span className="text-xs text-stone-500 font-mono">Mã HS: {data.id.substring(0, 8)}...</span>
        </div>

        {/* Success View */}
        {successResult ? (
          <div className="bg-white rounded-2xl p-8 border border-stone-200 shadow-sm text-center">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
              ✓
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 mb-2">
              Đặt Cọc Giữ Chỗ Khu Vực Thành Công!
            </h1>
            <p className="text-stone-600 text-sm sm:text-base max-w-xl mx-auto mb-8">
              {successResult.message}
            </p>

            <div className="bg-stone-50 rounded-xl p-6 max-w-lg mx-auto mb-8 text-left border border-stone-200">
              <h3 className="text-xs uppercase tracking-wider text-stone-500 font-bold mb-4">
                Thông tin kích hoạt điểm bán & tài khoản:
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b border-stone-200">
                  <span className="text-stone-500">Mã Kiosk được cấp:</span>
                  <span className="font-semibold text-stone-900">{successResult.data?.maKiosk || successResult.data?.kiosk?.ma_kiosk || 'KSK-NEW'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-200">
                  <span className="text-stone-500">Tên đăng nhập Cổng QL:</span>
                  <span className="font-semibold text-red-700">{successResult.data?.username || data.so_dien_thoai || data.email}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-200">
                  <span className="text-stone-500">Mật khẩu tạm thời:</span>
                  <span className="font-mono font-semibold text-stone-900">123456</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-200">
                  <span className="text-stone-500">Số tiền cọc đã ghi nhận:</span>
                  <span className="font-semibold text-emerald-600">5.000.000 VNĐ</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-stone-500">Khu vực độc quyền:</span>
                  <span className="font-medium text-stone-900 text-right">{data.phuong_xa ? data.phuong_xa + ', ' : ''}{data.thanh_pho}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="http://localhost:5174/"
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-semibold shadow-sm transition inline-flex items-center justify-center gap-2"
              >
                Đăng nhập Cổng Quản Trị Kiosk ↗
              </a>
              <button
                onClick={() => onNavigate ? onNavigate('nhuong-quyen') : (window.location.href = '/?tab=nhuong-quyen')}
                className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-sm font-medium transition"
              >
                Về trang nhượng quyền
              </button>
            </div>
          </div>
        ) : (
          /* Payment View */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Summary & Payment Options */}
            <div className="lg:col-span-5 space-y-6">
              {/* Profile Card */}
              <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
                <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase bg-amber-50 text-amber-800 border border-amber-200 mb-3">
                  Xác nhận đặt cọc giữ chỗ
                </span>
                <h1 className="text-xl font-semibold text-stone-900 mb-1">
                  {data.ho_ten}
                </h1>
                <p className="text-xs text-stone-500 mb-4">{data.email} · {data.so_dien_thoai}</p>

                <div className="border-t border-stone-100 pt-4 space-y-2.5 text-xs text-stone-600">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Mô hình:</span>
                    <span className="font-semibold text-stone-800 text-right">{getPackageName(data.goi_kiosk)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Mặt bằng:</span>
                    <span className="font-medium text-stone-800 text-right max-w-[200px] truncate">{data.dia_chi_mat_bang}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Khu vực:</span>
                    <span className="font-medium text-stone-800 text-right">{data.phuong_xa ? data.phuong_xa + ', ' : ''}{data.thanh_pho}</span>
                  </div>
                  <div className="flex justify-between border-t border-stone-100 pt-2">
                    <span className="text-stone-500">Tổng gói đầu tư:</span>
                    <span className="font-medium text-stone-800">{Number(data.tong_gia_tri_goi || 0).toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-between font-semibold text-sm pt-1 text-red-700">
                    <span>Phí đặt cọc giữ chỗ:</span>
                    <span>{Number(data.deposit_amount || 5000000).toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="text-[11px] text-stone-400 italic pt-1 text-right">
                    (Số tiền cọc 5.000.000đ sẽ được trừ trực tiếp khi thanh toán toàn bộ gói)
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
                <h3 className="text-xs uppercase tracking-wider text-stone-500 font-bold mb-3">
                  Chọn phương thức thanh toán:
                </h3>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('vietqr')}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition ${
                      paymentMethod === 'vietqr'
                        ? 'border-red-600 bg-red-50/50 text-red-900 font-medium'
                        : 'border-stone-200 hover:border-stone-300 text-stone-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🏦</span>
                      <div>
                        <div className="text-sm font-semibold">Chuyển khoản VietQR tự động</div>
                        <div className="text-xs text-stone-500">Quét mã QR qua mọi ứng dụng ngân hàng</div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Khuyên dùng</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('vnpay')}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition ${
                      paymentMethod === 'vnpay'
                        ? 'border-red-600 bg-red-50/50 text-red-900 font-medium'
                        : 'border-stone-200 hover:border-stone-300 text-stone-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">💳</span>
                      <div>
                        <div className="text-sm font-semibold">Cổng thanh toán VNPay Sandbox</div>
                        <div className="text-xs text-stone-500">Thẻ ATM / Thẻ quốc tế / VNPay QR</div>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-600">Online</span>
                  </button>
                </div>
              </div>

              {/* Policy note */}
              <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/60 text-xs text-amber-900 leading-relaxed">
                <strong>Cam kết quyền lợi:</strong> Khoản đặt cọc giúp giữ độc quyền vị trí trong bán kính 500m trong vòng 15 ngày. Nếu thẩm định thực địa không đạt yêu cầu mặt bằng, quý khách được hoàn trả 100% tiền cọc.
              </div>
            </div>

            {/* Right: Payment Execution & QR Code */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 shadow-sm">
                {/* Header timer */}
                <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-6">
                  <div>
                    <h2 className="text-base font-semibold text-stone-900">
                      {paymentMethod === 'vietqr' ? 'Quét Mã VietQR Chuyển Khoản' : 'Thanh Toán Qua VNPay'}
                    </h2>
                    <p className="text-xs text-stone-500">Hệ thống tự động kích hoạt ngay khi nhận chuyển khoản</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-stone-400 block">Thời gian hiệu lực:</span>
                    <span className="font-mono text-base font-bold text-red-700">{formatTimer(timeLeft)}</span>
                  </div>
                </div>

                {paymentMethod === 'vietqr' ? (
                  <div>
                    {/* QR Code Container */}
                    <div className="flex flex-col items-center justify-center p-6 bg-stone-50 rounded-2xl border border-dashed border-stone-200 mb-6">
                      <img
                        src={data.qr_url}
                        alt="VietQR Deposit"
                        className="w-56 h-56 object-contain rounded-lg shadow-sm border border-stone-200 bg-white p-2"
                      />
                      <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Đang chờ hệ thống ngân hàng ghi nhận giao dịch...
                      </div>
                    </div>

                    {/* Bank Details Table */}
                    <div className="space-y-2.5 text-xs bg-stone-50 p-4 rounded-xl border border-stone-200 mb-6">
                      <div className="flex justify-between items-center py-1 border-b border-stone-200/70">
                        <span className="text-stone-500">Ngân hàng thụ hưởng:</span>
                        <span className="font-semibold text-stone-900">{data.bank_name} (MBBank)</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-stone-200/70">
                        <span className="text-stone-500">Số tài khoản:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-900 text-sm">{data.bank_account}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(data.bank_account, 'acc')}
                            className="text-[11px] px-2 py-0.5 rounded bg-white border border-stone-300 hover:bg-stone-100 text-stone-700"
                          >
                            {copiedField === 'acc' ? '✓ Đã chép' : 'Sao chép'}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-stone-200/70">
                        <span className="text-stone-500">Chủ tài khoản:</span>
                        <span className="font-semibold text-stone-900">{data.account_name}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-stone-200/70">
                        <span className="text-stone-500">Số tiền đặt cọc:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-700 text-sm">
                            {Number(data.deposit_amount || 5000000).toLocaleString('vi-VN')} đ
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(String(data.deposit_amount || 5000000), 'amt')}
                            className="text-[11px] px-2 py-0.5 rounded bg-white border border-stone-300 hover:bg-stone-100 text-stone-700"
                          >
                            {copiedField === 'amt' ? '✓ Đã chép' : 'Sao chép'}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-stone-500">Nội dung chuyển khoản (bắt buộc):</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-red-800 bg-red-100/70 px-2 py-0.5 rounded">
                            {data.transfer_content}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(data.transfer_content, 'content')}
                            className="text-[11px] px-2 py-0.5 rounded bg-white border border-stone-300 hover:bg-stone-100 text-stone-700"
                          >
                            {copiedField === 'content' ? '✓ Đã chép' : 'Sao chép'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* VNPay Portal View */
                  <div className="py-12 text-center space-y-4 bg-stone-50 rounded-2xl border border-stone-200 mb-6">
                    <div className="text-4xl">💳</div>
                    <h3 className="text-lg font-semibold text-stone-900">Thanh toán qua Cổng VNPay</h3>
                    <p className="text-xs text-stone-500 max-w-sm mx-auto">
                      Bạn sẽ được chuyển hướng tới cổng thanh toán VNPay Sandbox an toàn để xác nhận số tiền 5.000.000đ.
                    </p>
                    <div className="text-xl font-bold text-red-700">5.000.000 VNĐ</div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={processing}
                    className="w-full py-3.5 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        Đang kiểm tra & kích hoạt hồ sơ...
                      </>
                    ) : (
                      'Tôi Đã Hoàn Tất Chuyển Khoản Đặt Cọc'
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleConfirmPayment}
                      className="text-xs text-stone-500 hover:text-stone-800 underline decoration-dashed"
                    >
                      [Môi trường Demo] Mô phỏng thanh toán thành công tức thì
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
