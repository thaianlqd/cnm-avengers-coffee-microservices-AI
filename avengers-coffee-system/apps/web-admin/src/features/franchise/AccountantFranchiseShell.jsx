import { WorkspaceSidebar, WorkspaceSearch } from '../../components/console/WorkspaceNavigation'
import { AdminNotificationBell } from '../shared/components/AdminNotificationBell'
import { useState, useEffect, lazy, Suspense } from "react";
import {
  ChartNoAxesCombined,
  Store,
  Wallet,
  LogOut,
  Coffee,
  RefreshCw,
} from "lucide-react";
import { API_BASE_URL } from "../admin-dashboard/constants";
import { DashboardSkeleton } from "../../components/console/DashboardCharts";
import { WorkspaceErrorBoundary } from "../../components/console/WorkspaceErrorBoundary";
const FranchisePanel = lazy(() =>
  import("./FranchisePanel").then((module) => ({
    default: module.FranchisePanel,
  })),
);
const DongTienTab = lazy(() =>
  import("./DongTienTab").then((module) => ({ default: module.DongTienTab })),
);
const BiDashboard = lazy(() => import("./BiDashboard"));
const modules = [
  { id: "bi", label: "Tổng quan tài chính", icon: ChartNoAxesCombined },
  { id: "franchise", label: "Quản lý nhượng quyền", icon: Store },
  { id: "thu-chi", label: "Dòng tiền & đối soát", icon: Wallet },
];

export function AccountantFranchiseShell({ session, onLogout }) {
  const [currentModule, setCurrentModule] = useState("bi");
  const [biData, setBiData] = useState(null);
  const [biError, setBiError] = useState("");
  const [revision, setRevision] = useState(0);
  const token = session?.token || session?.accessToken;
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
    <div className="console-shell" data-actor="accountant">
      <WorkspaceSidebar groups={[{ label: 'Báo cáo & nghiệp vụ', items: modules }]} activeTab={currentModule} onSelect={changeModule} session={session} label="Kế toán hệ thống" onLogout={onLogout} />
      <main className="console-main">
        <header className="console-topbar">
          <div>
            <span className="console-eyebrow">TRUNG TÂM TÀI CHÍNH</span>
            <h2>
              {modules.find((module) => module.id === currentModule)?.label}
            </h2>
          </div>
          <div className="workspace-topbar-actions">
          <WorkspaceSearch items={modules} onSelect={changeModule} />
          <AdminNotificationBell session={session} />
          {currentModule === "bi" && (
            <button className="console-button" onClick={refresh}>
              <RefreshCw size={17} /> Làm mới báo cáo
            </button>
          )}
          </div>
        </header>
        <div key={currentModule} className="console-page">
          <WorkspaceErrorBoundary key={currentModule} inline>
          <Suspense fallback={<DashboardSkeleton />}>
            {currentModule === "franchise" ? (
              <FranchisePanel />
            ) : currentModule === "thu-chi" ? (
              <DongTienTab />
            ) : biError ? (
              <div className="console-error" role="alert">
                {biError}
                <button className="console-button" onClick={refresh}>
                  Thử lại
                </button>
              </div>
            ) : (
              <BiDashboard data={biData} />
            )}
          </Suspense>
          </WorkspaceErrorBoundary>
        </div>
      </main>
    </div>
  );
}
