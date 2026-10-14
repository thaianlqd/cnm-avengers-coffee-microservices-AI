import { useState } from "react";
import {
  Coffee,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  Eye,
  EyeOff,
} from "lucide-react";

const workspaces = [
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    title: "Quản trị toàn hệ thống",
    description:
      "Kết nối chi nhánh, khách hàng, sản phẩm và đội ngũ trong một trung tâm quản trị.",
    tags: ["Mạng lưới cửa hàng", "Sản phẩm & khách hàng", "Báo cáo hệ thống"],
    image: '/images/login/highlands-gifts.jpg',
    imageAlt: 'Góc quà tặng và cà phê trong không gian Highlands mùa lễ hội',
  },
  {
    id: "manager",
    label: "Quản lý",
    icon: Store,
    title: "Nắm trọn vận hành cửa hàng",
    description:
      "Theo dõi đơn hàng, sắp xếp nhân sự và quản lý hoạt động chi nhánh mỗi ngày.",
    tags: ["Tổng quan chi nhánh", "Lịch làm nhân sự", "Đối soát ca"],
    image: '/images/login/highlands-flagship.jpg',
    imageAlt: 'Không gian cửa hàng flagship Highlands Coffee',
  },
  {
    id: "staff",
    label: "Nhân viên",
    icon: Users,
    title: "Một ca làm việc thật thuận tiện",
    description:
      "Tiếp nhận đơn, tạo hóa đơn POS và xử lý công việc trong một giao diện rõ ràng.",
    tags: ["Hàng đợi đơn", "Bán hàng POS", "Chốt ca"],
    image: '/images/login/highlands-team.jpg',
    imageAlt: 'Đội ngũ Highlands Coffee tại cửa hàng',
  },
  {
    id: "partner",
    label: "Đối tác kiosk",
    icon: Coffee,
    title: "Phát triển kiosk cùng Avengers",
    description:
      "Quản lý điểm bán, nguyên liệu, nhân sự và công nợ của mạng lưới kiosk.",
    tags: ["Điểm bán kiosk", "Nhập combo", "Công nợ & royalty"],
    image: '/images/login/highlands-roastery.jpg',
    imageAlt: 'Không gian rang xay cà phê tại Highlands Coffee',
  },
  {
    id: "accountant",
    label: "Kế toán",
    icon: Wallet,
    title: "Số liệu rõ ràng, đối soát dễ dàng",
    description:
      "Tổng hợp tài chính nhượng quyền, theo dõi dòng tiền và các khoản cần đối soát.",
    tags: ["Báo cáo tài chính", "Dòng tiền", "Đối soát công nợ"],
    image: '/images/login/highlands-christmas-team.jpg',
    imageAlt: 'Đội ngũ Highlands cùng đón Giáng sinh',
  },
];

