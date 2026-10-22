import React, { useEffect, useState, useRef } from 'react';
import { decodeAuthSession, setAccountIdentity, clearAnalysisDraft, retainAnalysisDraft, type AuthSession } from './utils/authSession.mjs';
import { usePlatformStore } from './store/usePlatformStore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { EventDetailModal } from './components/EventDetailModal';
import { PipelineLogModal } from './components/PipelineLogModal';
import { TablePreviewModal } from './components/TablePreviewModal';

// 4 Primary Views matching the updated clean navigation
import { ArchitectureView } from './views/ArchitectureView';
import { DashboardHubView } from './views/DashboardHubView';
import { LoginView } from './views/LoginView';
import { OverviewView } from './views/OverviewView';
import { AnalyticsView } from './views/AnalyticsView';
import { DataExplorerView } from './views/DataExplorerView';
import { SystemAdminView } from './views/SystemAdminView';

const EMPTY_PERMISSIONS: string[] = [];
const PlatformApp: React.FC<{permissions?: string[]; onLogout: () => void; logoutBusy: boolean}> = ({permissions = EMPTY_PERMISSIONS, onLogout, logoutBusy}) => {
  const { 
    activeTab,
    analyticsSubTab,
    setAnalyticsSubTab,
    dataErrors,
    fetchOverview, 
    fetchTables, 
    fetchMarts, 
    fetchSystem 
  } = usePlatformStore();

  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
  }, [activeTab, fetchOverview]);

  const visibleErrors = Object.entries(dataErrors).filter(([key,message]) => Boolean(message) &&
    (activeTab === 'overview' ? ['overview','pipelines','streaming','marts','storesData','customersData','productsData'].includes(key) :
      activeTab === 'analytics' && analyticsSubTab !== 'hub' ? ['marts','storesData','customersData','productsData'].includes(key) :
      activeTab === 'explorer' ? key === 'tables' : activeTab === 'system' ? key === 'system' : false)).map(([,message]) => message);


  const renderActiveView = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewView />;
      case 'analytics':
        return analyticsSubTab === 'hub' ? <DashboardHubView /> : <><button onClick={()=>setAnalyticsSubTab('hub')} className="mb-4 text-sm font-medium text-emerald-800">← Tất cả dashboard</button><AnalyticsView /></>;
      case 'ai_assistant':
      case 'saved_reports':
        return <AnalyticsView />;
      case 'explorer':
        return <DataExplorerView />;
      case 'architecture':
        return <ArchitectureView />;
      case 'system':
        return permissions.includes('system.read') ? <SystemAdminView /> : <section role="status" className="rounded-xl border bg-white p-6">Tài khoản chưa được cấp quyền xem người dùng và nhật ký quản trị.</section>;
      default:
        return <OverviewView />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Left Compact Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header onLogout={onLogout} logoutBusy={logoutBusy} />

        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5 bg-[#f8fafc]">
          <div className="max-w-[1400px] mx-auto">
            {visibleErrors.length > 0 && <section role="alert" data-platform-load-errors className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Chưa tải được một số nguồn dữ liệu</p>
              <ul className="mt-1 list-disc pl-5">{[...new Set(visibleErrors)].map(message => <li key={message}>{message}</li>)}</ul>
              <button className="mt-2 underline" onClick={() => { if(activeTab === 'overview') {fetchOverview();fetchMarts();usePlatformStore.getState().fetchStores();usePlatformStore.getState().fetchCustomers();usePlatformStore.getState().fetchProducts();} else if(activeTab === 'explorer') fetchTables(); else if(activeTab === 'system') fetchSystem(); }}>Tải lại dữ liệu</button>
            </section>}
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Modals & Popups */}
      <EventDetailModal />
      <PipelineLogModal />
      <TablePreviewModal />

      {/* Toast Notification */}
      <Toast />
    </div>
  );
};

export const App: React.FC = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const epoch = useRef(0);
  const apply = (next: AuthSession | null) => {
    if(next)retainAnalysisDraft(next.identity);
    setAccountIdentity(next?.identity);
    // Remounting the workspace aborts its prior requests. Clear shared BI data
    // before a different account can render. Pending jobs use account keys.
    usePlatformStore.setState({dashboardSearch:null,dataErrors:{},overview:null,pipelines:null,tables:[],marts:null,storesData:null,
      customersData:null,productsData:null,users:[],roles:[],systemLogs:[],realtimeEvents:[],queryResult:null});
    window.dispatchEvent(new CustomEvent('analytics-account',{detail:next?.identity || null}));
    setSession(next);
  };
  useEffect(() => {
    const version=++epoch.current;
    const controller=new AbortController();
    fetch('/api/auth/session',{signal:controller.signal,credentials:'same-origin',cache:'no-store'})
      .then(async response => {
        if (!response.ok) return null;
        return decodeAuthSession(await response.json());
      }).then(next => {if (version===epoch.current) apply(next);})
      .catch(error => {if (error.name!=='AbortError' && version===epoch.current) setMessage('Chưa kết nối được với phiên đăng nhập.');})
      .finally(()=>{if(version===epoch.current)setLoading(false);});
    const expired=()=>{epoch.current++;apply(null);setLoading(false);setMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');};
    window.addEventListener('analytics-auth-expired',expired);
    return ()=>{epoch.current++;controller.abort();window.removeEventListener('analytics-auth-expired',expired);};
  },[]);
  const login=async(event:React.FormEvent)=>{
    event.preventDefault();const version=++epoch.current;setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({tai_khoan:username,mat_khau:password})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.detail || 'Đăng nhập chưa thành công.');
      if(version===epoch.current){apply(decodeAuthSession(data));setPassword('');}
    } catch(error) {if(version===epoch.current)setMessage(error instanceof Error?error.message:'Đăng nhập chưa thành công.');}
    finally {if(version===epoch.current)setBusy(false);}
  };
  const logout=async()=>{
    epoch.current++;setBusy(true);
    try {
      const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
      if(!response.ok)throw new Error('Chưa đăng xuất được; vui lòng thử lại.');
      clearAnalysisDraft();apply(null);setPassword('');setMessage('');
    } catch(error){setMessage(error instanceof Error?error.message:'Chưa đăng xuất được.');}
    finally {setBusy(false);}
  };
  if(loading)return <main className="min-h-screen grid place-items-center" role="status">Đang kiểm tra phiên đăng nhập…</main>;
  if(!session)return <LoginView username={username} password={password} busy={busy} message={message}
    onUsername={setUsername} onPassword={setPassword} onSubmit={login} />;
  return <><PlatformApp key={session.identity} permissions={session.permissions} onLogout={logout} logoutBusy={busy}/>{message&&<p role="alert" className="fixed right-4 top-32 z-50 max-w-sm md:top-20 rounded-xl border border-red-100 bg-white p-3 text-sm text-red-700 shadow-lg">{message}</p>}</>;
};

export default App;
