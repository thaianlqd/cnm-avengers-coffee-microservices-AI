import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { useState } from "react";
import {
  Coffee,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  Eye,
  EyeOff,
} from '../../../components/console/WorkspaceIcons';

const workspaces = [
  {
    id: "admin",
    label: "Admin",
    tabLabel: "Admin",
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
    tabLabel: "Quản lý",
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
    tabLabel: "Nhân viên",
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
    tabLabel: "Đối tác Kiosk",
    icon: Coffee,
    title: "Phát triển kiosk cùng Avengers",
    description:
      "Quản lý điểm bán, nguyên liệu, nhân sự và công nợ của mạng lưới kiosk.",
    tags: ["Điểm bán kiosk", "Nhập combo", "Công nợ & chia sẻ doanh thu"],
    image: '/images/login/highlands-roastery.jpg',
    imageAlt: 'Không gian rang xay cà phê tại Highlands Coffee',
  },
  {
    id: "accountant",
    label: "Quản lý nhượng quyền",
    tabLabel: "Quản lý nhượng quyền",
    icon: Wallet,
    title: "Điều hành mạng lưới kiosk",
    description:
      "Theo dõi vận hành kiosk, đơn nguyên liệu, hợp đồng và công nợ nhượng quyền.",
    tags: ["Vận hành kiosk", "Đơn nguyên liệu", "Công nợ"],
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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <div className="console-password">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                autoComplete="new-password"
                required
              />
              <Button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                aria-label={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showNewPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </Button>
            </div>

            <Label htmlFor="confirmPassword">Nhập lại mật khẩu mới</Label>
            <div className="console-password">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu mới"
                autoComplete="new-password"
                required
              />
              <Button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </Button>
            </div>

            {(localError || loginStatus.error) && (
              <p className="error-text">{localError || loginStatus.error}</p>
            )}

            <Button className="console-login-submit" type="submit" disabled={loginStatus.loading}>
              {loginStatus.loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </Button>
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
          <Badge variant="outline" data-quiet-label="true" style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: '#ffffff', padding: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>
            <img src="/images/brand/logo.svg"  alt="Avengers Coffee" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          </Badge>
          <span>Avengers Coffee</span>
        </div>
        <div className="console-login-copy">
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
          {workspaces.map(({ id, label, tabLabel, icon }) => {
            const Icon = icon;
            const isSelected = workspace === id;
            return (
              <button
                type="button"
                key={id}
                role="tab"
                id={"login-tab-" + id}
                className={`console-role-tab ${isSelected ? "active" : ""}`}
                aria-selected={isSelected}
                aria-controls="login-workspace"
                title={label}
                disabled={loginStatus.loading}
                tabIndex={isSelected ? 0 : -1}
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
                <span className="console-role-tab-label">{tabLabel || label}</span>
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
            <Label htmlFor="identifier">Tên đăng nhập hoặc email</Label>
            <Input
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
            <Label htmlFor="password">Mật khẩu</Label>
            <div className="console-password">
              <Input
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
              <Button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </Button>
            </div>
            {loginStatus.error && workspace === submittedWorkspace && (
              <p className="console-error" role="alert">
                {loginStatus.error}
              </p>
            )}
            <Button
              type="submit"
              className="console-login-submit"
              disabled={loginStatus.loading}
            >
              {loginStatus.loading
                ? "Đang đăng nhập…"
                : "Đăng nhập vào không gian làm việc"}
            </Button>
          </form>
          <p className="console-login-note">
            <ShieldCheck size={17} /> Chỉ tài khoản thuộc nhóm {selected.label} mới đăng nhập được tại đây.
          </p>
        </div>
      </section>
    </div>
  );
}