export function LoginScreen({
  loginForm,
  setLoginForm,
  loginStatus,
  onLogin,
  pendingPasswordChange,
  onConfirmPasswordChange,
}) {
  const [workspace, setWorkspace] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('workspace');
    return workspaces.some(item => item.id === requested) ? requested : 'manager';
  });
  const [submittedWorkspace, setSubmittedWorkspace] = useState(workspace);
  const [showPassword, setShowPassword] = useState(false);
  const selected = workspaces.find((item) => item.id === workspace);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const selectWorkspace = (id) => {
    setWorkspace(id);
    setShowPassword(false);
    setLocalError('');
    setLoginForm(previous => ({ ...previous, password: '' }));
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', id);
    window.history.replaceState(null, '', url);
  };

  if (pendingPasswordChange) {
    const handleConfirm = (e) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        setLocalError("Mật khẩu nhập lại không khớp");
        return;
      }
      if (newPassword.length < 6) {
        setLocalError("Mật khẩu mới phải có ít nhất 6 ký tự");
        return;
      }
      setLocalError("");
      onConfirmPasswordChange(newPassword);
    };

    return (
      <div className="console-login" data-actor={workspace}>
        <img key={selected.image} className="console-login-photo" src={selected.image} alt={selected.imageAlt} fetchPriority="high" />
        <section className="console-login-story">
          <div className="console-login-copy">
          <p className="eyebrow">Bảo Mật Hệ Thống</p>
          <h1>Bắt buộc đổi mật khẩu lần đầu</h1>
          <p>
            Tài khoản Franchisee của bạn yêu cầu phải đổi mật khẩu ở lần đăng
            nhập đầu tiên để đảm bảo an toàn.
          </p>
          </div>
        </section>

        <section className="console-login-form">
          <div>
          <h2>Đổi mật khẩu mới</h2>
          <p>Xin chào, {pendingPasswordChange.user?.hoTen}</p>
          <form onSubmit={handleConfirm} className="console-login-fields">
            <label htmlFor="newPassword">Mật khẩu mới</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới"
              autoComplete="new-password"
              required
            />

            <label htmlFor="confirmPassword">Nhập lại mật khẩu mới</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Xác nhận mật khẩu mới"
              autoComplete="new-password"
              required
            />

            {(localError || loginStatus.error) && (
              <p className="error-text">{localError || loginStatus.error}</p>
            )}

            <button className="console-login-submit" type="submit" disabled={loginStatus.loading}>
              {loginStatus.loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>
          </form>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="console-login" data-actor={workspace}>
      <img key={selected.image} className="console-login-photo" src={selected.image} alt={selected.imageAlt} fetchPriority="high" />
      <section className="console-login-story" data-workspace={workspace}>
        <div className="console-login-logo">
          <Coffee size={30} />
          <span>
            AVENGERS COFFEE <small>WORKSPACE</small>
          </span>
        </div>
        <div className="console-login-copy">
          <span className="console-eyebrow">KHÔNG GIAN LÀM VIỆC</span>
          <h1>{selected.title}</h1>
          <p>{selected.description}</p>
          <div className="console-login-tags">
            {selected.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <span className="console-login-footer">
          Một hệ thống · Kết nối mọi hoạt động
        </span>
      </section>
      <section className="console-login-form">
        <div
          className="console-role-tabs"
          role="tablist"
          aria-label="Chọn nhóm đăng nhập"
        >
          {workspaces.map(({ id, label, icon }) => {
            const Icon = icon;
            return (
              <button
                type="button"
                key={id}
                role="tab"
                id={"login-tab-" + id}
                aria-selected={workspace === id}
                aria-controls="login-workspace"
                disabled={loginStatus.loading}
                tabIndex={workspace === id ? 0 : -1}
                onKeyDown={(event) => {
                  if (
                    ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const index = workspaces.findIndex(
                      (item) => item.id === workspace,
                    );
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? workspaces.length - 1
                          : (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              workspaces.length) %
                            workspaces.length;
                    selectWorkspace(workspaces[next].id);
                    document
                      .getElementById("login-tab-" + workspaces[next].id)
                      ?.focus();
                  }
                }}
                onClick={() => selectWorkspace(id)}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id="login-workspace"
          aria-labelledby={"login-tab-" + workspace}
        >
          <span className="console-eyebrow">CHÀO MỪNG TRỞ LẠI</span>
          <h2>Đăng nhập {selected.label.toLowerCase()}</h2>
          <p className="console-muted">
            Sẵn sàng cho một ngày làm việc hiệu quả.
          </p>
          <form onSubmit={(event) => { setSubmittedWorkspace(workspace); onLogin(event, workspace); }} className="console-login-fields">
            <label htmlFor="identifier">Tên đăng nhập hoặc email</label>
            <input
              id="identifier"
              value={loginForm.identifier}
              onChange={(event) =>
                setLoginForm((previous) => ({
                  ...previous,
                  identifier: event.target.value,
                }))
              }
              placeholder="Nhập tài khoản của bạn"
              autoComplete="username"
              required
            />
            <label htmlFor="password">Mật khẩu</label>
            <div className="console-password">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    password: event.target.value,
                  }))
                }
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {loginStatus.error && workspace === submittedWorkspace && (
              <p className="console-error" role="alert">
                {loginStatus.error}
              </p>
            )}
            <button
              type="submit"
              className="console-login-submit"
              disabled={loginStatus.loading}
            >
              {loginStatus.loading
                ? "Đang đăng nhập…"
                : "Đăng nhập vào không gian làm việc"}
            </button>
          </form>
          <p className="console-login-note">
            <ShieldCheck size={17} /> Chỉ tài khoản thuộc nhóm {selected.label} mới đăng nhập được tại đây.
          </p>
        </div>
      </section>
    </div>
  );
}
