export function chartUnitSuffix(unit) {
  return unit ? ` ${unit}` : '';
}

export function resolveAiChartPresentation(chartMetadata = {}) {
  const trend = chartMetadata.trend || {};
  const breakdown = chartMetadata.breakdown || {};
  return {
    trend: {
      type: trend.chart_type === 'bar' ? 'bar' : 'area',
      title: trend.title || 'Xu hướng theo thời gian',
      suffix: chartUnitSuffix(trend.unit),
    },
    breakdown: {
      type: breakdown.chart_type === 'bar' ? 'bar' : 'donut',
      title: breakdown.title || 'Cơ cấu phân bổ',
      suffix: chartUnitSuffix(breakdown.unit),
    },
  };
}

// Units come from the semantic metric registry, never from number magnitude.
export function formatChartValue(value, suffix = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('vi-VN')}${suffix}`;
}
