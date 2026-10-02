import { create } from 'zustand';
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
  
  analyticsSubTab: AnalyticsSubTab;
  setAnalyticsSubTab: (subTab: AnalyticsSubTab) => void;
  
  dateRange: string;
  setDateRange: (range: string) => void;
  
  selectedSchema: string;
  setSelectedSchema: (schema: string) => void;
  
  isLiveStreaming: boolean;
  setIsLiveStreaming: (live: boolean) => void;
  
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
  
  analyticsSubTab: 'revenue',
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
  
  isLoadingOverview: false,
  isLoadingPipelines: false,
  isLoadingTables: false,
  isLoadingStores: false,
  isLoadingCustomers: false,
  isLoadingProducts: false,
  isLoadingMarts: false,
  
  activeSql: `SELECT 
    schemaname AS schema_name,
    relname AS table_name,
    n_live_tup AS total_rows,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname IN ('gold', 'orders', 'identity', 'menu', 'inventory', 'public')
ORDER BY n_live_tup DESC
LIMIT 15;`,
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
    try {
      set({ isLoadingOverview: true });
      const res = await fetch('/api/platform/overview');
      if (res.ok) {
        const data = await res.json();
        set({ overview: data, isLoadingOverview: false });
      } else {
        set({ isLoadingOverview: false });
      }
    } catch (e) {
      console.error('Lỗi tải overview:', e);
      set({ isLoadingOverview: false });
    }
  },
  
  fetchPipelines: async () => {
    try {
      set({ isLoadingPipelines: true });
      const res = await fetch('/api/platform/pipelines');
      if (res.ok) {
        const data = await res.json();
        set({ pipelines: data, isLoadingPipelines: false });
      } else {
        set({ isLoadingPipelines: false });
      }
    } catch (e) {
      console.error('Lỗi tải pipelines:', e);
      set({ isLoadingPipelines: false });
    }
  },
  
  fetchTables: async () => {
    try {
      set({ isLoadingTables: true });
      const res = await fetch('/api/warehouse/tables');
      if (res.ok) {
        const data = await res.json();
        set({ 
          tables: data.tables || [], 
          sampleQueries: data.sample_queries || [],
          isLoadingTables: false,
          selectedTableForInspect: data.tables?.[0] || null
        });
      } else {
        set({ isLoadingTables: false });
      }
    } catch (e) {
      console.error('Lỗi tải danh mục bảng:', e);
      set({ isLoadingTables: false });
    }
  },
  
  fetchStreaming: async () => {
    try {
      const res = await fetch('/api/platform/streaming');
      if (res.ok) {
        const data = await res.json();
        set({ realtimeEvents: data.recent_events || [] });
      }
    } catch (e) {
      console.error('Lỗi tải streaming:', e);
    }
  },
  
  fetchMarts: async () => {
    try {
      set({ isLoadingMarts: true });
      const range = get().dateRange;
      const res = await fetch(`/api/marts/all?date_range=${range}&branch=all`);
      if (res.ok) {
        const data = await res.json();
        set({ marts: data, isLoadingMarts: false });
      } else {
        set({ isLoadingMarts: false });
      }
    } catch (e) {
      console.error('Lỗi tải Data Marts:', e);
      set({ isLoadingMarts: false });
    }
  },

  fetchStores: async () => {
    try {
      set({ isLoadingStores: true });
      const range = get().dateRange;
      const res = await fetch(`/api/stores/overview?date_range=${range}&branch=all`);
      if (res.ok) {
        const data = await res.json();
        set({ storesData: data, isLoadingStores: false });
      } else {
        set({ isLoadingStores: false });
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu cửa hàng:', e);
      set({ isLoadingStores: false });
    }
  },

  fetchCustomers: async () => {
    try {
      set({ isLoadingCustomers: true });
      const range = get().dateRange;
      const res = await fetch(`/api/customers/overview?date_range=${range}&branch=all`);
      if (res.ok) {
        const data = await res.json();
        set({ customersData: data, isLoadingCustomers: false });
      } else {
        set({ isLoadingCustomers: false });
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu khách hàng:', e);
      set({ isLoadingCustomers: false });
    }
  },

  fetchProducts: async () => {
    try {
      set({ isLoadingProducts: true });
      const range = get().dateRange;
      const res = await fetch(`/api/products/overview?date_range=${range}&branch=all`);
      if (res.ok) {
        const data = await res.json();
        set({ productsData: data, isLoadingProducts: false });
      } else {
        set({ isLoadingProducts: false });
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu sản phẩm:', e);
      set({ isLoadingProducts: false });
    }
  },
  
  fetchSystem: async () => {
    try {
      const [uRes, lRes] = await Promise.all([
        fetch('/api/system/users'),
        fetch('/api/system/logs')
      ]);
      if (uRes.ok) {
        const uData = await uRes.json();
        set({ users: uData.users || [], roles: uData.roles || [] });
      }
      if (lRes.ok) {
        const lData = await lRes.json();
        set({ systemLogs: lData || [] });
      }
    } catch (e) {
      console.error('Lỗi tải thông tin hệ thống:', e);
    }
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
