export const LENS_ROLE_LABELS: Record<string, string>;
export const DEPTH_LABELS: Record<string, string>;
export function lensReason(reason: string): string;
export function lensBadge(chart: any): string | null;
export function coverageSummary(report: any): null | { label: string; tone: 'ok' | 'limited' | 'gap'; roles: Array<{ role: string; label: string; rendered: number; target: number }>; missing: string[]; summary: string; origin: string | null };
