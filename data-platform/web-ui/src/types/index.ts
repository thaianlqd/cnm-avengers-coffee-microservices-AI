export type ViewTab = 
  | 'overview' 
  | 'analytics' 
  | 'explorer' 
  | 'stores' 
  | 'customers' 
  | 'products' 
  | 'system'
  | 'ai_assistant'
  | 'saved_reports';

export type AnalyticsSubTab = 
  | 'revenue' 
  | 'stores' 
  | 'customers' 
  | 'products' 
  | 'ai_assistant'
  | 'saved_reports';


export interface WarehouseMetrics {
  total_rows: number;
  total_orders: number;
  total_revenue: number;
  active_deliveries: number;
  total_events: number;
  total_tables: number;
  total_branches: number;
  total_products: number;
}

export interface PlatformOverview {
  warehouse: WarehouseMetrics;
  pipeline: {
    last_batch_run: string;
    status: string;
    active_jobs: number;
  };
}

export interface TableColumn {
  name: string;
  type: string;
}

export interface TableMetadata {
  name: string;
  table_name: string;
  schema: string;
  description: string;
  display_name?: string;
  category?: string;
  layer?: string;
  columns: TableColumn[];
}

export interface SampleQuery {
  title: string;
  sql: string;
}

export interface QueryResult {
  columns: string[];
  data: Record<string, any>[];
  count: number;
  duration_ms: number;
  error?: string;
}

export interface StoreItem {
  store_code: string;
  store_name: string;
  city: string;
  address: string;
  status: string;
  total_orders: number;
  total_revenue: number;
  aov: number;
}

export interface ProductItem {
  product_id?: number;
  name: string;
  category?: string;
  price?: number;
  sold_qty: number;
  revenue: number;
}

export interface CustomerSegment {
  segment: string;
  count: number;
  avg_ltv: number;
}

export interface JobItem {
  id: string;
  name: string;
  script: string;
  layer: string;
  schedule: string;
  last_run: string;
  duration_seconds: number;
  rows_processed: number;
  status: string;
}
