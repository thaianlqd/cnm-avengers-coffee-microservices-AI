import { WorkspaceSidebar, WorkspaceSearch } from '../../components/console/WorkspaceNavigation'
import { AdminNotificationBell } from '../shared/components/AdminNotificationBell'
import { TopbarUserDropdown } from '../shared/components/UserProfileModals'
import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import {
  ChartNoAxesCombined,
  Store,
  Wallet,
  CreditCard,
  DollarSign,
  Package,
  AlertTriangle,
  Clock,
  UserCheck,
  RefreshCw,
} from '../../components/console/WorkspaceIcons';
import { API_BASE_URL } from "../admin-dashboard/constants";
import { DashboardSkeleton } from "../../components/console/DashboardCharts";
import { WorkspaceErrorBoundary } from "../../components/console/WorkspaceErrorBoundary";

// Lazy load từng module nghiệp vụ riêng biệt
const HoSoDangKyManager = lazy(() =>
  import("./HoSoDangKyManager").then((module) => ({
    default: module.HoSoDangKyManager,
  })),
);
const DongTienTab = lazy(() =>
  import("./DongTienTab").then((module) => ({ default: module.DongTienTab })),
);
const BiDashboard = lazy(() => import("./BiDashboard"));
const KioskNetworkManager = lazy(() =>
  import("./KioskNetworkManager").then((module) => ({
    default: module.KioskNetworkManager,
  })),
);
const DonMuaComboTab = lazy(() =>
  import("./FranchisePanel").then((module) => ({
    default: module.DonMuaComboTab,
  })),
);
const CongNoTab = lazy(() =>
  import("./FranchisePanel").then((module) => ({
    default: module.CongNoTab,
  })),
);
const RoyaltyTab = lazy(() =>
  import("./FranchisePanel").then((module) => ({
    default: module.RoyaltyTab,
  })),
);
const DoiSoatTab = lazy(() =>
  import("./FranchisePanel").then((module) => ({
    default: module.DoiSoatTab,
  })),
);
const AuditLogTab = lazy(() =>
  import("./FranchisePanel").then((module) => ({
    default: module.AuditLogTab,
  })),
);

// ─── Cấu Trúc Nhóm Nghiệp Vụ Quản Trị Nhượng Quyền ──────────────────────────
const MODULE_GROUPS = [
  {
    label: "ĐỐI TÁC & KIOSK",
    items: [
      { id: "ho-so", label: "Hồ sơ đối tác", icon: UserCheck, subtitle: "Thẩm định hồ sơ · Yêu cầu cọc · Kích hoạt Kiosk & Cấp tài khoản" },
      { id: "kiosk", label: "Mạng lưới Kiosk", icon: Store, subtitle: "Theo dõi điểm bán Kiosk · Quản lý hợp đồng · Gia hạn & Chấm dứt" },
      { id: "combo", label: "Đơn mua Combo", icon: Package, subtitle: "Tiếp nhận và xử lý đơn đặt combo nguyên liệu từ Kiosk" },
    ],
  },
  {
    label: "TÀI CHÍNH & DÒNG TIỀN",
    items: [
      { id: "bi", label: "Báo cáo tài chính", icon: ChartNoAxesCombined, subtitle: "Báo cáo doanh thu chuỗi · Phân tích dòng tiền & Chỉ số KPI" },
      { id: "thu-chi", label: "Thu chi Kiosk", icon: Wallet, subtitle: "Theo dõi dòng tiền cọc, tất toán gói, combo, royalty & Lập phiếu giao dịch" },
      { id: "cong-no", label: "Công nợ Kiosk", icon: CreditCard, subtitle: "Theo dõi công nợ gói, combo nguyên liệu, nhắc nợ & Hóa đơn VAT" },
      { id: "royalty", label: "Phí Royalty", icon: DollarSign, subtitle: "Bảng kê phí bản quyền thương hiệu hàng tháng của mạng lưới Kiosk" },
    ],
  },
  {
    label: "KIỂM SOÁT & GIÁM SÁT",
    items: [
      { id: "doi-soat", label: "Đối soát gian lận", icon: AlertTriangle, subtitle: "Phân tích chênh lệch combo vs doanh thu POS · Lập biên bản vi phạm" },
      { id: "audit-log", label: "Nhật ký Audit", icon: Clock, subtitle: "Lịch sử thao tác nghiệp vụ của quản trị viên nhượng quyền" },
    ],
  },
];

