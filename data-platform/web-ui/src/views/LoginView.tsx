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
  return <main className="relative isolate min-h-screen overflow-hidden bg-[#183a32] text-slate-900">
    <img src="/images/login-cafe.png" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-left" />
    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0a241e]/85 via-[#0a241e]/35 to-[#0a241e]/20" />
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-7 sm:px-12 lg:px-16">
      <div className="flex items-center gap-3 text-white">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/25 bg-white/10 text-sm font-semibold backdrop-blur-sm">AC</span>
        <div><p className="font-semibold tracking-tight">Avengers Coffee</p><p className="text-xs text-white/65">Data & Analytics</p></div>
      </div>
      <div className="flex flex-1 items-center justify-center gap-16 py-12 lg:justify-between">
        <section className="hidden max-w-xl pb-6 text-white lg:block">
          <p className="mb-6 text-xs font-medium uppercase tracking-[.28em] text-emerald-200">Một góc nhìn. Nhiều cơ hội.</p>
          <h2 className="text-5xl font-semibold leading-[1.13] tracking-tight xl:text-6xl">Hiểu từng con số.<br /><span className="text-[#d8e8d1]">Chăm từng trải nghiệm.</span></h2>
          <p className="mt-7 max-w-md text-base leading-7 text-white/75">Từ một tách cà phê đến cả hành trình vận hành. Khám phá dữ liệu để đưa ra quyết định mỗi ngày.</p>
          <div className="mt-10 flex gap-3 text-xs text-white/80"><span className="rounded-full border border-white/20 px-4 py-2">Kinh doanh</span><span className="rounded-full border border-white/20 px-4 py-2">Vận hành</span><span className="rounded-full border border-white/20 px-4 py-2">Khách hàng</span></div>
        </section>
        <section className="w-full max-w-[390px] rounded-[28px] border border-white/60 bg-[#fffefb] p-7 shadow-2xl sm:p-9" aria-labelledby="login-title">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Không gian quản trị</span>
          <h1 id="login-title" className="text-2xl font-semibold tracking-tight">Đăng nhập Data Platform</h1>
          <p className="mb-7 mt-2 text-sm leading-6 text-slate-500">Chào mừng trở lại. Đăng nhập bằng tài khoản Avengers Coffee của bạn.</p>
          <form onSubmit={onSubmit} className="space-y-5" aria-label="Đăng nhập Data Platform">
            <label className="block text-sm font-medium">Tài khoản<input name="username" autoComplete="username" required maxLength={120} value={username} onChange={event => onUsername(event.target.value)} placeholder="Nhập tài khoản" className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" /></label>
            <div><label htmlFor="login-password" className="block text-sm font-medium">Mật khẩu</label><div className="relative mt-2"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} value={password} onChange={event => onPassword(event.target.value)} placeholder="Nhập mật khẩu" className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-3.5 pr-14 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} className="absolute inset-y-0 right-1 rounded-lg px-3 text-xs text-slate-500 focus-visible:outline-emerald-700">{showPassword ? 'Ẩn' : 'Hiện'}</button></div></div>
            {message && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-[#17624b] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#104d3b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}<span aria-hidden="true" className="ml-2">→</span></button>
          </form>
          <p className="mt-6 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">Dành cho tài khoản đã được cấp quyền truy cập.</p>
        </section>
      </div>
      <footer className="flex justify-between gap-4 text-[11px] text-white/60"><span>Avengers Coffee · Data Platform</span><span>Dữ liệu cho những quyết định tốt hơn.</span></footer>
    </div>
  </main>;
};
