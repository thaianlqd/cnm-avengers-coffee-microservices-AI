import { useState } from 'react'

export function LoginScreen({ loginForm, setLoginForm, loginStatus, onLogin, pendingPasswordChange, onConfirmPasswordChange }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState('')

  if (pendingPasswordChange) {
    const handleConfirm = (e) => {
      e.preventDefault()
      if (newPassword !== confirmPassword) {
        setLocalError('Mật khẩu nhập lại không khớp')
        return
      }
      if (newPassword.length < 6) {
        setLocalError('Mật khẩu mới phải có ít nhất 6 ký tự')
        return
      }
      setLocalError('')
      onConfirmPasswordChange(newPassword)
    }

    return (
      <div className="admin-login-shell">
        <section className="login-brand-panel">
          <p className="eyebrow">Bảo Mật Hệ Thống</p>
          <h1>Bắt buộc đổi mật khẩu lần đầu</h1>
          <p>Tài khoản Franchisee của bạn yêu cầu phải đổi mật khẩu ở lần đăng nhập đầu tiên để đảm bảo an toàn.</p>
        </section>

        <section className="login-card">
          <h2>Đổi mật khẩu mới</h2>
          <p>Xin chào, {pendingPasswordChange.user?.hoTen}</p>
          <form onSubmit={handleConfirm} className="login-form">
            <label htmlFor="newPassword">Mật khẩu mới</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới"
              required
            />

            <label htmlFor="confirmPassword">Nhập lại mật khẩu mới</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Xác nhận mật khẩu mới"
              required
            />

            {(localError || loginStatus.error) && <p className="error-text">{localError || loginStatus.error}</p>}

            <button type="submit" disabled={loginStatus.loading}>
              {loginStatus.loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </form>
        </section>
      </div>
    )
  }

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
