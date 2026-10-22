import { create } from 'zustand';
import { getAccountIdentity } from '../utils/authSession.mjs';

export function platformLoadError(status: number): string {
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Tài khoản chưa được cấp quyền xem nguồn dữ liệu này.';
  return `Chưa tải được dữ liệu (HTTP ${status || 'network'}). Vui lòng thử lại.`;
}
const loadVersions: Record<string, number> = {};

import { 
  ViewTab, 
  AnalyticsSubTab,
  PlatformOverview, 
  PipelinesData, 
  TableMetadata, 
  SampleQuery, 
  QueryResult, 
  RealtimeEvent,
  SystemUser,
  SystemRole,
  SystemLog,
  JobItem
} from '../types';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface PlatformState {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  
  dashboardSearch: { text: string; request: number } | null;
  searchDashboards: (text: string) => void;

  analyticsSubTab: AnalyticsSubTab;
  setAnalyticsSubTab: (subTab: AnalyticsSubTab) => void;
  
  dateRange: string;
  setDateRange: (range: string) => void;
  
  selectedSchema: string;
  setSelectedSchema: (schema: string) => void;
  
  isLiveStreaming: boolean;
  setIsLiveStreaming: (live: boolean) => void;
  
  dataErrors: Record<string, string>;
  // Data caches
  overview: PlatformOverview | null;
  pipelines: PipelinesData | null;
  tables: TableMetadata[];
  sampleQueries: SampleQuery[];
  realtimeEvents: RealtimeEvent[];
  marts: Record<string, any> | null;
  storesData: {
    stores: any[];
    summary: {
      total_stores: number;
      active_stores: number;
      maintenance_stores: number;
      avg_revenue_per_store: number;
    };
    top_stores: any[];
    revenue_by_city: any[];
  } | null;
  customersData: {
    kpi: any;
    membership_tiers: any[];
    top_customers: any[];
    customer_growth: any[];
    behavior: any;
  } | null;
  productsData: {
    kpi: any;
    top_products: any[];
    categories: any[];
    catalog_categories: any[];
    all_products: any[];
    revenue_trend: any[];
  } | null;
  users: SystemUser[];
  roles: SystemRole[];
  systemLogs: SystemLog[];
  
  isLoadingSystem: boolean;
  isLoadingOverview: boolean;
  isLoadingPipelines: boolean;
  isLoadingTables: boolean;
  isLoadingStores: boolean;
  isLoadingCustomers: boolean;
  isLoadingProducts: boolean;
  isLoadingMarts: boolean;
  
  // SQL Explorer State
  activeSql: string;
  setActiveSql: (sql: string) => void;
  queryResult: QueryResult | null;
  isQueryRunning: boolean;
  queryViewMode: 'table' | 'chart';
  setQueryViewMode: (mode: 'table' | 'chart') => void;
  selectedTableForInspect: TableMetadata | null;
  setSelectedTableForInspect: (table: TableMetadata | null) => void;
  queryHistory: Array<{ sql: string; time: string; duration: number; rows: number }>;
  
  // Modal states
  inspectedEvent: RealtimeEvent | null;
  setInspectedEvent: (ev: RealtimeEvent | null) => void;
  inspectedJob: JobItem | null;
  setInspectedJob: (job: JobItem | null) => void;
  previewTable: TableMetadata | null;
  setPreviewTable: (table: TableMetadata | null) => void;
  
  // Notifications
  toast: ToastState | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
  
  // Actions
  fetchOverview: () => Promise<void>;
  fetchPipelines: () => Promise<void>;
  fetchTables: () => Promise<void>;
  fetchStreaming: () => Promise<void>;
  fetchMarts: () => Promise<void>;
  fetchStores: () => Promise<void>;
  fetchCustomers: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  fetchSystem: () => Promise<void>;
  runQuery: (customSql?: string) => Promise<void>;
  triggerJob: (jobId: string) => Promise<void>;
  triggerDag: (dagId: string) => Promise<void>;
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  activeTab: 'overview',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  dashboardSearch: null,
  searchDashboards: text => set(state => ({ activeTab: 'analytics', analyticsSubTab: 'hub', dashboardSearch: { text, request: (state.dashboardSearch?.request || 0) + 1 } })),

  analyticsSubTab: 'hub',
  setAnalyticsSubTab: (subTab) => set({ analyticsSubTab: subTab }),
  
  dateRange: '30days',
  setDateRange: (range) => {
    set({ dateRange: range });
    get().fetchMarts();
    get().fetchStores();
    get().fetchCustomers();
    get().fetchProducts();
  },
  
  selectedSchema: 'all',
  setSelectedSchema: (schema) => set({ selectedSchema: schema }),
  
  isLiveStreaming: true,
  setIsLiveStreaming: (live) => set({ isLiveStreaming: live }),
  
  dataErrors: {},
  overview: null,
  pipelines: null,
  tables: [],
  sampleQueries: [],
  realtimeEvents: [],
  marts: null,
  storesData: null,
  customersData: null,
  productsData: null,
  users: [],
  roles: [],
  systemLogs: [],
  
  isLoadingSystem: false,
  isLoadingOverview: false,
  isLoadingPipelines: false,
  isLoadingTables: false,
  isLoadingStores: false,
  isLoadingCustomers: false,
  isLoadingProducts: false,
  isLoadingMarts: false,
  
  activeSql: 'SELECT COUNT(ma_don_hang) AS so_don FROM silver.don_hang',
  setActiveSql: (sql) => set({ activeSql: sql }),
  queryResult: null,
  isQueryRunning: false,
  queryViewMode: 'table',
  setQueryViewMode: (mode) => set({ queryViewMode: mode }),
  selectedTableForInspect: null,
  setSelectedTableForInspect: (table) => set({ selectedTableForInspect: table }),
  queryHistory: [],
  
  inspectedEvent: null,
  setInspectedEvent: (ev) => set({ inspectedEvent: ev }),
  inspectedJob: null,
  setInspectedJob: (job) => set({ inspectedJob: job }),
  previewTable: null,
  setPreviewTable: (table) => set({ previewTable: table }),
  
  toast: null,
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => {
      if (get().toast?.message === message) {
        set({ toast: null });
      }
    }, 4000);
  },
  hideToast: () => set({ toast: null }),
  
  fetchOverview: async () => {
    const actor = getAccountIdentity(), range = get().dateRange;
    const version = loadVersions.overview = (loadVersions.overview || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.overview;
    set(state => ({ isLoadingOverview: true, dataErrors: { ...state.dataErrors, overview: '' } }));
    try {
      const res = await fetch('/api/platform/overview');
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      if (current()) set({ overview: data });
    } catch (error) {
      if (current() && !(error instanceof DOMException && error.name === 'AbortError')) {
        set(state => ({ overview: null, dataErrors: { ...state.dataErrors, overview: error instanceof Error ? error.message : platformLoadError(0) } }));
      }
    } finally { if (current()) set({ isLoadingOverview: false }); }
  },
  
  fetchPipelines: async () => {
    const actor = getAccountIdentity(), version = loadVersions.pipelines = (loadVersions.pipelines || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.pipelines;
    set(state => ({ isLoadingPipelines: true, dataErrors: { ...state.dataErrors, pipelines: '' } }));
    try {
      const res = await fetch('/api/platform/pipelines');
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      if (!Array.isArray(data.jobs)) throw new Error('Phản hồi tác vụ không hợp lệ.');
      if (current()) set({ pipelines: data });
    } catch (error) {
      if (current()) set(state => ({ pipelines: null, dataErrors: { ...state.dataErrors, pipelines: error instanceof Error ? error.message : platformLoadError(0) } }));
    } finally { if (current()) set({ isLoadingPipelines: false }); }
  },

  fetchTables: async () => {
    const actor=getAccountIdentity(); const version=(loadVersions.tables || 0)+1;
    loadVersions.tables=version;
    const current=()=>getAccountIdentity()===actor && loadVersions.tables===version;
    set(state=>({isLoadingTables:true,dataErrors:{...state.dataErrors,tables:''}}));
    try {
      const res=await fetch('/api/warehouse/tables');
      if(!res.ok)throw new Error(platformLoadError(res.status));
      const data=await res.json();
      if(current())set({tables:data.tables || [],sampleQueries:data.sample_queries || [],selectedTableForInspect:data.tables?.[0] || null});
    } catch(error) {
      if(current())set(state=>({tables:[],sampleQueries:[],selectedTableForInspect:null,dataErrors:{...state.dataErrors,tables:error instanceof Error?error.message:platformLoadError(0)}}));
    } finally {if(current())set({isLoadingTables:false});}
  },

  fetchStreaming: async () => {
    const actor = getAccountIdentity(), version = loadVersions.streaming = (loadVersions.streaming || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.streaming;
    try {
      const res = await fetch('/api/platform/streaming');
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      const events = data.live_events ?? data.recent_events;
      if (!Array.isArray(events)) throw new Error('Phản hồi sự kiện không hợp lệ.');
      if (current()) set(state => ({ realtimeEvents: events, dataErrors: { ...state.dataErrors, streaming: '' } }));
    } catch (error) {
      if (current()) set(state => ({ realtimeEvents: [], dataErrors: { ...state.dataErrors, streaming: error instanceof Error ? error.message : platformLoadError(0) } }));
    }
  },

  fetchMarts: async () => {
    const actor = getAccountIdentity(), range = get().dateRange;
    const version = loadVersions.marts = (loadVersions.marts || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.marts && range === get().dateRange;
    set(state => ({ isLoadingMarts: true, dataErrors: { ...state.dataErrors, marts: '' } }));
    try {
      const res = await fetch(`/api/marts/all?date_range=${range}&branch=all`);
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      if (current()) set({ marts: data });
    } catch (error) {
      if (current() && !(error instanceof DOMException && error.name === 'AbortError')) {
        set(state => ({ marts: null, dataErrors: { ...state.dataErrors, marts: error instanceof Error ? error.message : platformLoadError(0) } }));
      }
    } finally { if (current()) set({ isLoadingMarts: false }); }
  },

  fetchStores: async () => {
    const actor = getAccountIdentity(), range = get().dateRange;
    const version = loadVersions.storesData = (loadVersions.storesData || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.storesData && range === get().dateRange;
    set(state => ({ isLoadingStores: true, dataErrors: { ...state.dataErrors, storesData: '' } }));
    try {
      const res = await fetch(`/api/stores/overview?date_range=${range}&branch=all`);
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      if (current()) set({ storesData: data });
    } catch (error) {
      if (current() && !(error instanceof DOMException && error.name === 'AbortError')) {
        set(state => ({ storesData: null, dataErrors: { ...state.dataErrors, storesData: error instanceof Error ? error.message : platformLoadError(0) } }));
      }
    } finally { if (current()) set({ isLoadingStores: false }); }
  },

  fetchCustomers: async () => {
    const actor = getAccountIdentity(), range = get().dateRange;
    const version = loadVersions.customersData = (loadVersions.customersData || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.customersData && range === get().dateRange;
    set(state => ({ isLoadingCustomers: true, dataErrors: { ...state.dataErrors, customersData: '' } }));
    try {
      const res = await fetch(`/api/customers/overview?date_range=${range}&branch=all`);
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      if (current()) set({ customersData: data });
    } catch (error) {
      if (current() && !(error instanceof DOMException && error.name === 'AbortError')) {
        set(state => ({ customersData: null, dataErrors: { ...state.dataErrors, customersData: error instanceof Error ? error.message : platformLoadError(0) } }));
      }
    } finally { if (current()) set({ isLoadingCustomers: false }); }
  },

  fetchProducts: async () => {
    const actor = getAccountIdentity(), range = get().dateRange;
    const version = loadVersions.productsData = (loadVersions.productsData || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.productsData && range === get().dateRange;
    set(state => ({ isLoadingProducts: true, dataErrors: { ...state.dataErrors, productsData: '' } }));
    try {
      const res = await fetch(`/api/products/overview?date_range=${range}&branch=all`);
      if (!res.ok) throw new Error(platformLoadError(res.status));
      const data = await res.json();
      if (current()) set({ productsData: data });
    } catch (error) {
      if (current() && !(error instanceof DOMException && error.name === 'AbortError')) {
        set(state => ({ productsData: null, dataErrors: { ...state.dataErrors, productsData: error instanceof Error ? error.message : platformLoadError(0) } }));
      }
    } finally { if (current()) set({ isLoadingProducts: false }); }
  },
  
  fetchSystem: async () => {
    const actor = getAccountIdentity(), version = loadVersions.system = (loadVersions.system || 0) + 1;
    const current = () => actor === getAccountIdentity() && version === loadVersions.system;
    set(state => ({ users: [], roles: [], systemLogs: [], isLoadingSystem: true, dataErrors: { ...state.dataErrors, system: '' } }));
    try {
      const [uRes, lRes] = await Promise.all([fetch('/api/system/users'), fetch('/api/system/logs')]);
      if (!uRes.ok || !lRes.ok) throw new Error(platformLoadError(!uRes.ok ? uRes.status : lRes.status));
      const [uData, lData] = await Promise.all([uRes.json(), lRes.json()]);
      if (!Array.isArray(uData.users) || !Array.isArray(uData.roles) || !Array.isArray(lData.logs)) throw new Error('Phản hồi quản trị không hợp lệ.');
      if (current()) set({ users: uData.users, roles: uData.roles, systemLogs: lData.logs });
    } catch (error) {
      if (current()) set(state => ({ users: [], roles: [], systemLogs: [], dataErrors: { ...state.dataErrors, system: error instanceof Error ? error.message : platformLoadError(0) } }));
    } finally { if (current()) set({ isLoadingSystem: false }); }
  },

  runQuery: async (customSql?: string) => {
    const sqlToRun = customSql || get().activeSql;
    if (!sqlToRun.trim()) return;
    
    set({ isQueryRunning: true, queryResult: null });
    try {
      const startTime = performance.now();
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlToRun })
      });
      
      const durationMs = Math.round(performance.now() - startTime);
      
      if (res.ok) {
        const data: QueryResult = await res.json();
        set({ 
          queryResult: data, 
          isQueryRunning: false,
          queryHistory: [
            { 
              sql: sqlToRun, 
              time: new Date().toLocaleTimeString('vi-VN'), 
              duration: data.duration_ms || durationMs, 
              rows: data.count 
            },
            ...get().queryHistory.slice(0, 19)
          ]
        });
        get().showToast(`Truy vấn hoàn thành thành công: ${data.count} bản ghi (${data.duration_ms} ms)`, 'success');
      } else {
        const err = await res.json();
        set({ 
          queryResult: { 
            columns: [], 
            data: [], 
            count: 0, 
            duration_ms: durationMs, 
            error: err.detail || 'Lỗi thực thi truy vấn SQL' 
          }, 
          isQueryRunning: false 
        });
        get().showToast(err.detail || 'Lỗi cú pháp truy vấn SQL', 'error');
      }
    } catch (e: any) {
      set({ 
        queryResult: { 
          columns: [], 
          data: [], 
          count: 0, 
          duration_ms: 0, 
          error: e.message || 'Mất kết nối với máy chủ truy vấn' 
        }, 
        isQueryRunning: false 
      });
      get().showToast('Không thể kết nối đến máy chủ truy vấn dữ liệu', 'error');
    }
  },
  
  triggerJob: async (jobId: string) => {
    try {
      get().showToast(`Đang khởi động tác vụ xử lý: ${jobId}...`, 'info');
      const res = await fetch('/api/platform/pipelines/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId })
      });
      if (res.ok) {
        const data = await res.json();
        get().showToast(data.message || `Đã kích hoạt thành công tác vụ ${jobId}`, 'success');
        await get().fetchPipelines();
        await get().fetchOverview();
      } else {
        const err = await res.json();
        get().showToast(err.detail || 'Không thể kích hoạt tác vụ', 'error');
      }
    } catch (e) {
      get().showToast('Lỗi gửi lệnh kích hoạt tác vụ', 'error');
    }
  },

  triggerDag: async (dagId: string) => {
    try {
      get().showToast(`Đang kích hoạt quy trình Airflow: ${dagId}...`, 'info');
      const res = await fetch('/api/platform/pipelines/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: dagId })
      });
      if (res.ok) {
        get().showToast(`Đã gửi tín hiệu chạy quy trình ${dagId} thành công`, 'success');
        await get().fetchPipelines();
      } else {
        get().showToast('Lỗi kích hoạt quy trình Airflow', 'error');
      }
    } catch (e) {
      get().showToast('Không thể kết nối đến bộ điều phối Airflow', 'error');
    }
  }
}));
