import React, { useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useMutation } from '@tanstack/react-query';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import ReCAPTCHA from 'react-google-recaptcha';
import { apiClient } from '../lib/apiClient';

const BRAND_LOGO = 'A';

function AuthModalInner({
  isOpen,
  onClose,
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
      const response = await apiClient.post(endpoint, payload);
      return response.data;
    },
  });

  const forgotRequestMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.post('/auth/forgot-password/request', payload);
      return response.data;
    },
  });

  const forgotResetMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.post('/auth/forgot-password/reset', payload);
      return response.data;
    },
  });

  if (!isOpen) return null;

  const resetSocialState = () => {
    setShowGooglePanel(false);
    setPendingGoogleCredential('');
    setRecaptchaToken('');
    recaptchaRef.current?.reset();
  };

  const completeGoogleLogin = async (googleCredential, captchaToken) => {
    const response = await apiClient.post('/auth/google', {
      googleToken: googleCredential,
      recaptchaToken: captchaToken,
    });

    localStorage.setItem('token', response.data.accessToken);
    onLoginSuccess(response.data.user);
    resetSocialState();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const endpoint = isLoginView ? '/auth/login' : '/auth/register';
      authMutation.mutate(
        { endpoint, payload: formData },
        {
          onSuccess: (data) => {
            if (isLoginView) {
              localStorage.setItem('token', data.accessToken);
              onLoginSuccess(data.user);
              resetSocialState();
              onClose();
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
        const response = await apiClient.post('/auth/facebook', {
          facebookAccessToken: fbAccessToken,
        });

        localStorage.setItem('token', response.data.accessToken);
        onLoginSuccess(response.data.user);
        done();
        resetSocialState();
        onClose();
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <button onClick={onClose} className="absolute right-6 top-6 z-10 rounded-full p-2 hover:bg-gray-100">
          <XMarkIcon className="h-6 w-6 text-gray-400" />
        </button>

        <div className="p-10">
          <div className="mb-8 rounded-3xl border border-[#f3dfcf] bg-gradient-to-br from-[#fff9f2] to-[#fff2e6] px-4 py-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f1842a] to-[#d85f1f] text-2xl font-black text-white shadow-lg shadow-orange-200">
              {BRAND_LOGO}
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d06a2e]">The Avengers House</p>
            <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-[#1f1a17]">
              {showForgotView ? 'Khôi phục mật khẩu' : isLoginView ? 'Chào mừng bạn quay lại!' : 'Gia nhập Avengers House'}
            </h2>
            <p className="mt-2 text-sm font-semibold text-[#867b73]">
              {showForgotView
                ? 'Nhập email để nhận OTP và đặt mật khẩu mới'
                : isLoginView
                  ? 'Đăng nhập để nhận ưu đãi đặc biệt'
                  : 'Đăng ký để tích điểm đổi quà'}
            </p>
          </div>

          {showForgotView ? (
            <>
              <form onSubmit={forgotStep === 'REQUEST' ? handleForgotRequest : handleForgotReset} className="space-y-4">
                <input
                  type="text"
                  placeholder="Email hoặc tên đăng nhập"
                  required
                  value={forgotForm.email}
                  className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
                  onChange={(e) => setForgotForm((prev) => ({ ...prev, email: e.target.value }))}
                />

                {forgotStep === 'RESET' ? (
                  <>
                    <input
                      type="text"
                      placeholder="Mã OTP (6 số)"
                      required
                      value={forgotForm.otp}
                      maxLength={6}
                      className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
                      onChange={(e) => setForgotForm((prev) => ({ ...prev, otp: e.target.value.replace(/\D/g, '') }))}
                    />
                    <input
                      type="password"
                      placeholder="Mật khẩu mới"
                      required
                      value={forgotForm.newPassword}
                      className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
                      onChange={(e) => setForgotForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="Nhập lại mật khẩu mới"
                      required
                      value={forgotForm.confirmPassword}
                      className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
                      onChange={(e) => setForgotForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    />
                  </>
                ) : null}

                {forgotInfo ? <p className="text-center text-xs font-bold text-emerald-600">{forgotInfo}</p> : null}
                {error ? <p className="text-center text-xs font-bold text-red-500">{error}</p> : null}

                <button
                  disabled={forgotRequestMutation.isPending || forgotResetMutation.isPending}
                  className="w-full rounded-2xl bg-tch-orange py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 disabled:bg-gray-300"
                >
                  {forgotRequestMutation.isPending || forgotResetMutation.isPending
                    ? 'Đang xử lý...'
                    : forgotStep === 'REQUEST'
                      ? 'Gửi mã OTP'
                      : 'Xác nhận đặt lại mật khẩu'}
                </button>
              </form>

              <div className="mt-6 flex items-center justify-between gap-4 text-xs font-black uppercase text-gray-500">
                <button
                  type="button"
                  className="transition-colors hover:text-tch-orange"
                  onClick={() => {
                    setShowForgotView(false);
                    setForgotStep('REQUEST');
                    setForgotInfo('');
                    setError('');
                    setForgotForm({ email: '', otp: '', newPassword: '', confirmPassword: '' });
                  }}
                >
                  Quay lại đăng nhập
                </button>
                {forgotStep === 'RESET' ? (
                  <button
                    type="button"
                    className="transition-colors hover:text-tch-orange"
                    onClick={() => {
                      setForgotStep('REQUEST');
                      setError('');
                      setForgotInfo('');
                      setForgotForm((prev) => ({ ...prev, otp: '', newPassword: '', confirmPassword: '' }));
                    }}
                  >
                    Gửi lại OTP
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>

          {(canUseGoogle || canUseFacebook) && !showGooglePanel && (
            <div className="mb-4 grid gap-3">
              {canUseGoogle && (
                <button
                  type="button"
                  onClick={() => {
                    setShowGooglePanel(true);
                    setError('');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e4dfd7] bg-white px-4 py-3 text-sm font-black text-[#2e2a27] transition-all hover:border-[#d8c2b4] hover:bg-[#fffaf6]"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.4l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.8-.1-1.2H12z"/>
                    <path fill="#34A853" d="M2.4 7.6l3.2 2.3C6.5 7.9 9 6 12 6c1.9 0 3.2.8 3.9 1.4l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4c-3.7 0-6.9 2.1-8.6 5.2z"/>
                    <path fill="#4A90E2" d="M12 21.6c2.5 0 4.7-.8 6.2-2.2l-2.9-2.4c-.8.6-1.9 1-3.3 1-3.9 0-5.3-2.6-5.5-3.9l-3.2 2.5c1.7 3.2 5 5 8.7 5z"/>
                    <path fill="#FBBC05" d="M2.4 16.4l3.2-2.5c-.2-.5-.3-1.1-.3-1.9s.1-1.4.3-2L2.4 7.6C1.7 9 1.2 10.5 1.2 12s.5 3 1.2 4.4z"/>
                  </svg>
                  <span>{isLoginView ? 'Đăng nhập với Google' : 'Đăng ký nhanh với Google'}</span>
                </button>
              )}

              {canUseFacebook && isLoginView && (
                <button
                  type="button"
                  onClick={handleFacebookLogin}
                  disabled={facebookPending}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#cdd7f4] bg-[#edf3ff] px-4 py-3 text-sm font-black text-[#244f9a] transition-all hover:bg-[#e4eeff] disabled:opacity-70"
                >
                  <span aria-hidden="true" style={{ fontSize: '1rem', fontWeight: 900 }}>f</span>
                  <span>{facebookPending ? 'Đang kết nối Facebook...' : 'Đăng nhập với Facebook'}</span>
                </button>
              )}
            </div>
          )}

          {canUseGoogle && showGooglePanel && (
            <div className="mb-5 rounded-2xl border border-[#eadfcd] bg-[#fff8ef] p-4">
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

              <button
                type="button"
                onClick={() => {
                  resetSocialState();
                  setError('');
                }}
                className="mt-3 w-full text-xs font-black uppercase text-[#7f7670] hover:text-[#312b27]"
              >
                Ẩn khung Google
              </button>
            </div>
          )}

          {!canUseGoogle && !canUseFacebook && (
            <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              Đăng nhập mạng xã hội chưa được cấu hình. Vui lòng thêm Google/Facebook app key.
            </p>
          )}

          {(canUseGoogle || canUseFacebook) && (
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-300"></div>
              <span className="text-xs font-bold text-gray-400">HOAC</span>
              <div className="h-px flex-1 bg-gray-300"></div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoginView && (
              <input
                type="text"
                placeholder="Họ và tên"
                required
                className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
                onChange={(e) => setFormData({ ...formData, hoTen: e.target.value })}
              />
            )}
            <input
              type="email"
              placeholder="Email của bạn"
              required
              className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Mật khẩu"
              required
              className="w-full rounded-2xl border-none bg-gray-50 px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-tch-orange"
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />

            {error && <p className="text-center text-xs font-bold text-red-500">{error}</p>}

            <button
              disabled={authMutation.isPending}
              className="w-full rounded-2xl bg-tch-orange py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 disabled:bg-gray-300"
            >
              {authMutation.isPending
                ? 'Đang xử lý...'
                : isLoginView
                  ? 'Đăng nhập'
                  : 'Đăng ký ngay'}
            </button>

            {isLoginView ? (
              <button
                type="button"
                onClick={() => {
                  setShowForgotView(true);
                  setError('');
                  setForgotInfo('');
                  setForgotStep('REQUEST');
                  setForgotForm((prev) => ({ ...prev, email: formData.email || '' }));
                }}
                className="w-full text-center text-xs font-black uppercase text-[#8e7f76] hover:text-tch-orange"
              >
                Quên mật khẩu?
              </button>
            ) : null}
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => {
                setIsLoginView(!isLoginView);
                setError('');
                setFormData({ email: '', password: '', hoTen: '', soDienThoai: '' });
                resetSocialState();
              }}
              className="text-xs font-black uppercase text-gray-400 transition-colors hover:text-tch-orange"
            >
              {isLoginView ? 'Bạn chưa có tài khoản? Đăng ký' : 'Bạn đã có tài khoản? Đăng nhập'}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const RECAPTCHA_SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
  const FACEBOOK_APP_ID = String(import.meta.env.VITE_FACEBOOK_APP_ID || '').trim();

  const canUseGoogle = /\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID);
  const canUseRecaptcha = !!RECAPTCHA_SITE_KEY && !RECAPTCHA_SITE_KEY.startsWith('YOUR_');
  const canUseFacebook = !!FACEBOOK_APP_ID;

  let content = (
    <AuthModalInner
      isOpen={isOpen}
      onClose={onClose}
      onLoginSuccess={onLoginSuccess}
      canUseGoogle={canUseGoogle}
      canUseFacebook={canUseFacebook}
      canUseRecaptcha={canUseRecaptcha}
    />
  );

  if (canUseGoogle) {
    content = <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{content}</GoogleOAuthProvider>;
  }

  return content;
}
