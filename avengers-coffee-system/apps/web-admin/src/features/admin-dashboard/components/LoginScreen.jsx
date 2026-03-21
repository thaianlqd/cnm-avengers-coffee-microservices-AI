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
        <p>Đăng nhập bằng tài khoản đã được tạo thực tế trong hệ thống.</p>
        <form onSubmit={onLogin} className="login-form">
          <label htmlFor="identifier">Tên đăng nhập hoặc Email</label>
          <input
            id="identifier"
            value={loginForm.identifier}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, identifier: e.target.value }))}
            placeholder="Nhập username hoặc email"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            required
          />

          {loginStatus.error ? <p className="error-text">{loginStatus.error}</p> : null}

          <button type="submit" disabled={loginStatus.loading}>
            {loginStatus.loading ? 'Đang đăng nhập...' : 'Đăng nhập vào Admin'}
          </button>
        </form>
        <div className="hint-box">
          <p>Ví dụ định dạng: username hoặc email</p>
          <p>Ví dụ: manager.q7 hoặc manager.q7@avengerscoffee.vn</p>
          <p>Mật khẩu: theo tài khoản đã cấp thực tế</p>
        </div>
      </section>
    </div>
  )
}
