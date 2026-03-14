export function LoginScreen({ loginForm, setLoginForm, loginStatus, onLogin }) {
  return (
    <div className="admin-login-shell">
      <section className="login-brand-panel">
        <p className="eyebrow">Avengers Coffee - Staff Console</p>
        <h1>Điều hành toàn bộ ca làm việc trên một màn hình</h1>
        <p>
          Theo dõi hàng đợi đơn, cập nhật trạng thái món, chốt ca tiền mặt và tạo hóa đơn POS ngay trong
          cùng một giao diện.
        </p>
        <div className="chip-row">
          <span>Luồng xử lý đơn</span>
          <span>Thực đơn và tồn kho</span>
          <span>Đối soát cuối ca</span>
        </div>
      </section>

      <section className="login-card">
        <h2>Đăng nhập nhân viên</h2>
        <p>Tài khoản mặc định đã được seed sẵn cho dự án này.</p>
        <form onSubmit={onLogin} className="login-form">
          <label htmlFor="identifier">Tên đăng nhập hoặc Email</label>
          <input
            id="identifier"
            value={loginForm.identifier}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, identifier: e.target.value }))}
            placeholder="thaian_staff"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="123456"
            autoComplete="current-password"
            required
          />

          {loginStatus.error ? <p className="error-text">{loginStatus.error}</p> : null}

          <button type="submit" disabled={loginStatus.loading}>
            {loginStatus.loading ? 'Đang đăng nhập...' : 'Đăng nhập vào Admin'}
          </button>
        </form>
        <div className="hint-box">
          <p>Tài khoản staff: thaian_staff</p>
          <p>Tài khoản manager: thaian_manager</p>
          <p>Mật khẩu mặc định: 123456</p>
        </div>
      </section>
    </div>
  )
}
