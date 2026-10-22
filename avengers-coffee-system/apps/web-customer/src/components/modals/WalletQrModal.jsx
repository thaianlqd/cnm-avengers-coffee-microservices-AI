import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { uiText as ui, useUiLanguage } from '../../lib/uiText';
import { XMarkIcon, CheckCircleIcon, ArrowPathIcon, ClockIcon, ExclamationTriangleIcon } from '../common/iconsSolid';
import { HiClipboardDocument, HiQrCode, HiEnvelope } from 'react-icons/hi2';

export default function WalletQrModal({
  isOpen,
  onClose,
  qrData,
  userId,
  onSuccess,
}) {
  useUiLanguage();
  const queryClient = useQueryClient();
  const [copiedField, setCopiedField] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const cancelCalledRef = useRef(false);

  const transactionId = qrData?.transaction_id;

  // Khởi tạo bộ đếm ngược 5 phút (300 giây)
  useEffect(() => {
    if (!isOpen || !qrData) {
      cancelCalledRef.current = false;
      return;
    }
    cancelCalledRef.current = false;
    setIsSuccess(false);
    setIsCancelled(false);

    if (qrData.expires_at) {
      const remainingSeconds = Math.max(
        0,
        Math.floor((new Date(qrData.expires_at).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remainingSeconds);
      if (remainingSeconds <= 0) {
        setIsCancelled(true);
      }
    } else {
      setTimeLeft(300);
    }
  }, [isOpen, qrData]);

  // Bộ đếm thời gian mỗi giây
  useEffect(() => {
    if (!isOpen || isSuccess || isCancelled) return;

    if (timeLeft <= 0) {
      handleExpire();
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isSuccess, isCancelled, timeLeft]);

  // Hàm kích hoạt hủy giao dịch khi hết thời gian 5 phút
  const handleExpire = async () => {
    if (cancelCalledRef.current || isSuccess) return;
    cancelCalledRef.current = true;
    setIsCancelled(true);
    if (userId && transactionId) {
      try {
        await apiClient.post(`/customers/${userId}/wallet/topup/${transactionId}/cancel`);
      } catch (err) {
        console.warn('Giao dịch hết hạn hoặc đã được hủy trước đó:', err?.message);
      } finally {
        queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
        queryClient.invalidateQueries({ queryKey: ['wallet-active-pending', userId] });
      }
    }
  };

  // Người dùng chủ động nhấn hủy giao dịch
  const handleUserCancel = async () => {
    if (cancelling || isSuccess || isCancelled) return;
    setCancelling(true);
    cancelCalledRef.current = true;
    try {
      if (userId && transactionId) {
        await apiClient.post(`/customers/${userId}/wallet/topup/${transactionId}/cancel`);
      }
      setIsCancelled(true);
    } catch (err) {
      console.warn('Lỗi khi hủy giao dịch:', err?.message);
      setIsCancelled(true);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
      queryClient.invalidateQueries({ queryKey: ['wallet-active-pending', userId] });
      setCancelling(false);
    }
  };

  // Tự động kiểm tra trạng thái giao dịch nạp tiền qua QR mỗi 3 giây
  const { data: statusData } = useQuery({
    queryKey: ['wallet-topup-status', userId, transactionId],
    queryFn: async () => {
      const res = await apiClient.get(`/customers/${userId}/wallet/topup/${transactionId}`);
      return res.data;
    },
    enabled: Boolean(isOpen && userId && transactionId && !isSuccess && !isCancelled),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'SUCCESS' || status === 'FAILED') return false;
      return 3000;
    },
  });

  useEffect(() => {
    if (statusData?.status === 'SUCCESS' && !isSuccess) {
      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 3500);
    } else if (statusData?.status === 'FAILED' && !isCancelled && !isSuccess) {
      setIsCancelled(true);
    }
  }, [statusData?.status, isSuccess, isCancelled, queryClient, userId, onSuccess, onClose]);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text)).then(() => {
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const formatMmSs = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  if (!isOpen || !qrData) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 pt-16 sm:pt-6 bg-black/60 backdrop-blur-sm animate-in fade-in-50 duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg md:max-w-xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-gray-100 p-6 md:p-8 flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center text-[#b22830]">
              <HiQrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-800">{ui("Chuyển khoản QR nạp ví")}</h3>
              <p className="text-xs text-gray-500 font-normal">{ui("Quét mã qua app ngân hàng bất kỳ")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
              queryClient.invalidateQueries({ queryKey: ['wallet-active-pending', userId] });
              onClose?.();
            }}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Trạng thái 1: Nạp tiền thành công */}
        {isSuccess ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
              <CheckCircleIcon className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-semibold text-gray-800">{ui("Nạp tiền thành công!")}</h4>
            <p className="text-sm text-gray-600 font-normal">
              {ui("Số dư ví điện tử của bạn đã được cộng thêm")}{" "}
              <span className="text-emerald-700 font-semibold">
                {Number(qrData.amount).toLocaleString('vi-VN')} đ
              </span>
            </p>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-normal">
              <HiEnvelope className="w-4 h-4 text-emerald-600" />
              <span>{ui("Email thông báo nạp tiền thành công đã được gửi tới hòm thư của bạn.")}</span>
            </div>
            <p className="text-xs text-gray-400 font-normal pt-2">{ui("Cửa sổ sẽ tự động đóng trong giây lát...")}</p>
          </div>
        ) : isCancelled ? (
          /* Trạng thái 2: Hết hạn 5 phút hoặc giao dịch bị hủy */
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-9 h-9" />
            </div>
            <h4 className="text-lg font-semibold text-gray-800">{ui("Giao dịch đã bị hủy / hết hạn")}</h4>
            <p className="text-sm text-gray-600 font-normal max-w-sm">
              {ui("Đã quá 5 phút mà hệ thống chưa nhận được tiền chuyển khoản từ ngân hàng, hoặc giao dịch đã được yêu cầu hủy.")}
            </p>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-normal">
              <HiEnvelope className="w-4 h-4 text-stone-600" />
              <span>{ui("Email thông báo hủy giao dịch đã được gửi tới hòm thư của bạn.")}</span>
            </div>
            <p className="text-xs text-gray-500 font-normal max-w-sm pt-1">
              {ui("Nếu bạn đã chuyển tiền nhưng bị chậm, vui lòng liên hệ hotline 1900 1755 để được hỗ trợ cộng tiền ngay.")}
            </p>
            <div className="w-full pt-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                {ui("Đóng")}
              </button>
            </div>
          </div>
        ) : (
          /* Trạng thái 3: Đang chờ chuyển khoản (tối đa 5 phút) */
          <div className="py-4 space-y-4">
            {/* Countdown timer badge */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-amber-50/80 border border-amber-200/60">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-900">
                <ClockIcon className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{ui("Thời gian chuyển khoản còn lại:")}</span>
              </div>
              <span className={`font-mono text-sm font-semibold tracking-wider px-2.5 py-0.5 rounded-lg ${timeLeft <= 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-white text-amber-900 border border-amber-200'}`}>
                {formatMmSs(timeLeft)}
              </span>
            </div>

            {/* QR Image Box */}
            <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-b from-stone-50 to-red-50/20 rounded-2xl border border-red-100/50 shadow-inner">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                <img
                  src={qrData.qr_url}
                  alt="VietQR nạp tiền vào ví"
                  className="w-56 h-56 object-contain"
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50/90 px-3.5 py-1.5 rounded-full border border-amber-200/50">
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                <span>{ui("Đang tự động chờ nhận chuyển khoản từ ngân hàng...")}</span>
              </div>
            </div>

            {/* Bank Transfer Details */}
            <div className="space-y-2.5 text-[13px] bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              {/* Ngân hàng */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/50">
                <span className="text-gray-500 font-normal">{ui("Ngân hàng:")}</span>
                <span className="font-medium text-gray-700">{qrData.bank_name || 'MBBank (Quân Đội)'}</span>
              </div>

              {/* Số tài khoản */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/50">
                <span className="text-gray-500 font-normal">{ui("Số tài khoản:")}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-gray-800 text-sm tracking-wide">{qrData.account_no || '025452790502'}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(qrData.account_no || '025452790502', 'account')}
                    className="p-1 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-[#b22830] hover:border-red-200 transition-colors cursor-pointer"
                    title={ui("Sao chép số tài khoản")}
                  >
                    {copiedField === 'account' ? (
                      <span className="text-[10px] text-emerald-600 font-medium px-1">{ui("Đã chép")}</span>
                    ) : (
                      <HiClipboardDocument className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Chủ tài khoản */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/50">
                <span className="text-gray-500 font-normal">{ui("Chủ tài khoản:")}</span>
                <span className="font-medium text-gray-700 uppercase tracking-normal">{qrData.account_name || 'AVENGERS COFFEE'}</span>
              </div>

              {/* Số tiền */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-200/50">
                <span className="text-gray-500 font-normal">{ui("Số tiền:")}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#b22830] text-sm">{Number(qrData.amount).toLocaleString('vi-VN')} đ</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(qrData.amount, 'amount')}
                    className="p-1 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-[#b22830] hover:border-red-200 transition-colors cursor-pointer"
                    title={ui("Sao chép số tiền")}
                  >
                    {copiedField === 'amount' ? (
                      <span className="text-[10px] text-emerald-600 font-medium px-1">{ui("Đã chép")}</span>
                    ) : (
                      <HiClipboardDocument className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Nội dung chuyển khoản */}
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-normal">{ui("Nội dung CK:")}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-[#b22830] bg-red-50/70 px-2.5 py-1 rounded-lg border border-red-200/60 text-xs">
                    {qrData.transfer_content}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(qrData.transfer_content, 'content')}
                    className="p-1 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-[#b22830] hover:border-red-200 transition-colors cursor-pointer"
                    title={ui("Sao chép nội dung chuyển khoản")}
                  >
                    {copiedField === 'content' ? (
                      <span className="text-[10px] text-emerald-600 font-medium px-1">{ui("Đã chép")}</span>
                    ) : (
                      <HiClipboardDocument className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-center gap-1.5 py-2 px-3 bg-stone-50 rounded-xl border border-stone-200/70 text-stone-600 text-xs font-normal text-center">
                <span>{ui("Tiền sẽ vào ví tự động ngay khi chuyển khoản thành công. Thông báo sẽ gửi về email.")}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleUserCancel}
                  disabled={cancelling}
                  className="w-1/2 py-2 px-3 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {cancelling ? ui("Đang hủy...") : ui("Hủy nạp tiền")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/2 py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  {ui("Đóng")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
