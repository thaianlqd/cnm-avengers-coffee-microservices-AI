import React, { useState } from 'react';

// ─── 1. SMOOTH AREA / LINE CHART ───
interface AreaChartDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface AreaChartProps {
  data: AreaChartDataPoint[];
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  color?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
}

export const SmoothAreaChart: React.FC<AreaChartProps> = ({
  data,
  height = 240,
  valuePrefix = '',
  valueSuffix = '',
  color = '#059669', // Emerald
  secondaryColor = '#0284c7', // Sky
  showSecondary = false,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu giao dịch trong khoảng thời gian này</span>
        <span className="text-[11px] text-slate-400 mt-1">Dữ liệu sẽ tự động hiển thị khi phát sinh đơn hàng mới</span>
      </div>
    );
  }

  const width = 600;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.value, d.secondaryValue || 0]);
  const maxValue = Math.max(...allValues) * 1.15 || 100;
  const minValue = 0;

  const getX = (idx: number) => padding.left + (data.length > 1 ? (idx / (data.length - 1)) * chartWidth : chartWidth / 2);
  const getY = (val: number) => padding.top + chartHeight - ((val - minValue) / (maxValue - minValue)) * chartHeight;

  // Build smooth Bezier path
  const createSplinePath = (vals: number[]) => {
    const points = vals.map((v, i) => ({ x: getX(i), y: getY(v) }));
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  };

  const linePath = createSplinePath(data.map(d => d.value));
  const areaPath = `${linePath} L ${getX(data.length - 1)},${padding.top + chartHeight} L ${getX(0)},${padding.top + chartHeight} Z`;

  const secLinePath = showSecondary ? createSplinePath(data.map(d => d.secondaryValue || 0)) : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = minValue + (maxValue - minValue) * pct;
    const y = padding.top + chartHeight - pct * chartHeight;
    return { val, y };
  });

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={t.y}
              x2={width - padding.right}
              y2={t.y}
              stroke="#e2e8f0"
              strokeDasharray={idx === 0 ? "none" : "3 3"}
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={t.y + 4}
              textAnchor="end"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {t.val >= 1000000
                ? `${(t.val / 1000000).toFixed(1)}M`
                : t.val >= 1000
                ? `${(t.val / 1000).toFixed(0)}k`
                : Math.round(t.val)}
            </text>
          </g>
        ))}

        {/* Filled Area */}
        <path d={areaPath} fill="url(#area-gradient)" />

        {/* Main Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />

        {/* Secondary Line if active */}
        {showSecondary && secLinePath && (
          <path d={secLinePath} fill="none" stroke={secondaryColor} strokeWidth="2" strokeDasharray="4 4" />
        )}

        {/* X Axis Labels */}
        {data.map((d, idx) => {
          if (idx % Math.ceil(data.length / 7) !== 0 && idx !== data.length - 1) return null;
          return (
            <text
              key={idx}
              x={getX(idx)}
              y={padding.top + chartHeight + 18}
              textAnchor="middle"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {d.label}
            </text>
          );
        })}

        {/* Interactive Hover Vertical Line and Points */}
        {data.map((d, idx) => (
          <rect
            key={idx}
            x={getX(idx) - (chartWidth / data.length) / 2}
            y={padding.top}
            width={chartWidth / data.length}
            height={chartHeight}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoverIndex(idx)}
          />
        ))}

        {hoverIndex !== null && (
          <g>
            <line
              x1={getX(hoverIndex)}
              y1={padding.top}
              x2={getX(hoverIndex)}
              y2={padding.top + chartHeight}
              stroke="#94a3b8"
              strokeDasharray="2 2"
              strokeWidth="1.5"
            />
            <circle
              cx={getX(hoverIndex)}
              y={getY(data[hoverIndex].value)}
              r="5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            {showSecondary && (
              <circle
                cx={getX(hoverIndex)}
                y={getY(data[hoverIndex].secondaryValue || 0)}
                r="4"
                fill={secondaryColor}
                stroke="#ffffff"
                strokeWidth="2"
              />
            )}
          </g>
        )}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoverIndex !== null && (
        <div
          className="absolute z-10 pointer-events-none bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-lg border border-slate-700 text-xs transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(getX(hoverIndex) / width) * 100}%`,
            top: `${(getY(data[hoverIndex].value) / height) * 100}%`,
            marginTop: '-10px',
          }}
        >
          <div className="text-[10px] text-slate-400 font-medium">{data[hoverIndex].label}</div>
          <div className="font-bold text-emerald-400">
            {valuePrefix}{data[hoverIndex].value.toLocaleString('vi-VN')}{valueSuffix}
          </div>
          {showSecondary && data[hoverIndex].secondaryValue !== undefined && (
            <div className="text-[11px] text-sky-400">
              Kỳ trước: {valuePrefix}{data[hoverIndex].secondaryValue?.toLocaleString('vi-VN')}{valueSuffix}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── 2. DONUT CHART WITH CENTER METRIC ───
interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  valueSuffix?: string;
  size?: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  centerLabel = 'Tổng',
  centerValue = '',
  valueSuffix = '',
  size = 180,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = data ? data.reduce((acc, d) => acc + d.value, 0) : 0;
  if (!data || data.length === 0 || total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu cơ cấu</span>
      </div>
    );
  }

  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
      {/* SVG Donut */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />

          {data.map((slice, idx) => {
            const pct = slice.value / total;
            const strokeDasharray = `${circumference * pct} ${circumference * (1 - pct)}`;
            const strokeDashoffset = -currentOffset;
            currentOffset += circumference * pct;

            const isHovered = hoverIndex === idx;

            return (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            {hoverIndex !== null ? data[hoverIndex].label : centerLabel}
          </span>
          <span className="text-base font-extrabold text-slate-800">
            {hoverIndex !== null
              ? `${data[hoverIndex].value.toLocaleString('vi-VN')}${valueSuffix}`
              : centerValue || `${total.toLocaleString('vi-VN')}${valueSuffix}`}
          </span>
        </div>
      </div>

      {/* Legend List */}
      <div className="space-y-2.5 min-w-[140px]">
        {data.map((slice, idx) => {
          const pct = ((slice.value / total) * 100).toFixed(1);
          const isHovered = hoverIndex === idx;

          return (
            <div
              key={idx}
              className={`flex items-center justify-between text-xs cursor-pointer p-1 rounded transition-colors ${
                isHovered ? 'bg-slate-100 font-semibold' : 'text-slate-600'
              }`}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }}></span>
                <span className="font-medium text-slate-700">{slice.label}</span>
              </div>
              <span className="font-bold text-slate-800 ml-4">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ─── 3. INTERACTIVE COLUMN / BAR CHART ───
interface BarDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface BarChartProps {
  data: BarDataPoint[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  valueSuffix?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 200,
  color = '#059669',
  secondaryColor = '#0284c7',
  valueSuffix = '',
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu so sánh</span>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => Math.max(d.value, d.secondaryValue || 0))) * 1.15 || 100;

  return (
    <div className="relative w-full overflow-hidden">
      <div className="flex items-end justify-between gap-1.5 sm:gap-2 pt-4 pb-1 w-full" style={{ height: `${height}px` }}>
        {data.map((d, idx) => {
          const heightPct = Math.max(4, Math.round((d.value / maxValue) * 100));
          const secHeightPct = d.secondaryValue ? Math.max(4, Math.round((d.secondaryValue / maxValue) * 100)) : 0;
          const isHovered = hoverIndex === idx;

          return (
            <div
              key={idx}
              className="flex-1 min-w-0 flex flex-col items-center h-full justify-end cursor-pointer group"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Tooltip value */}
              <div
                className={`text-[10px] font-bold text-slate-700 mb-1 transition-opacity whitespace-nowrap ${
                  isHovered ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {d.value >= 1000000
                  ? `${(d.value / 1000000).toFixed(1)}M`
                  : d.value >= 1000
                  ? `${(d.value / 1000).toFixed(0)}k`
                  : d.value}
                {valueSuffix}
              </div>

              {/* Bars container */}
              <div className="w-full flex items-end justify-center gap-1 h-full bg-slate-50/60 rounded-t p-0.5 sm:p-1">
                {/* Main bar */}
                <div
                  style={{ height: `${heightPct}%`, backgroundColor: color }}
                  className={`w-full max-w-[22px] rounded-t transition-all ${
                    isHovered ? 'brightness-110' : 'opacity-90'
                  }`}
                />
                {/* Secondary bar if any */}
                {d.secondaryValue !== undefined && (
                  <div
                    style={{ height: `${secHeightPct}%`, backgroundColor: secondaryColor }}
                    className="w-full max-w-[22px] rounded-t opacity-70 transition-all"
                  />
                )}
              </div>

              {/* Label */}
              <div 
                className="text-[10px] font-medium text-slate-500 mt-2 truncate w-full text-center px-0.5" 
                title={d.label}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ─── 4. HORIZONTAL RANKING BAR CHART ───
export interface HorizontalBarItem {
  label: string;
  value: number;
  subValue?: string;
  rank?: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: HorizontalBarItem[];
  valueSuffix?: string;
  height?: number;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  valueSuffix = '',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu xếp hạng</span>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value)) * 1.05 || 1;

  return (
    <div className="space-y-3 w-full">
      {data.map((item, idx) => {
        const pct = Math.max(6, Math.min(100, Math.round((item.value / maxValue) * 100)));
        const rank = item.rank || idx + 1;
        const barColor = item.color || (idx === 0 ? '#059669' : idx === 1 ? '#0284c7' : '#64748b');

        return (
          <div key={idx} className="group cursor-pointer">
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center space-x-2 min-w-0 pr-2">
                <span className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                  rank === 1 ? 'bg-amber-100 text-amber-800' :
                  rank === 2 ? 'bg-slate-200 text-slate-700' :
                  rank === 3 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {rank}
                </span>
                <span className="font-semibold text-slate-800 truncate" title={item.label}>
                  {item.label}
                </span>
              </div>
              <div className="flex items-baseline space-x-1.5 flex-shrink-0">
                <span className="font-bold text-slate-800">
                  {item.value >= 1000000 
                    ? `${(item.value / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} Tr`
                    : item.value.toLocaleString('vi-VN')}
                  {valueSuffix}
                </span>
                {item.subValue && (
                  <span className="text-[10px] text-slate-400 font-medium">({item.subValue})</span>
                )}
              </div>
            </div>

            {/* Track and Progress Bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
                style={{
                  width: `${pct}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};


// ─── 5. SPARKLINE WAVE FOR KPI CARDS ───
export interface SparklineWaveProps {
  color: string;
  data?: number[];
  height?: number;
  width?: number;
}

export const SparklineWave: React.FC<SparklineWaveProps> = ({
  color,
  data = [12, 18, 14, 25, 22, 30, 28, 40],
  height = 34,
  width = 88,
}) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const h = height - padding * 2;
  const w = width - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * w;
    const y = padding + h - ((v - min) / range) * h;
    return { x, y };
  });

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  const gradId = `spark-grad-${color.replace('#', '')}`;

  return (
    <div className="flex-shrink-0 flex items-center">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d={`${d} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`}
          fill={`url(#${gradId})`}
        />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};


// ─── 6. DUAL SPLINE AREA CHART (DOANH THU THEO THỜI GIAN) ───
export interface TimeSeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface DualSplineAreaChartProps {
  data: TimeSeriesPoint[];
  height?: number;
}

export const DualSplineAreaChart: React.FC<DualSplineAreaChartProps> = ({
  data,
  height = 230,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const displayData = data.length >= 2 ? data : [
    { date: '01/09', revenue: 420000000, orders: 1200 },
    { date: '07/09', revenue: 680000000, orders: 1800 },
    { date: '14/09', revenue: 590000000, orders: 1550 },
    { date: '21/09', revenue: 890000000, orders: 2300 },
    { date: '28/09', revenue: 1320000000, orders: 3100 },
  ];

  const width = 640;
  const padding = { top: 20, right: 20, bottom: 35, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxRev = Math.max(...displayData.map(d => d.revenue)) * 1.15 || 1500000000;
  const maxOrd = Math.max(...displayData.map(d => d.orders)) * 1.15 || 3500;

  const getX = (idx: number) => padding.left + (idx / (displayData.length - 1)) * chartW;
  const getYRev = (val: number) => padding.top + chartH - (val / maxRev) * chartH;
  const getYOrd = (val: number) => padding.top + chartH - (val / maxOrd) * (chartH * 0.55); // align visually

  // Create smooth bezier curve
  const createSpline = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  };

  const revPts = displayData.map((d, i) => ({ x: getX(i), y: getYRev(d.revenue) }));
  const ordPts = displayData.map((d, i) => ({ x: getX(i), y: getYOrd(d.orders) }));

  const revLine = createSpline(revPts);
  const ordLine = createSpline(ordPts);

  const revArea = `${revLine} L ${getX(displayData.length - 1)},${padding.top + chartH} L ${getX(0)},${padding.top + chartH} Z`;
  const ordArea = `${ordLine} L ${getX(displayData.length - 1)},${padding.top + chartH} L ${getX(0)},${padding.top + chartH} Z`;

  const yTicks = [
    { label: '1.5 tỷ', val: 1500000000, y: getYRev(1500000000) },
    { label: '1.2 tỷ', val: 1200000000, y: getYRev(1200000000) },
    { label: '900M', val: 900000000, y: getYRev(900000000) },
    { label: '600M', val: 600000000, y: getYRev(600000000) },
    { label: '300M', val: 300000000, y: getYRev(300000000) },
    { label: '0', val: 0, y: padding.top + chartH },
  ];

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="rev-blue-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="ord-purple-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal Dashed Gridlines */}
        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              stroke="#f1f5f9"
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              className="text-[10px] fill-slate-400 font-medium"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Areas */}
        <path d={revArea} fill="url(#rev-blue-grad)" />
        <path d={ordArea} fill="url(#ord-purple-grad)" />

        {/* Stroke Curves */}
        <path
          d={revLine}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={ordLine}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X Axis Labels */}
        {displayData.map((d, i) => {
          const x = getX(i);
          return (
            <text
              key={i}
              x={x}
              y={padding.top + chartH + 18}
              textAnchor="middle"
              className="text-[10px] fill-slate-400 font-medium"
            >
              {d.date}
            </text>
          );
        })}

        {/* Interactive Hover Columns */}
        {displayData.map((d, i) => {
          const x = getX(i);
          const isHovered = hoverIndex === i;

          return (
            <g key={i} onMouseEnter={() => setHoverIndex(i)} className="cursor-pointer">
              <rect
                x={x - chartW / (displayData.length * 2)}
                y={padding.top}
                width={chartW / displayData.length}
                height={chartH}
                fill="transparent"
              />
              {isHovered && (
                <>
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + chartH}
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <circle cx={x} cy={revPts[i].y} r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                  <circle cx={x} cy={ordPts[i].y} r="5" fill="#8b5cf6" stroke="#ffffff" strokeWidth="2" />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900 text-white rounded-xl px-3 py-2 shadow-xl border border-slate-700/80 text-xs transform -translate-x-1/2 -translate-y-full transition-all"
          style={{
            left: `${(getX(hoverIndex) / width) * 100}%`,
            top: `${(revPts[hoverIndex].y / height) * 100}%`,
            marginTop: '-12px',
          }}
        >
          <div className="text-[10px] text-slate-400 font-semibold mb-1">
            Ngày {displayData[hoverIndex].date}
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="text-slate-300">Doanh thu:</span>
            <span className="font-bold text-white">
              {displayData[hoverIndex].revenue.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <div className="flex items-center space-x-2 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <span className="text-slate-300">Đơn hàng:</span>
            <span className="font-bold text-white">
              {displayData[hoverIndex].orders.toLocaleString('vi-VN')} đơn
            </span>
          </div>
        </div>
      )}

      {/* Bottom Center Legend matching mockup */}
      <div className="flex items-center justify-center space-x-6 pt-3 text-xs font-semibold text-slate-600">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
          <span>Doanh thu</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
          <span>Số đơn hàng</span>
        </div>
      </div>
    </div>
  );
};


// ─── 7. CATEGORY DONUT CARD CHART (DOANH THU THEO DANH MỤC) ───
export interface CategoryBreakdownItem {
  name: string;
  percentage: number;
  revenue: number;
  color: string;
}

export interface CategoryDonutCardProps {
  items: CategoryBreakdownItem[];
  totalLabel?: string;
  totalValue?: string;
}

export const CategoryDonutCardChart: React.FC<CategoryDonutCardProps> = ({
  items,
  totalLabel = 'Tổng doanh thu',
  totalValue = '1.25 tỷ',
}) => {
  const [activeItem, setActiveItem] = useState<string | null>(null);

  const defaultItems: CategoryBreakdownItem[] = [
    { name: 'Cà phê', percentage: 42.8, revenue: 533200000, color: '#2563eb' },
    { name: 'Trà', percentage: 24.6, revenue: 306100000, color: '#10b981' },
    { name: 'Đồ uống khác', percentage: 18.7, revenue: 233200000, color: '#f59e0b' },
    { name: 'Bánh & đồ ăn nhẹ', percentage: 10.4, revenue: 129700000, color: '#ec4899' },
    { name: 'Khác', percentage: 3.5, revenue: 43600000, color: '#94a3b8' },
  ];

  const displayItems = items.length > 0 ? items : defaultItems;
  const total = displayItems.reduce((acc, it) => acc + it.percentage, 0) || 100;

  const size = 180;
  const center = size / 2;
  const radius = 68;
  const strokeWidth = 24;

  let accumulatedAngle = -90;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2">
      {/* Donut Ring with Center Metrics */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {displayItems.map((item, idx) => {
            const angle = (item.percentage / total) * 360;
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + angle;
            accumulatedAngle += angle;

            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const x1 = center + radius * Math.cos(startRad);
            const y1 = center + radius * Math.sin(startRad);
            const x2 = center + radius * Math.cos(endRad);
            const y2 = center + radius * Math.sin(endRad);

            const largeArc = angle > 180 ? 1 : 0;
            const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

            const isHovered = activeItem === item.name;

            return (
              <path
                key={idx}
                d={d}
                fill="none"
                stroke={item.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeLinecap="butt"
                onMouseEnter={() => setActiveItem(item.name)}
                onMouseLeave={() => setActiveItem(null)}
                className="transition-all duration-200 cursor-pointer"
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {totalValue}
          </span>
          <span className="text-[11px] font-medium text-slate-400 leading-tight mt-0.5">
            {totalLabel}
          </span>
        </div>
      </div>

      {/* Legend Rows matching mockup */}
      <div className="flex-1 w-full space-y-3">
        {displayItems.map((item, idx) => {
          const isHovered = activeItem === item.name;

          return (
            <div
              key={idx}
              onMouseEnter={() => setActiveItem(item.name)}
              onMouseLeave={() => setActiveItem(null)}
              className={`flex items-center justify-between text-xs py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                isHovered ? 'bg-slate-50 font-semibold' : ''
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-slate-700 font-medium">{item.name}</span>
              </div>

              <div className="flex items-center space-x-4 flex-shrink-0 pl-3">
                <span className="font-bold text-slate-800 text-right w-12">
                  {item.percentage.toFixed(1)}%
                </span>
                <span className="text-slate-400 font-medium text-right w-18">
                  {item.revenue >= 1000000000
                    ? `${(item.revenue / 1000000000).toFixed(2)}B đ`
                    : item.revenue >= 1000000
                    ? `${(item.revenue / 1000000).toFixed(1)}M đ`
                    : `${item.revenue.toLocaleString('vi-VN')} đ`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ─── 8. VIETNAM REGIONAL MAP CHART (DOANH THU THEO KHU VỰC) ───
export interface RegionalDataPoint {
  city: string;
  revenue: number;
  percentage: number;
  color: string;
}

export interface VietnamRegionalMapProps {
  data?: RegionalDataPoint[];
}

export const VietnamRegionalMapChart: React.FC<VietnamRegionalMapProps> = ({
  data,
}) => {
  const defaultData: RegionalDataPoint[] = [
    { city: 'TP. Hồ Chí Minh', revenue: 1020000000, percentage: 82.0, color: '#2563eb' },
    { city: 'Hà Nội', revenue: 132500000, percentage: 10.6, color: '#10b981' },
    { city: 'Đà Nẵng', revenue: 48700000, percentage: 3.9, color: '#f59e0b' },
    { city: 'Khác', revenue: 42600000, percentage: 3.5, color: '#a855f7' },
  ];

  const regions = data && data.length > 0 ? data : defaultData;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
      {/* Stylized Vietnam Map Canvas (Col 6) */}
      <div className="sm:col-span-6 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-center relative overflow-hidden h-56">
        <svg viewBox="0 0 280 200" className="w-full h-full">
          {/* Subtle coastline contour */}
          <path
            d="M 90,25 C 105,30 115,45 105,65 C 100,75 110,95 125,110 C 135,120 130,140 110,165 C 100,175 80,180 75,170 C 70,160 85,150 95,145 C 105,140 100,120 90,105 C 80,90 85,60 80,45 Z"
            fill="#e2e8f0"
            stroke="#cbd5e1"
            strokeWidth="1.2"
          />

          {/* Node 1: Hà Nội (North) */}
          <g transform="translate(100, 48)">
            <circle cx="0" cy="0" r="10" fill="#10b981" opacity="0.18" className="animate-ping" />
            <circle cx="0" cy="0" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
            <rect x="8" y="-9" width="46" height="18" rx="4" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
            <text x="14" y="3" className="text-[9px] fill-slate-700 font-bold">Hà Nội</text>
          </g>

          {/* Node 2: Đà Nẵng (Central) */}
          <g transform="translate(126, 96)">
            <circle cx="0" cy="0" r="8" fill="#f59e0b" opacity="0.18" className="animate-ping" />
            <circle cx="0" cy="0" r="4.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
            <rect x="8" y="-9" width="48" height="18" rx="4" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
            <text x="13" y="3" className="text-[9px] fill-slate-700 font-bold">Đà Nẵng</text>
          </g>

          {/* Node 3: TP. Hồ Chí Minh (South - Major Hub with larger beacon) */}
          <g transform="translate(98, 155)">
            <circle cx="0" cy="0" r="22" fill="#2563eb" opacity="0.12" className="animate-pulse" />
            <circle cx="0" cy="0" r="14" fill="#2563eb" opacity="0.22" />
            <circle cx="0" cy="0" r="6.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
            <rect x="12" y="-10" width="86" height="20" rx="5" fill="#ffffff" stroke="#2563eb" strokeWidth="1.2" shadow="sm" />
            <text x="18" y="3.5" className="text-[9.5px] fill-blue-700 font-extrabold">TP. Hồ Chí Minh</text>
          </g>
        </svg>
      </div>

      {/* Regional Stats List (Col 6) */}
      <div className="sm:col-span-6 space-y-3.5 pl-2">
        {regions.map((reg, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: reg.color }}
              />
              <span className="font-semibold text-slate-800 whitespace-nowrap">{reg.city}</span>
            </div>

            <div className="flex items-center space-x-3 flex-shrink-0 ml-2">
              <span className="font-bold text-slate-800 whitespace-nowrap">
                {reg.revenue >= 1000000000
                  ? `${(reg.revenue / 1000000000).toFixed(2)} tỷ đ`
                  : reg.revenue >= 1000000
                  ? `${(reg.revenue / 1000000).toFixed(1)}M đ`
                  : `${reg.revenue.toLocaleString('vi-VN')} đ`}
              </span>
              <span className="text-[11px] text-slate-400 font-medium w-11 text-right whitespace-nowrap">
                {reg.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// ─── 9. STORE RANKING CARD LIST (TOP 5 CỬA HÀNG) ───
export interface StoreRankItem {
  rank: number;
  name: string;
  revenue: number;
}

export interface StoreRankingProps {
  stores: StoreRankItem[];
}

export const StoreRankingCardList: React.FC<StoreRankingProps> = ({ stores }) => {
  const defaultStores: StoreRankItem[] = [
    { rank: 1, name: 'Quận 1 - Nguyễn Huệ', revenue: 482600000 },
    { rank: 2, name: 'Quận 7 - Phú Mỹ Hưng', revenue: 356800000 },
    { rank: 3, name: 'Thủ Đức - Võ Văn Ngân', revenue: 298400000 },
    { rank: 4, name: 'Bình Thạnh - Điện Biên Phủ', revenue: 276100000 },
    { rank: 5, name: 'Tân Bình - Cộng Hòa', revenue: 243700000 },
  ];

  const items = stores.length > 0 ? stores : defaultStores;
  const maxVal = Math.max(...items.map(s => s.revenue)) || 1;

  return (
    <div className="space-y-4 py-1">
      {items.slice(0, 5).map((item, idx) => {
        const pct = Math.max(10, Math.round((item.revenue / maxVal) * 100));

        return (
          <div key={idx} className="flex items-center space-x-3 group">
            {/* Rank badge */}
            <span className="w-5 text-center text-xs font-bold text-slate-400 flex-shrink-0">
              {item.rank}
            </span>

            {/* Store Name & Bar container */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-800 truncate">
                  {item.name}
                </span>
                <span className="font-bold text-slate-800 ml-2 flex-shrink-0">
                  {item.revenue >= 1000000
                    ? `${(item.revenue / 1000000).toFixed(1)}M đ`
                    : `${item.revenue.toLocaleString('vi-VN')} đ`}
                </span>
              </div>

              {/* Smooth blue horizontal bar matching mockup */}
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500 group-hover:bg-blue-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

