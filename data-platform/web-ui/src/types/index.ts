export type ViewTab =
  | 'overview'
  | 'analytics'
  | 'explorer'
  | 'stores'
  | 'customers'
  | 'products'
  | 'architecture'
  | 'system'
  | 'ai_assistant'
  | 'saved_reports';

export type AnalyticsSubTab =
  | 'hub'
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
  total_events: number | null;
  total_tables: number;
  total_branches: number;
  total_products: number;
}

export interface PlatformOverview {
  warehouse: WarehouseMetrics;
  pipeline: {
    last_batch_run: string | null;
    status: string;
    active_jobs: number | null;
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

export interface PipelinesData {
  jobs: JobItem[];
  observation_status?: string;
  committed_publications?: {pipeline: string; run_id: string; published_at: string}[];
}

export interface RealtimeEvent {
  id: number;
  topic: string;
  event_key?: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
}

export interface SystemUser {
  id: number | string;
  username: string;
  full_name: string;
  role: string;
  status: string;
  email: string | null;
  last_login?: string | null;
}

export interface SystemRole { role: string; users_count: number | null; description: string; permissions?: string[]; }

export interface SystemLog { time: string; user: string; action: string; status: string; duration_seconds: number; }

/** V3.3 server capability decision (same shape the backend evaluator emits). */
export type CapabilityDecisionKind = 'READY' | 'CLARIFY' | 'REDIRECT' | 'UNSUPPORTED';
export interface CapabilityConstraint { code: string; stage: 'static' | 'semantic' | 'runtime'; blocking: boolean; subject?: string | null; owner: string; status: 'passed' | 'failed' | 'pending'; requirement_id?: string | null; message: string }
export interface ViewRequirement { kind: 'time_series' | 'grouped' | 'scalar' | 'ranking' | 'driver_delta' | 'paired_scatter'; metric_ids: string[]; dimension_ids: string[]; required: boolean; operation_ids: string[]; id?: string; transform?: string }
export interface CapabilityAction {
  kind: string;
  label: string;
  patch?: { mission?: string | null; question?: string; time?: { mode: string; start?: string; end?: string }; scope?: Record<string, unknown>; metric?: string; method?: string };
  preserves?: string[];
  [legacyField: string]: unknown;
}
export interface CapabilityDecision { decision: CapabilityDecisionKind; policy_version: string; constraints: CapabilityConstraint[]; views: ViewRequirement[]; stage: 'input' | 'compiled'; catalog_fingerprint?: string; interpretation_required: boolean; reason?: string; message: string; actions: CapabilityAction[] }
export interface ScopeResolution {
  state: 'resolved' | 'unspecified' | 'explicit_all' | 'needs_interpretation' | 'needs_clarification' | 'unsupported';
  fingerprint?: string;
  requested_phrase?: string | null;
  message?: string;
  filters?: Array<{ dimension: string; operator: string; value: unknown }>;
  bindings?: Array<{ dimension: string; members: string[]; comparison?: boolean; comparison_dimension?: string; excluded_members?: string[]; cohorts?: Array<{ phrase: string; members: string[] }> }>;
  source?: Array<{ id: string; label: string; source: string; version: number }>;
}
export interface AnswerRequirement {
  requirement_id: string;
  role: string;
  metric?: string;
  unit?: string | null;
  cadence?: string;
  evidence_id?: string;
  forecast_ref?: string;
  query_id?: string;
  statement?: string;
  scope?: Record<string, unknown>;
}
export interface AnalyticalReportContract {
  answer_requirements?: AnswerRequirement[];
  scope_resolution?: ScopeResolution | null;
  capability?: CapabilityDecision;
}
export interface PreflightResult {
  capability?: CapabilityDecision;
  scope_resolution?: ScopeResolution;
  can_submit: boolean;
  state: string;
  // Retain historical presentation fields while the canonical decision is typed.
  [legacyField: string]: any;
}
