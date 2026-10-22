export function periodLabel(dateRange: string): string;
export function dailyRevenueSeries(rows: any[], today?: string): { data: Array<{ label: string; series_1: number | null }>; gaps: string[][]; period: { start: string; end: string } | null; partialLast: boolean; average: number | null; peak: number | null; completeDays: number; notes: string[] };
export function channelSlices(behavior: any): { total: number; unit: string; slices: Array<{ label: string; value: number; color: string }> };
export function chartQuestion(capabilities: any, options: { metric: string; dimension?: string; granularity?: string; time?: string }): string | null;