export function AccountantFranchiseShell({ session, onLogout }) {
  const [currentModule, setCurrentModule] = useState("ho-so");
  const [biData, setBiData] = useState(null);
  const [biError, setBiError] = useState("");
  const [revision, setRevision] = useState(0);
  const token = session?.token || session?.accessToken;

  // Danh sách phẳng tất cả modules cho Search và Header
  const allModules = useMemo(() => {
    return MODULE_GROUPS.flatMap((group) => group.items);
  }, []);

  const activeModuleInfo = useMemo(() => {
    return allModules.find((m) => m.id === currentModule) || allModules[0];
  }, [allModules, currentModule]);

  useEffect(() => {
    if (currentModule !== "bi") return;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/franchise/dashboard/admin`, {
      signal: controller.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success || !payload.data)
          throw new Error(
            payload.message ||
              "Không tải được báo cáo tài chính. Vui lòng thử lại.",
          );
        if (!controller.signal.aborted) setBiData(payload.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setBiError(error.message);
      });
    return () => controller.abort();
  }, [currentModule, token, revision]);

  const refresh = () => {
    setBiData(null);
    setBiError("");
    setRevision((value) => value + 1);
  };

  const changeModule = (id) => {
    setBiData(null);
    setBiError("");
    setCurrentModule(id);
  };

  return (
    <div className="console-shell franchise-manager-workspace" data-actor="accountant">
      <WorkspaceSidebar
        groups={MODULE_GROUPS}
        activeTab={currentModule}
        onSelect={changeModule}
        session={session}
        label="Quản lý nhượng quyền"
        onLogout={onLogout}
      />
      <main className="console-main">
        <header className="console-topbar">
          <div>
            <span className="console-eyebrow">ĐIỀU HÀNH NHƯỢNG QUYỀN</span>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', margin: '2px 0 0' }}>
              {activeModuleInfo?.label}
            </h2>
            {activeModuleInfo?.subtitle && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 400 }}>
                {activeModuleInfo.subtitle}
              </div>
            )}
          </div>
          <div className="workspace-topbar-actions">
            <WorkspaceSearch items={allModules} onSelect={changeModule} />
            <AdminNotificationBell session={session} />
            <TopbarUserDropdown session={session} onLogout={onLogout} />
            {currentModule === "bi" && (
              <button className="console-button" onClick={refresh}>
                <RefreshCw size={16} /> Làm mới báo cáo
              </button>
            )}
          </div>
        </header>

        <div key={currentModule} className="console-page" style={{ padding: '24px 32px' }}>
          <WorkspaceErrorBoundary key={currentModule} inline>
            <Suspense fallback={<DashboardSkeleton />}>
              {currentModule === "ho-so" ? (
                <HoSoDangKyManager />
              ) : currentModule === "kiosk" ? (
                <KioskNetworkManager />
              ) : currentModule === "combo" ? (
                <DonMuaComboTab />
              ) : currentModule === "thu-chi" ? (
                <DongTienTab />
              ) : currentModule === "cong-no" ? (
                <CongNoTab />
              ) : currentModule === "royalty" ? (
                <RoyaltyTab />
              ) : currentModule === "doi-soat" ? (
                <DoiSoatTab />
              ) : currentModule === "audit-log" ? (
                <AuditLogTab />
              ) : currentModule === "bi" ? (
                biError ? (
                  <div className="console-error" role="alert">
                    {biError}
                    <button className="console-button" onClick={refresh}>
                      Thử lại
                    </button>
                  </div>
                ) : (
                  <BiDashboard data={biData} />
                )
              ) : (
                <HoSoDangKyManager />
              )}
            </Suspense>
          </WorkspaceErrorBoundary>
        </div>
      </main>
    </div>
  );
}
