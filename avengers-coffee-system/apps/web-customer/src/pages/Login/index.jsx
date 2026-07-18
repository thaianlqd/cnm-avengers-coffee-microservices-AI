import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { GoogleOAuthProvider, GoogleLogin, useGoogleLogin } from '@react-oauth/google';
import ReCAPTCHA from 'react-google-recaptcha';
import { postAuthRequest } from '../../lib/authRequest';
import { navigateTab } from '../../lib/navigate';

// ============================================================
// Sub-header giống bên order.highlandscoffee.com.vn
// ============================================================
function OrderSubHeader() {
  return (
    <div className="bg-[#b22830] w-full">
      <div className="mx-auto max-w-[1380px] px-4 md:px-6">
        <div className="flex items-center gap-6 py-0 h-[44px] overflow-x-auto">
          <button
            type="button"
            onClick={() => navigateTab('home')}
            className="flex items-center gap-2 text-white text-[13px] font-semibold whitespace-nowrap hover:text-red-200 transition-colors bg-transparent border-0 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Danh mục sản phẩm
          </button>
          <span className="text-white/30">|</span>
          <button
            type="button"
            onClick={() => navigateTab('chinh-sach-dat-hang')}
            className="flex items-center gap-2 text-white text-[13px] font-semibold whitespace-nowrap hover:text-red-200 transition-colors bg-transparent border-0 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Chính sách đổi trả
          </button>
          <button
            type="button"
            onClick={() => navigateTab('lien-he')}
            className="flex items-center gap-2 text-white text-[13px] font-semibold whitespace-nowrap hover:text-red-200 transition-colors bg-transparent border-0 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Liên hệ
          </button>
          <a
            href="https://bankrista.highlandscoffee.com.vn/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white text-[13px] font-semibold whitespace-nowrap hover:text-red-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Bankrista Thịnh Vượng
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Footer dạng order page (xám)
// ============================================================
function OrderFooter() {
  return (
    <footer className="bg-[#f5f5f5] border-t border-gray-200 py-10 mt-auto">
      <div className="mx-auto max-w-[1380px] px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <img src="/hc-assets/logo.png" alt="Highlands Coffee" className="h-12 object-contain mb-4" />
            <p className="text-[12px] text-gray-500 leading-relaxed">
              CÔNG TY CỔ PHẦN DỊCH VỤ CÀ PHÊ CAO NGUYÊN
            </p>
            <p className="text-[12px] text-gray-500 mt-1">MST: 0309965814</p>
          </div>

          <div>
            <h4 className="text-[13px] font-bold text-gray-700 uppercase mb-3">Chính sách</h4>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => navigateTab('chinh-sach-dat-hang')} className="text-[13px] text-gray-500 hover:text-[#b22830] bg-transparent border-0 cursor-pointer p-0">Chính sách đặt hàng</button></li>
              <li><button type="button" onClick={() => navigateTab('chinh-sach-dat-hang')} className="text-[13px] text-gray-500 hover:text-[#b22830] bg-transparent border-0 cursor-pointer p-0">Chính sách bảo mật</button></li>
              <li><button type="button" onClick={() => navigateTab('chinh-sach-dat-hang')} className="text-[13px] text-gray-500 hover:text-[#b22830] bg-transparent border-0 cursor-pointer p-0">Chính sách đổi trả</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-bold text-gray-700 uppercase mb-3">Hỗ trợ</h4>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => navigateTab('home')} className="text-[13px] text-gray-500 hover:text-[#b22830] bg-transparent border-0 cursor-pointer p-0">Tìm kiếm</button></li>
              <li><button type="button" onClick={() => navigateTab('login')} className="text-[13px] text-gray-500 hover:text-[#b22830] bg-transparent border-0 cursor-pointer p-0">Đăng nhập</button></li>
              <li><button type="button" onClick={() => navigateTab('lien-he')} className="text-[13px] text-gray-500 hover:text-[#b22830] bg-transparent border-0 cursor-pointer p-0">Liên hệ</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-bold text-gray-700 uppercase mb-3">Đăng ký nhận tin</h4>
            <p className="text-[12px] text-gray-500 mb-3">Nhận ưu đãi & tin tức mới nhất từ Highlands Coffee</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Nhập địa chỉ em"
                className="flex-1 border border-gray-300 px-3 py-2 text-[13px] rounded-none outline-none focus:border-[#b22830]"
              />
              <button className="bg-[#b22830] text-white px-4 py-2 text-[13px] font-semibold hover:bg-[#8a1e24] transition-colors">
                Đăng ký
              </button>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-300 text-center">
          <p className="text-[12px] text-gray-400">© 2025 Highlands Coffee. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================
// Inner component (toàn bộ logic BÊ Y NGUYÊN từ AuthModal.jsx)
// ============================================================
function LoginPageInner({
  onLoginSuccess,
  canUseGoogle,
  canUseFacebook,
  canUseRecaptcha,
}) {
  const recaptchaRef = useRef(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [showGooglePanel, setShowGooglePanel] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', hoTen: '', soDienThoai: '' });
  const [error, setError] = useState('');
  const [recaptchaToken, setRecaptchaToken] = useState('');
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState('');
  const [facebookPending, setFacebookPending] = useState(false);
  const [showForgotView, setShowForgotView] = useState(false);
  const [forgotStep, setForgotStep] = useState('REQUEST');
  const [forgotInfo, setForgotInfo] = useState('');
  const [forgotForm, setForgotForm] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });

  const authMutation = useMutation({
    mutationFn: async ({ endpoint, payload }) => {
      return postAuthRequest(endpoint, payload);
    },
  });

  const forgotRequestMutation = useMutation({
    mutationFn: async (payload) => {
      return postAuthRequest('/auth/forgot-password/request', payload);
    },
  });

  const forgotResetMutation = useMutation({
    mutationFn: async (payload) => {
      return postAuthRequest('/auth/forgot-password/reset', payload);
    },
  });

  const resetSocialState = () => {
    setShowGooglePanel(false);
    setPendingGoogleCredential('');
    setRecaptchaToken('');
    recaptchaRef.current?.reset();
  };

  const completeGoogleLogin = async (googleCredential, captchaToken) => {
    const response = await postAuthRequest('/auth/google', {
      googleToken: googleCredential,
      recaptchaToken: captchaToken,
    });

    localStorage.setItem('token', response.accessToken);
    onLoginSuccess(response.user);
    resetSocialState();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const submittedForm = new FormData(e.currentTarget);
      const endpoint = isLoginView ? '/auth/login' : '/auth/register';
      const identifier = String(submittedForm.get('email') || formData.email || '').trim();
      const password = String(submittedForm.get('password') || formData.password || '');
      const fullName = String(submittedForm.get('hoTen') || formData.hoTen || '').trim();
      const phone = String(formData.soDienThoai || '').trim();

      const payload = isLoginView
        ? {
            email: identifier,
            password,
            tai_khoan: identifier,
            mat_khau: password,
            tenDangNhap: identifier,
          }
        : {
            email: identifier,
            password,
            hoTen: fullName,
            soDienThoai: phone || undefined,
            ten_dang_nhap: identifier,
            mat_khau: password,
            ho_ten: fullName,
            so_dien_thoai: phone || undefined,
          };

      authMutation.mutate(
        { endpoint, payload },
        {
          onSuccess: (data) => {
            if (isLoginView) {
              localStorage.setItem('token', data.accessToken);
              onLoginSuccess(data.user);
              resetSocialState();
              return;
            }

            alert('Đăng ký thành công! Mời bạn đăng nhập.');
            setIsLoginView(true);
            setFormData({ email: '', password: '', hoTen: '', soDienThoai: '' });
            resetSocialState();
          },
          onError: (err) => {
            setError(err?.response?.data?.message || 'Có lỗi xảy ra, vui lòng kiểm tra lại.');
          },
        },
      );

      setFormData((prev) => ({
        ...prev,
        email: identifier,
        password,
        hoTen: fullName,
      }));
    } catch (err) {
      setError('Đăng nhập thất bại, vui lòng thử lại');
      console.error('login error:', err);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');

    try {
      if (!canUseGoogle) {
        setError('Đăng nhập Google chưa được cấu hình đúng.');
        return;
      }

      if (!canUseRecaptcha) {
        setError('Đăng nhập Google yêu cầu captcha, nhưng captcha chưa được cấu hình.');
        return;
      }

      const googleCredential = String(credentialResponse?.credential || '');
      if (!googleCredential) {
        setError('Không nhận được Google credential. Vui lòng thử lại.');
        return;
      }

      if (!recaptchaToken) {
        setPendingGoogleCredential(googleCredential);
        setError('Đã chọn tài khoản Google. Vui lòng xác minh captcha để hoàn tất.');
        return;
      }

      await completeGoogleLogin(googleCredential, recaptchaToken);
    } catch (err) {
      console.error('Google login error:', err);
      setError(err?.response?.data?.message || 'Đăng nhập/đăng ký với Google thất bại, vui lòng thử lại.');
      resetSocialState();
    }
  };

  const handleGoogleError = () => {
    setError('Đăng nhập Google thất bại, vui lòng thử lại.');
  };

  const handleFacebookLogin = async () => {
    setError('');

    const facebookAppId = String(import.meta.env.VITE_FACEBOOK_APP_ID || '').trim();
    if (!facebookAppId) {
      setError('Đăng nhập Facebook chưa được cấu hình. Thiếu VITE_FACEBOOK_APP_ID.');
      return;
    }

    if (!isLoginView) {
      setError('Đăng ký bằng Facebook chưa bật. Vui lòng dùng Đăng nhập Facebook.');
      return;
    }

    setFacebookPending(true);
    const redirectUri = `${window.location.origin}/facebook-auth-callback.html`;
    const oauthUrl =
      `https://www.facebook.com/v22.0/dialog/oauth?client_id=${encodeURIComponent(facebookAppId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      '&response_type=token&scope=email,public_profile';

    const popup = window.open(
      oauthUrl,
      'facebook-login',
      'width=520,height=680,top=80,left=120',
    );

    if (!popup) {
      setFacebookPending(false);
      setError('Trình duyệt đã chặn popup Facebook. Vui lòng cho phép popup và thử lại.');
      return;
    }

    const done = (message = '') => {
      setFacebookPending(false);
      if (message) {
        setError(message);
      }
    };

    const closeTimer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(closeTimer);
        done('Bạn đã đóng cửa sổ đăng nhập Facebook.');
      }
    }, 400);

    const onMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type !== 'FACEBOOK_OAUTH_RESULT') return;

      window.removeEventListener('message', onMessage);
      window.clearInterval(closeTimer);

      if (data.error) {
        done(data.error);
        return;
      }

      const fbAccessToken = String(data.accessToken || '');
      if (!fbAccessToken) {
        done('Facebook không trả về access token.');
        return;
      }

      try {
        const response = await postAuthRequest('/auth/facebook', {
          facebookAccessToken: fbAccessToken,
        });

        localStorage.setItem('token', response.accessToken);
        onLoginSuccess(response.user);
        done();
        resetSocialState();
      } catch (err) {
        console.error('Facebook login error:', err);
        done(err?.response?.data?.message || 'Đăng nhập Facebook thất bại, vui lòng thử lại.');
      }
    };

    window.addEventListener('message', onMessage);
  };

  const handleForgotRequest = (e) => {
    e.preventDefault();
    setError('');
    setForgotInfo('');

    const identifier = String(forgotForm.email || '').trim();
    if (!identifier) {
      setError('Vui lòng nhập email hoặc tên đăng nhập để nhận mã OTP.');
      return;
    }

    const payload = identifier.includes('@')
      ? { email: identifier }
      : { tai_khoan: identifier };

    forgotRequestMutation.mutate(
      payload,
      {
        onSuccess: (data) => {
          setForgotStep('RESET');
          setForgotInfo(data?.message || 'Mã OTP đã được gửi. Vui lòng kiểm tra email của bạn.');
        },
        onError: (err) => {
          setError(err?.response?.data?.message || 'Không thể gửi mã OTP lúc này. Vui lòng thử lại.');
        },
      },
    );
  };

  const handleForgotReset = (e) => {
    e.preventDefault();
    setError('');
    setForgotInfo('');

    const identifier = String(forgotForm.email || '').trim();
    const otp = String(forgotForm.otp || '').trim();
    const newPassword = String(forgotForm.newPassword || '').trim();
    const confirmPassword = String(forgotForm.confirmPassword || '').trim();

    if (!identifier || !otp || !newPassword) {
      setError('Vui lòng nhập đầy đủ email/tài khoản, OTP và mật khẩu mới.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    const payload = identifier.includes('@')
      ? { email: identifier, otp, newPassword }
      : { tai_khoan: identifier, otp, newPassword };

    forgotResetMutation.mutate(
      payload,
      {
        onSuccess: (data) => {
          alert(data?.message || 'Đặt lại mật khẩu thành công.');
          setShowForgotView(false);
          setForgotStep('REQUEST');
          setForgotInfo('');
          setForgotForm({ email: '', otp: '', newPassword: '', confirmPassword: '' });
          setIsLoginView(true);
        },
        onError: (err) => {
          setError(err?.response?.data?.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
        },
      },
    );
  };

  return (
    <div className="flex flex-col w-full bg-white">
      <div className="bg-[#f5f5f5] py-2 px-4 text-[13px] text-gray-500 w-full">
        <div className="mx-auto max-w-[1380px] px-4 md:px-6">
          <a href="/" className="hover:text-[#b22830]">Trang chủ</a>
          <span className="mx-1">/</span>
          <span className="text-gray-900">
            {showForgotView ? 'Khôi phục mật khẩu' : isLoginView ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản'}
          </span>
        </div>
      </div>

      <div className="flex-1 mx-auto w-full max-w-[520px] px-4 md:px-6 py-10">
        <h1 className="text-center text-[22px] font-medium uppercase text-[#333] mb-1">
          {showForgotView ? 'KHÔI PHỤC MẬT KHẨU' : isLoginView ? 'ĐĂNG NHẬP TÀI KHOẢN' : 'ĐĂNG KÝ TÀI KHOẢN'}
        </h1>

        <div className="text-center text-[13px] text-gray-600 mb-8">
          {showForgotView ? (
            <span>Quay lại <button onClick={() => { setShowForgotView(false); setForgotStep('REQUEST'); setForgotInfo(''); setError(''); }} className="text-[#337ab7] hover:underline font-bold">đăng nhập</button></span>
          ) : isLoginView ? (
            <span>Bạn chưa có tài khoản ? <button onClick={() => { setIsLoginView(false); setError(''); resetSocialState(); }} className="text-[#333] font-bold border-b border-[#333]">Đăng ký tại đây</button></span>
          ) : (
            <span>Đã có tài khoản? <button onClick={() => { setIsLoginView(true); setError(''); resetSocialState(); }} className="text-[#333] font-bold border-b border-[#333]">Đăng nhập tại đây</button></span>
          )}
        </div>

        {showForgotView ? (
          /* ======== QUÊN MẬT KHẨU ======== */
          <form onSubmit={forgotStep === 'REQUEST' ? handleForgotRequest : handleForgotReset} className="max-w-[450px] mx-auto">
            <div className="mb-4">
              <label className="block text-[13px] font-bold text-[#333] mb-1">Email <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Email hoặc tên đăng nhập"
                required
                value={forgotForm.email}
                className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                onChange={(e) => setForgotForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>

            {forgotStep === 'RESET' && (
              <>
                <div className="mb-4">
                  <label className="block text-[13px] font-bold text-[#333] mb-1">Mã OTP <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="Mã OTP (6 số)"
                    required
                    value={forgotForm.otp}
                    maxLength={6}
                    className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                    onChange={(e) => setForgotForm((prev) => ({ ...prev, otp: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-[13px] font-bold text-[#333] mb-1">Mật khẩu mới <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    placeholder="Mật khẩu mới"
                    required
                    value={forgotForm.newPassword}
                    className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                    onChange={(e) => setForgotForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-[13px] font-bold text-[#333] mb-1">Nhập lại mật khẩu mới <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    placeholder="Nhập lại mật khẩu mới"
                    required
                    value={forgotForm.confirmPassword}
                    className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                    onChange={(e) => setForgotForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>
              </>
            )}

            {forgotInfo && <p className="text-center text-xs font-bold text-emerald-600 mb-4">{forgotInfo}</p>}
            {error && <p className="text-center text-xs font-bold text-red-500 mb-4">{error}</p>}

            <button
              disabled={forgotRequestMutation.isPending || forgotResetMutation.isPending}
              className="w-full rounded-[20px] bg-[#d7ccc8] py-2 font-medium text-[#795548] transition-all hover:opacity-90 disabled:opacity-70 mt-4"
            >
              {forgotRequestMutation.isPending || forgotResetMutation.isPending
                ? 'Đang xử lý...'
                : forgotStep === 'REQUEST'
                  ? 'Gửi mã OTP'
                  : 'Xác nhận đặt lại mật khẩu'}
            </button>

            {forgotStep === 'RESET' && (
              <button
                type="button"
                className="mt-3 w-full text-center text-[13px] text-[#337ab7] hover:underline"
                onClick={() => {
                  setForgotStep('REQUEST');
                  setError('');
                  setForgotInfo('');
                  setForgotForm((prev) => ({ ...prev, otp: '', newPassword: '', confirmPassword: '' }));
                }}
              >
                Gửi lại OTP
              </button>
            )}
          </form>
        ) : (
          /* ======== ĐĂNG NHẬP / ĐĂNG KÝ ======== */
          <form onSubmit={handleSubmit} className="max-w-[450px] mx-auto">
            {!isLoginView && (
              <div className="mb-4">
                <label className="block text-[13px] font-bold text-[#333] mb-1">Họ tên <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="hoTen"
                  placeholder="Họ và tên"
                  required
                  className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                  onChange={(e) => setFormData({ ...formData, hoTen: e.target.value })}
                />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[13px] font-bold text-[#333] mb-1">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                name="email"
                placeholder="Email"
                required
                className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="mb-2">
              <label className="block text-[13px] font-bold text-[#333] mb-1">Mật khẩu <span className="text-red-500">*</span></label>
              <input
                type="password"
                name="password"
                placeholder="Mật khẩu"
                required
                className="w-full border border-gray-200 rounded-[3px] px-4 py-2 text-[13px] outline-none focus:border-[#a5a5a5]"
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            {isLoginView && (
              <div className="text-left mb-6 text-[13px]">
                <span className="text-gray-500">Quên mật khẩu? Nhấn vào </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotView(true);
                    setError('');
                    setForgotInfo('');
                    setForgotStep('REQUEST');
                    setForgotForm((prev) => ({ ...prev, email: formData.email || '' }));
                  }}
                  className="text-[#337ab7] hover:underline"
                >
                  đây
                </button>
              </div>
            )}

            {error && <p className="text-center text-xs font-bold text-red-500 mb-4">{error}</p>}

            <button
              disabled={authMutation.isPending}
              className="w-full rounded-[20px] bg-[#dfd6ce] py-2 text-[14px] font-medium text-[#b22830] transition-all hover:bg-[#c9bea7] disabled:opacity-70 mt-2"
            >
              {authMutation.isPending
                ? 'Đang xử lý...'
                : isLoginView
                  ? 'Đăng nhập'
                  : 'Đăng ký'}
            </button>

            {/* Nút Social */}
            <div className="mt-8">
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="h-px bg-gray-300 w-12"></div>
                <span className="text-[13px] text-[#333]">Hoặc {isLoginView ? 'đăng nhập' : 'đăng ký'} bằng</span>
                <div className="h-px bg-gray-300 w-12"></div>
              </div>

              <div className="flex justify-center gap-2">
                {/* Facebook */}
                <button
                  type="button"
                  onClick={handleFacebookLogin}
                  disabled={facebookPending}
                  className="flex items-center justify-center gap-3 bg-[#4b66a9] hover:bg-[#2d4373] text-white py-[6px] px-4 w-[140px] disabled:opacity-70 transition-colors"
                >
                  <span className="font-bold text-lg leading-none" style={{ fontFamily: 'serif' }}>f</span>
                  <span className="text-[13px]">{facebookPending ? '...' : 'Facebook'}</span>
                </button>

                {/* Google */}
                {canUseGoogle ? (
                  <button
                    type="button"
                    onClick={() => { setShowGooglePanel(!showGooglePanel); setError(''); }}
                    className="flex items-center justify-center gap-3 bg-[#e14b33] hover:bg-[#c23321] text-white py-[6px] px-4 w-[140px] transition-colors"
                  >
                    <span className="font-bold text-lg leading-none">G+</span>
                    <span className="text-[13px]">Google</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setError('Google chưa được cấu hình. Vui lòng thêm VITE_GOOGLE_CLIENT_ID.')}
                    className="flex items-center justify-center gap-3 bg-[#e14b33] hover:bg-[#c23321] text-white py-[6px] px-4 w-[140px] transition-colors"
                  >
                    <span className="font-bold text-lg leading-none">G+</span>
                    <span className="text-[13px]">Google</span>
                  </button>
                )}
              </div>
            </div>

            {/* Google Panel (Bước 1: Captcha, Bước 2: Chọn tài khoản) */}
            {canUseGoogle && showGooglePanel && (
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-[#d6802f]">
                  Bước 1: Xác minh captcha
                </p>

                {canUseRecaptcha ? (
                  <div className="mt-3 flex justify-center">
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
                      onChange={async (token) => {
                        setError('');
                        const nextToken = token || '';
                        setRecaptchaToken(nextToken);

                        if (nextToken && pendingGoogleCredential) {
                          try {
                            await completeGoogleLogin(pendingGoogleCredential, nextToken);
                          } catch (err) {
                            console.error('Google login error:', err);
                            setError(err?.response?.data?.message || 'Đăng nhập Google thất bại, vui lòng thử lại');
                            resetSocialState();
                          }
                        }
                      }}
                      onExpired={() => {
                        setPendingGoogleCredential('');
                        setRecaptchaToken('');
                        setError('Captcha đã hết hạn, vui lòng xác minh lại.');
                      }}
                      onErrored={() => {
                        setPendingGoogleCredential('');
                        setRecaptchaToken('');
                        setError('Captcha không khả dụng, vui lòng thử lại.');
                      }}
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    Captcha chưa được cấu hình. Vui lòng thêm VITE_RECAPTCHA_SITE_KEY.
                  </p>
                )}

                <p className="mt-4 text-center text-[11px] font-black uppercase tracking-[0.18em] text-[#8b7f72]">
                  Bước 2: Chọn tài khoản Google
                </p>
                <div className="mt-2 flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="outline"
                    size="large"
                    width="320"
                    locale="vi"
                    auto_select={false}
                    use_fedcm_for_prompt={false}
                  />
                </div>

                {/* Quick Google fallback */}
                <QuickGoogleButton
                  onLoginSuccess={onLoginSuccess}
                  resetSocialState={resetSocialState}
                  setError={setError}
                />

                <button
                  type="button"
                  onClick={() => { resetSocialState(); setError(''); }}
                  className="mt-3 w-full text-xs font-black uppercase text-gray-400 hover:text-gray-600"
                >
                  Ẩn khung Google
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================
// QuickGoogleButton — dùng useGoogleLogin (phải nằm bên trong GoogleOAuthProvider)
// ============================================================
function QuickGoogleButton({ onLoginSuccess, resetSocialState, setError }) {
  const handleQuickGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await postAuthRequest('/auth/google', {
          googleToken: tokenResponse.access_token,
          isAccessToken: true,
        });

        localStorage.setItem('token', response.accessToken);
        onLoginSuccess(response.user);
        resetSocialState();
      } catch (err) {
        console.error('Google quick login error:', err);
        setError(err?.response?.data?.message || 'Đăng nhập Google thất bại, vui lòng thử lại.');
      }
    },
    onError: () => setError('Đăng nhập Google thất bại, vui lòng thử lại.'),
  });

  return (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        onClick={() => handleQuickGoogleLogin()}
        className="rounded-full border border-[#eadfcd] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8f6a50] hover:bg-[#fff7ef] transition-colors"
      >
        Dùng Google fallback
      </button>
    </div>
  );
}

// ============================================================
// Export default — bọc GoogleOAuthProvider nếu có key
// ============================================================
export default function LoginPage({ onLoginSuccess }) {
  const rawGoogleId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const GOOGLE_CLIENT_ID = rawGoogleId.replace(/^["']|["']$/g, '');
  const RECAPTCHA_SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
  const FACEBOOK_APP_ID = String(import.meta.env.VITE_FACEBOOK_APP_ID || '').trim();

  const canUseGoogle = /\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID);
  const canUseRecaptcha = !!RECAPTCHA_SITE_KEY && !RECAPTCHA_SITE_KEY.startsWith('YOUR_');
  const canUseFacebook = !!FACEBOOK_APP_ID;

  const inner = (
    <LoginPageInner
      onLoginSuccess={onLoginSuccess}
      canUseGoogle={canUseGoogle}
      canUseFacebook={canUseFacebook}
      canUseRecaptcha={canUseRecaptcha}
    />
  );

  if (canUseGoogle) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        {inner}
      </GoogleOAuthProvider>
    );
  }

  return inner;
}
