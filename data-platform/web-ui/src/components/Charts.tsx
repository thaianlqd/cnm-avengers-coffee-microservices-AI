import React, { useState } from 'react';

// ─── 1. SMOOTH AREA / LINE CHART ───
export interface AreaChartDataPoint {
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
  showLegend?: boolean;
}

export const SmoothAreaChart: React.FC<AreaChartProps> = ({
  data,
  height = 230,
  valuePrefix = '',
  valueSuffix = '',
  color = '#2563eb', // Modern Blue
  secondaryColor = '#8b5cf6', // Modern Purple
  showSecondary = false,
  showLegend = true,
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
  const padding = { top: 15, right: 15, bottom: 25, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.value, d.secondaryValue || 0]);
  const maxValue = Math.max(...allValues) * 1.15 || 100;
  const minValue = 0;
  const maxY = padding.top + chartHeight;
  const minY = padding.top;

  const clampY = (yVal: number) => Math.min(maxY, Math.max(minY, yVal));

  const getX = (idx: number) => padding.left + (data.length > 1 ? (idx / (data.length - 1)) * chartWidth : chartWidth / 2);
  const getY = (val: number) => clampY(padding.top + chartHeight - ((Math.max(0, val) - minValue) / (maxValue - minValue)) * chartHeight);

  // Build monotonic clamped Bezier path to avoid curve undershooting below 0
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

      // Slopes with Fritsch-Carlson monotonicity condition
      let m1 = (p2.y - p0.y) / 2;
      let m2 = (p3.y - p1.y) / 2;

      // If slopes change sign or flat at extremum, clamp slope to 0
      if ((p2.y - p1.y) * (p1.y - p0.y) <= 0) m1 = 0;
      if ((p3.y - p2.y) * (p2.y - p1.y) <= 0) m2 = 0;

      const dx = (p2.x - p1.x) / 3;
      const cp1x = p1.x + dx;
      const cp1y = clampY(p1.y + m1 / 3);
      const cp2x = p2.x - dx;
      const cp2y = clampY(p2.y - m2 / 3);

      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const linePath = createSplinePath(data.map(d => d.value));
  const areaPath = `${linePath} L ${getX(data.length - 1)},${maxY} L ${getX(0)},${maxY} Z`;
  const secLinePath = showSecondary ? createSplinePath(data.map(d => d.secondaryValue || 0)) : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = minValue + (maxValue - minValue) * pct;
    const y = maxY - pct * chartHeight;
    return { val, y };
  });

  const formatYValue = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
    if (val >= 1_000_000) return `${Math.round(val / 1_000_000)}M`;
    if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
    return Math.round(val).toString();
  };

  return (
    <div className="relative w-full flex flex-col justify-between">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="area-gradient-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
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
              stroke="#f1f5f9"
              strokeDasharray={idx === 0 ? "none" : "3 3"}
              strokeWidth="1"
            />
            <text
              x={padding.left - 10}
              y={t.y + 3.5}
              textAnchor="end"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {formatYValue(t.val)}
            </text>
          </g>
        ))}

        {/* Filled Area */}
        <path d={areaPath} fill="url(#area-gradient-blue)" />

        {/* Main Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />

        {/* Secondary Line if active */}
        {showSecondary && secLinePath && (
          <path d={secLinePath} fill="none" stroke={secondaryColor} strokeWidth="2" strokeDasharray="3 3" />
        )}

        {/* X Axis Labels */}
        {data.map((d, idx) => {
          const step = Math.max(1, Math.ceil(data.length / 6));
          if (idx % step !== 0 && idx !== data.length - 1) return null;
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
            x={getX(idx) - (chartWidth / Math.max(1, data.length)) / 2}
            y={padding.top}
            width={chartWidth / Math.max(1, data.length)}
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
              r="4.5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
            />
            {showSecondary && (
              <circle
                cx={getX(hoverIndex)}
                y={getY(data[hoverIndex].secondaryValue || 0)}
                r="3.5"
                fill={secondaryColor}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}
      </svg>

      {/* Optional Bottom Legend */}
      {showLegend && (
        <div className="flex items-center justify-center space-x-6 pt-2 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
            <span>Doanh thu</span>
          </div>
          {showSecondary && (
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: secondaryColor }}></span>
              <span>Số đơn hàng</span>
            </div>
          )}
        </div>
      )}

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
          <div className="font-bold text-blue-400">
            {valuePrefix}{data[hoverIndex].value.toLocaleString('vi-VN')}{valueSuffix}
          </div>
          {showSecondary && data[hoverIndex].secondaryValue !== undefined && (
            <div className="text-[10px] text-purple-300">
              Đơn hàng: {data[hoverIndex].secondaryValue?.toLocaleString('vi-VN')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── 2. DONUT CHART WITH ELEGANT 3-COLUMN LEGEND ───
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  formattedAmount?: string;
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
  centerLabel = 'Tổng doanh thu',
  centerValue = '',
  size = 135,
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

  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  const formatShortAmount = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B đ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M đ`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k đ`;
    return `${val} đ`;
  };

  const displayCenterValue = centerValue || (
    total >= 1_000_000_000 
      ? `${(total / 1_000_000_000).toFixed(2)} tỷ` 
      : total >= 1_000_000 
      ? `${(total / 1_000_000).toFixed(1)}M` 
      : total.toLocaleString('vi-VN')
  );

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5 w-full">
      {/* SVG Donut */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
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
                strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center px-1">
          <span className="text-sm font-bold text-slate-900 leading-tight">
            {hoverIndex !== null
              ? formatShortAmount(data[hoverIndex].value)
              : displayCenterValue}
          </span>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">
            {hoverIndex !== null ? data[hoverIndex].label : centerLabel}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-1.5 min-w-0 w-full sm:w-auto">
        {data.map((slice, idx) => {
          const pct = ((slice.value / total) * 100).toFixed(1);
          const isHovered = hoverIndex === idx;
          const formattedAmount = slice.formattedAmount || formatShortAmount(slice.value);

          return (
            <div
              key={idx}
              className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
                isHovered ? 'bg-slate-100 shadow-2xs' : 'hover:bg-slate-50'
              }`}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1 pr-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }}></span>
                <span className="text-xs text-slate-700 font-medium truncate" title={slice.label}>
                  {slice.label}
                </span>
              </div>
              <div className="flex items-center space-x-2.5 flex-shrink-0 text-xs">
                <span className="font-semibold text-slate-800 text-right">{pct}%</span>
                <span className="text-slate-400 font-normal text-[11px] text-right min-w-[46px]">{formattedAmount}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ─── 3. INTERACTIVE COLUMN / BAR CHART WITH Y-AXIS & GRID LINES ───
export interface BarDataPoint {
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
  height = 220,
  color = '#2563eb', // Modern Electric Blue
  secondaryColor = '#8b5cf6',
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

  const width = 540;
  const padding = { top: 22, right: 16, bottom: 28, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Compute maximum value with clean ceiling
  const rawMax = Math.max(...data.map(d => Math.max(d.value, d.secondaryValue || 0))) || 10;
  // Nice number ceiling
  const getCeil = (val: number) => {
    if (val <= 10) return 10;
    if (val <= 50) return 50;
    if (val <= 100) return 100;
    if (val <= 500) return 500;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    return Math.ceil((val * 1.15) / mag) * mag;
  };
  const maxVal = getCeil(rawMax);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = pct * maxVal;
    const y = padding.top + chartHeight - pct * chartHeight;
    return { val, y };
  });

  const formatYValue = (val: number) => {
    if (val === 0) return '0';
    if (valueSuffix === 'Tr' || valueSuffix === 'triệu') {
      if (val >= 1000) return `${(val / 1000).toFixed(1)} tỷ`;
      return `${Math.round(val)} Tr`;
    }
    if (valueSuffix === 'ly' || valueSuffix === 'đơn') {
      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
      return `${Math.round(val)}`;
    }
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
    if (val >= 1_000_000) return `${Math.round(val / 1_000_000)}M`;
    if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
    return Math.round(val).toString();
  };

  const formatTooltipValue = (val: number) => {
    if (valueSuffix === 'Tr' || valueSuffix === 'triệu') {
      if (val >= 1000) {
        return `${(val / 1000).toFixed(2)} tỷ VNĐ`;
      }
      return `${val.toLocaleString('vi-VN')} triệu VNĐ`;
    }
    if (valueSuffix === 'ly' || valueSuffix === 'đơn') {
      return `${val.toLocaleString('vi-VN')} ${valueSuffix}`;
    }
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} tỷ đ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M đ`;
    return `${val.toLocaleString('vi-VN')} ${valueSuffix}`.trim();
  };

  const slotWidth = chartWidth / data.length;
  const hasSecondary = data.some(d => d.secondaryValue !== undefined);
  const singleBarWidth = Math.max(10, Math.min(32, hasSecondary ? slotWidth * 0.38 : slotWidth * 0.65));

  return (
    <div className="relative w-full flex flex-col justify-between">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Horizontal Grid lines and Y-axis tick values */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={t.y}
              x2={width - padding.right}
              y2={t.y}
              stroke="#f1f5f9"
              strokeDasharray={idx === 0 ? "none" : "3 3"}
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={t.y + 3.5}
              textAnchor="end"
              className="text-[10px] font-sans fill-slate-400 font-medium select-none"
            >
              {formatYValue(t.val)}
            </text>
          </g>
        ))}

        {/* Vertical Bars */}
        {data.map((d, idx) => {
          const slotX = padding.left + idx * slotWidth;
          const isHovered = hoverIndex === idx;

          const barH = Math.max(2, (d.value / maxVal) * chartHeight);
          const barY = padding.top + chartHeight - barH;
          const barX = hasSecondary 
            ? slotX + (slotWidth - singleBarWidth * 2 - 4) / 2
            : slotX + (slotWidth - singleBarWidth) / 2;

          const secH = d.secondaryValue ? Math.max(2, (d.secondaryValue / maxVal) * chartHeight) : 0;
          const secY = padding.top + chartHeight - secH;
          const secX = barX + singleBarWidth + 4;

          const labelText = d.label.length > 13 ? `${d.label.slice(0, 11)}..` : d.label;

          return (
            <g 
              key={idx} 
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(idx)}
            >
              {/* Invisible wide hit area for easy hover */}
              <rect
                x={slotX}
                y={padding.top}
                width={slotWidth}
                height={chartHeight + padding.bottom}
                fill="transparent"
              />

              {/* Primary Bar */}
              <rect
                x={barX}
                y={barY}
                width={singleBarWidth}
                height={barH}
                rx={3.5}
                ry={3.5}
                fill={color}
                className="transition-all duration-150"
                opacity={hoverIndex === null || isHovered ? 1 : 0.65}
              />

              {/* Secondary Bar if exists */}
              {hasSecondary && d.secondaryValue !== undefined && (
                <rect
                  x={secX}
                  y={secY}
                  width={singleBarWidth}
                  height={secH}
                  rx={3.5}
                  ry={3.5}
                  fill={secondaryColor}
                  className="transition-all duration-150"
                  opacity={hoverIndex === null || isHovered ? 0.9 : 0.5}
                />
              )}

              {/* X-axis Label */}
              <text
                x={slotX + slotWidth / 2}
                y={padding.top + chartHeight + 17}
                textAnchor="middle"
                className={`text-[10px] font-sans font-medium select-none transition-colors ${
                  isHovered ? 'fill-blue-600 font-semibold' : 'fill-slate-500'
                }`}
              >
                {labelText}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900 text-white rounded-lg px-2.5 py-1.5 shadow-lg border border-slate-700 text-xs transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${((padding.left + hoverIndex * slotWidth + slotWidth / 2) / width) * 100}%`,
            top: `${(padding.top + chartHeight - Math.max(4, (data[hoverIndex].value / maxVal) * chartHeight)) / height * 100}%`,
            marginTop: '-8px',
          }}
        >
          <div className="text-[10px] text-slate-300 font-medium truncate max-w-[180px]">
            {data[hoverIndex].label}
          </div>
          <div className="font-semibold text-blue-400 mt-0.5 whitespace-nowrap">
            {formatTooltipValue(data[hoverIndex].value)}
          </div>
          {hasSecondary && data[hoverIndex].secondaryValue !== undefined && (
            <div className="text-[10px] text-purple-300 mt-0.5">
              Phụ: {formatTooltipValue(data[hoverIndex].secondaryValue!)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── 4. HORIZONTAL RANKING BAR CHART (Target Style) ───
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
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  valueSuffix = ' đ',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
        <span className="text-xs font-medium">Chưa có dữ liệu xếp hạng</span>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value)) * 1.05 || 1;

  const formatAmount = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
    return val.toLocaleString('vi-VN');
  };

  return (
    <div className="space-y-4 w-full">
      {data.map((item, idx) => {
        const pct = Math.max(6, Math.min(100, Math.round((item.value / maxValue) * 100)));
        const rank = item.rank || idx + 1;
        const barColor = item.color || '#2563eb'; // Royal blue

        return (
          <div key={idx} className="group cursor-pointer space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                <span className="text-xs font-semibold text-slate-400 w-3 flex-shrink-0 text-center">
                  {rank}
                </span>
                <span className="font-medium text-slate-800 truncate" title={item.label}>
                  {item.label}
                </span>
              </div>
              <div className="flex items-baseline space-x-1.5 flex-shrink-0">
                <span className="font-semibold text-slate-800 text-xs">
                  {formatAmount(item.value)}{valueSuffix}
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


// ─── 5. MINI SPARKLINE FOR KPI CARDS ───
export const Sparkline: React.FC<{
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}> = ({
  data = [12, 16, 14, 20, 18, 24, 28],
  color = '#10b981',
  width = 64,
  height = 28,
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
};
