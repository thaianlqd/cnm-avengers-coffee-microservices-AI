export type WorkspaceValue = { type: 'string' | 'date'; value: string }
  | { type: 'number'; value: number } | { type: 'boolean'; value: boolean };
export interface WorkspaceSelection {
  chart_id: string;
  query_id: string;
  lens_id: string | null;
  dimension_id: string;
  operator: 'eq' | 'in';
  values: WorkspaceValue[];
}
export interface WorkspaceDrill {
  selection: WorkspaceSelection;
  target_dimension_id: string;
}
export interface WorkspaceRevisionInput {
  session_id: string;
  revision: number;
  catalog_fingerprint: string;
  access_fingerprint: string | null;
  filters: WorkspaceSelection[];
  drill_path: WorkspaceDrill[];
  analysis_depth: 'focused' | 'deep' | 'comprehensive';
  refresh: boolean;
}
export function workspaceRevisionInput(report: any, filters: WorkspaceSelection[], drillPath: WorkspaceDrill[], depth: WorkspaceRevisionInput['analysis_depth'], refresh?: boolean): WorkspaceRevisionInput;
export function queueWorkspaceFilter(filters: WorkspaceSelection[], selection: WorkspaceSelection): WorkspaceSelection[];
export function workspaceRevisionController(): { invalidate(): void; apply(input: WorkspaceRevisionInput, send: (input: WorkspaceRevisionInput, signal: AbortSignal) => Promise<any>, publish: (report: any) => void): Promise<boolean> };
