import OperationalPageFrame from '../../components/console/OperationalPageFrame'
import WorkspaceLoading from '../../components/console/WorkspaceLoading'
import { franchiseApi } from './franchiseApi'
import { FranchiseActionProvider } from './FranchiseWorkspaceUI'
import './AccountantWorkspace.css'
import { Button } from '../../components/ui/button'
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
  { label: "TỔNG QUAN", items: [{ id: "bi", label: "Tổng quan", icon: ChartNoAxesCombined, subtitle: "Theo dõi hoạt động kiosk, doanh thu và các khoản cần thu." }] },
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
      { id: "thu-chi", label: "Thu chi Kiosk", icon: Wallet, subtitle: "Theo dõi dòng tiền cọc, tất toán gói, combo, chia sẻ doanh thu & Lập phiếu giao dịch" },
      { id: "cong-no", label: "Công nợ Kiosk", icon: CreditCard, subtitle: "Theo dõi công nợ gói, combo nguyên liệu, nhắc nợ & Hóa đơn VAT" },
      { id: "royalty", label: "Chia sẻ doanh thu", icon: DollarSign, subtitle: "Bảng kê khoản chia sẻ doanh thu với thương hiệu theo tỷ lệ trong hợp đồng" },
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
  const [currentModule, setCurrentModule] = useState("bi");
  const [biData, setBiData] = useState(null);
  const [biError, setBiError] = useState("");
  const [revision, setRevision] = useState(0);
  const token = session?.token || session?.accessToken;

  // Danh sách phẳng tất cả modules cho Search và Header
  const allModules = useMemo(() => {
    return MODULE_GROUPS.flatMap((group) => group.items);
  }, []);

  useEffect(() => {
    if (currentModule !== "bi") return;
    const controller = new AbortController();
    franchiseApi('/franchise/dashboard/admin', {
      signal: controller.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((payload) => {
        if (!payload.success || !payload.data)
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
    <FranchiseActionProvider><div className="console-shell franchise-manager-workspace" data-actor="accountant" style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <WorkspaceSidebar
        groups={MODULE_GROUPS}
        activeTab={currentModule}
        onSelect={changeModule}
        session={session}
        label="Quản lý nhượng quyền"
        onLogout={onLogout}
      />
      <main className="console-main" style={{ background: '#f8fafc', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <OperationalPageFrame groups={MODULE_GROUPS} activeTab={currentModule} onSelect={changeModule} session={session} onLogout={onLogout} branchName="Quản lý nhượng quyền"
          pageDescriptions={Object.fromEntries(allModules.map(item=>[item.id,item.subtitle]))}
          headingActions={currentModule === 'bi' ? <Button variant="outline" onClick={refresh}><RefreshCw size={15}/>Làm mới báo cáo</Button> : null}>
        <div key={currentModule} className="accountant-module" data-module={currentModule}>
          <WorkspaceErrorBoundary key={currentModule} inline>
            <Suspense fallback={<WorkspaceLoading />}>
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
                    <Button className="console-button" onClick={refresh}>
                      Thử lại
                    </Button>
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
        </OperationalPageFrame>
      </main>
    </div></FranchiseActionProvider>
  );
}
