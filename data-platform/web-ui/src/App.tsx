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
import { OverviewView } from './views/OverviewView';
import { AnalyticsView } from './views/AnalyticsView';
import { DataExplorerView } from './views/DataExplorerView';
import { SystemAdminView } from './views/SystemAdminView';

const EMPTY_PERMISSIONS: string[] = [];
const PlatformApp: React.FC<{permissions?: string[]}> = ({permissions = EMPTY_PERMISSIONS}) => {
  const { 
    activeTab,
    dataErrors,
    fetchOverview, 
    fetchTables, 
    fetchMarts, 
    fetchSystem 
  } = usePlatformStore();

  useEffect(() => {
    fetchOverview();
    fetchMarts();
  }, [fetchOverview, fetchTables, fetchMarts, fetchSystem, permissions]);

  const visibleErrors = Object.entries(dataErrors).filter(([key,message]) => Boolean(message) && (key === 'tables' ? activeTab === 'explorer' : key === 'system' ? activeTab === 'system' : true)).map(([,message]) => message);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewView />;
      case 'analytics':
      case 'ai_assistant':
      case 'saved_reports':
        return <AnalyticsView />;
      case 'explorer':
        return <DataExplorerView />;
      case 'system':
        return permissions.includes('system.read') ? <SystemAdminView /> : <section role="status" className="rounded-xl border bg-white p-6">Tài khoản chưa được cấp quyền xem người dùng và nhật ký quản trị.</section>;
      default:
        return <OverviewView />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Left Compact Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Scrollable Main Viewport */}
        <main className="flex-1 overflow-y-auto px-6 py-5 bg-[#f8fafc]">
          <div className="max-w-[1400px] mx-auto">
            {visibleErrors.length > 0 && <section role="alert" data-platform-load-errors className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Chưa tải được một số nguồn dữ liệu</p>
              <ul className="mt-1 list-disc pl-5">{[...new Set(visibleErrors)].map(message => <li key={message}>{message}</li>)}</ul>
              <button className="mt-2 underline" onClick={() => { fetchOverview(); fetchMarts(); usePlatformStore.getState().fetchStores(); usePlatformStore.getState().fetchCustomers(); usePlatformStore.getState().fetchProducts(); }}>Tải lại dữ liệu</button>
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
    usePlatformStore.setState({dataErrors:{},overview:null,pipelines:null,tables:[],marts:null,storesData:null,
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
  if(!session)return <main className="min-h-screen grid place-items-center bg-slate-50 p-6">
    <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-7 shadow" aria-label="Đăng nhập Data Platform">
      <h1 className="text-xl font-semibold">Đăng nhập Data Platform</h1>
      <p className="text-sm text-slate-600">Dùng tài khoản Avengers Coffee đã được cấp quyền phân tích.</p>
      <label className="block">Tài khoản<input autoComplete="username" required maxLength={120} value={username} onChange={e=>setUsername(e.target.value)} className="block w-full rounded border p-2" /></label>
      <label className="block">Mật khẩu<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} className="block w-full rounded border p-2" /></label>
      {message&&<p role="alert" className="text-sm text-red-700">{message}</p>}
      <button disabled={busy} className="w-full rounded bg-slate-900 p-2 text-white">{busy?'Đang đăng nhập…':'Đăng nhập'}</button>
    </form>
  </main>;
  return <><PlatformApp key={session.identity} permissions={session.permissions}/>{message&&<p role="alert" className="fixed bottom-16 right-6 rounded bg-white p-3 text-red-700">{message}</p>}<button onClick={logout} disabled={busy} className="fixed right-6 bottom-4 rounded border bg-white px-3 py-2 text-xs shadow" aria-label="Đăng xuất tài khoản phân tích">Đăng xuất</button></>;
};

export default App;
