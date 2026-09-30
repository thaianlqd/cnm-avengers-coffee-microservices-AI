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
