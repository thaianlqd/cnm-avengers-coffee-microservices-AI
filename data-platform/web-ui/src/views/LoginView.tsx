import React, { useState } from 'react';

type Props = {
  username: string;
  password: string;
  busy: boolean;
  message: string;
  onUsername: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

export const LoginView: React.FC<Props> = ({ username, password, busy, message, onUsername, onPassword, onSubmit }) => {
  const [showPassword, setShowPassword] = useState(false);

  return <main className="analytics-login">
    <img src="/images/login-analytics.svg" alt="" aria-hidden="true" className="analytics-login__background" fetchPriority="high" />
    <div className="analytics-login__shade" aria-hidden="true" />
    <div className="analytics-login__layout">
      <header className="analytics-login__brand">
        <span className="analytics-login__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 28 28" fill="none"><path d="M5 22V14M14 22V6M23 22V10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="23" cy="5" r="2" fill="currentColor" /></svg>
        </span>
        <div><p className="font-semibold tracking-tight text-white">Avengers Coffee</p><p className="mt-1 text-xs tracking-wide text-slate-400">Data & Analytics Platform</p></div>
      </header>
      <div className="analytics-login__content">
        <section className="analytics-login__hero" aria-labelledby="analytics-intro">
          <p className="analytics-login__eyebrow"><span aria-hidden="true" />Dữ liệu mở lối. Quyết định vươn xa.</p>
          <h2 id="analytics-intro">Nhìn rõ dữ liệu.<br /><span>Dẫn lối quyết định.</span></h2>
          <p className="analytics-login__description">Kết nối từng con số, khám phá những góc nhìn mới. Không gian phân tích cho toàn bộ hành trình kinh doanh.</p>
          <div className="analytics-login__topics" aria-label="Các góc nhìn dữ liệu"><span>Kinh doanh</span><span>Vận hành</span><span>Khách hàng</span></div>
          <div className="analytics-login__visual-caption" aria-hidden="true"><span />CONNECTED DATA. CLEARER INSIGHTS.</div>
        </section>
        <section className="analytics-login__card" aria-labelledby="login-title">
          <div className="analytics-login__card-heading">
            <span className="analytics-login__badge"><span aria-hidden="true" />Không gian quản trị</span>
            <span className="analytics-login__card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.5" /><path d="M8 15V12M12 15V8M16 15V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
          </div>
          <p className="analytics-login__welcome">CHÀO MỪNG TRỞ LẠI</p>
          <h1 id="login-title">Đăng nhập<br />Data Platform</h1>
          <p className="mb-8 mt-3 text-sm leading-6 text-slate-500">Truy cập không gian dữ liệu bằng tài khoản Avengers Coffee của bạn.</p>
          <form onSubmit={onSubmit} className="space-y-5" aria-label="Đăng nhập Data Platform">
            <label className="block text-sm font-medium text-slate-800">Tài khoản<input name="username" autoComplete="username" required maxLength={120} value={username} onChange={event => onUsername(event.target.value)} placeholder="Nhập tài khoản" className="analytics-login__input mt-2" /></label>
            <div><label htmlFor="login-password" className="block text-sm font-medium text-slate-800">Mật khẩu</label><div className="relative mt-2"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} value={password} onChange={event => onPassword(event.target.value)} placeholder="Nhập mật khẩu" className="analytics-login__input pr-16" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-medium text-slate-500 transition hover:text-blue-700 focus-visible:outline-blue-600">{showPassword ? 'Ẩn' : 'Hiện'}</button></div></div>
            {message && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
            <button disabled={busy} className="analytics-login__submit">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}<span aria-hidden="true">→</span></button>
          </form>
          <p className="analytics-login__access-note"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="4.5" y="8.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Dành cho tài khoản đã được cấp quyền truy cập.</p>
        </section>
      </div>
      <footer className="analytics-login__footer"><span>Avengers Coffee <span className="mx-2 text-slate-600">/</span> Data Platform</span><span>Dữ liệu cho những quyết định tốt hơn.</span></footer>
    </div>
  </main>;
};
