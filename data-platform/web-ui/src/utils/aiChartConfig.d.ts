export function chartUnitSuffix(unit?: string): string;
export function resolveAiChartPresentation(chartMetadata?: Record<string, any>): {
  trend: { type: 'area' | 'bar'; title: string; suffix: string };
  breakdown: { type: 'bar' | 'donut'; title: string; suffix: string };
};
