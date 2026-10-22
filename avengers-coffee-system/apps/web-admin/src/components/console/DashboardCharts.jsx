import { useEffect, useId, useRef, useState } from "react";
import { number, normalizeChartRows, donutSegments } from "./chartModel";

const colors = [
  "var(--chart-primary, #4f86c6)",
  "#e6503c",
  "#e9a23b",
  "#65b4ec",
  "#f28b50",
  "#69736a",
];

export function DashboardSkeleton() {
  return (
    <div
      className="console-dashboard"
      role="status"
      aria-label="Đang tải tổng quan"
    >
      <div className="console-kpis">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="console-card console-skeleton" />
        ))}
      </div>
      <div className="console-charts">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="console-card console-skeleton console-skeleton-chart"
          />
        ))}
      </div>
      <span className="console-muted">Đang cập nhật số liệu…</span>
    </div>
  );
}

export function Metric({ label, value, note, icon: Icon, tone = "blue" }) {
  return (
    <article className="console-card console-metric">
      <div className={"console-metric-icon tone-" + tone}>
        {Icon ? <Icon size={21} /> : null}
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </article>
  );
}

// SVG uses a shared responsive coordinate system; the table exposes exact values on touch and keyboard.
export function Chart({
  title,
  subtitle,
  rows = [],
  type = "bar",
  format = number,
  totalLabel = "Tổng",
  loading = false,
  error = "",
}) {
  const reactId = useId();
  const id = `chart-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const container = useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(500);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(Math.max(500, Math.round(entry.contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const data = normalizeChartRows(rows);
  const positive = donutSegments(data);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  const min = Math.min(0, ...data.map((row) => row.value));
  const max = Math.max(1, ...data.map((row) => row.value));
  const y = (value) => 195 - ((value - min) / (max - min)) * 155;
  const baseline = y(0);
  const x = (i) => 48 + ((i + 0.5) * (canvasWidth - 80)) / Math.max(data.length, 1);
  const points = data.map((row, i) => `${x(i)},${y(row.value)}`).join(" ");
  const empty = !data.length || (type === "donut" && !total);
  return (
    <article className="console-card console-chart" data-chart-type={type} ref={container}>
      <header>
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="console-chart-badge">
          {type === "line"
            ? "Xu hướng"
            : type === "donut"
              ? "Phân bổ"
              : "So sánh"}
        </span>
      </header>
      {!empty && error && <p className="console-error" role="alert">Đang hiển thị lần tải gần nhất. Cập nhật chưa thành công: {error}</p>}
      {!empty && type === 'line' && data.length < 2 && <p className="workspace-chart-note">Mới có một kỳ dữ liệu; chưa đủ để xác định xu hướng.</p>}
      {empty ? (
        <div className="console-chart-empty" style={{background:'transparent',display:'flex',flexDirection:'column',gap:12}}>
          {type === 'donut' ? <svg viewBox="0 0 220 160" role="img" aria-label={title + ' · chưa có số liệu'} style={{height:150}}><circle cx="110" cy="80" r="58" fill="none" stroke="#e9edf4" strokeWidth="18"/><text x="110" y="85" textAnchor="middle" fill="#85907d">—</text></svg> : <svg viewBox="0 0 500 160" role="img" aria-label={title + ' · chưa có số liệu'} style={{width:'100%',height:150}}>{[25,60,95,130].map(y=><line key={y} x1="30" x2="480" y1={y} y2={y} stroke="#e8edf4" strokeDasharray="3 4"/>)}<line x1="30" x2="30" y1="20" y2="130" stroke="#e8edf4"/><text x="250" y="83" textAnchor="middle" fill="#85907d">—</text></svg>}
          <span role={error ? 'alert' : 'status'}>{loading ? 'Đang tải số liệu…' : error ? `Không tải được số liệu: ${error}` : data.length ? 'Chưa có giá trị phát sinh trong kỳ này.' : 'Chưa ghi nhận dữ liệu trong tập đã tải.'}</span>
        </div>
      ) : type === "donut" ? (
        <div className="console-donut-layout">
          <svg viewBox="0 0 220 220" role="img" aria-labelledby={id}>
            <title id={id}>{title}</title>
            <circle
              cx="110"
              cy="110"
              r="78"
              fill="none"
              stroke="#edf1f7"
              strokeWidth="24"
            />
            {positive.map((row, i) => {
              const share = row.share;
              const start = row.offset;
              return (
                <circle
                  key={i}
                  cx="110"
                  cy="110"
                  r="78"
                  fill="none"
                  stroke={row.color || colors[i % colors.length]}
                  strokeWidth="24"
                  pathLength="100"
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 110 110)"
                >
                  <title>{`${row.label}: ${format(row.value)} (${share.toFixed(1)}%)`}</title>
                </circle>
              );
            })}
            <text
              x="110"
              y="104"
              textAnchor="middle"
              className="console-donut-total"
            >
              {format(total)}
            </text>
            <text x="110" y="127" textAnchor="middle" className="console-axis">
              {totalLabel}
            </text>
          </svg>
          <ul className="console-legend">
            {positive.map((row, i) => (
              <li key={i}>
                <i
                  style={{ background: row.color || colors[i % colors.length] }}
                />
                <span>{row.label}</span>
                <b>{((row.value / total) * 100).toFixed(1)}%</b>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <svg
          className="console-plot"
          viewBox={`0 0 ${canvasWidth} 235`}
          role="img"
          aria-labelledby={id}
        >
          <title id={id}>{title}</title>
          {type === 'line' && <>
            <defs><linearGradient id={id + '-area'} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[0]} stopOpacity="0.18" />
              <stop offset="100%" stopColor={colors[0]} stopOpacity="0.01" />
            </linearGradient></defs>
            <polygon points={`${x(0)},${baseline} ${points} ${x(data.length - 1)},${baseline}`} fill={`url(#${id}-area)`} style={{ "--chart-area-fill": `url(#${id}-area)` }} />
          </>}
          {[0, 1, 2, 3, 4].map((i) => {
            const value = min + ((max - min) * i) / 4;
            return (
              <g key={i}>
                <line
                  x1="48"
                  x2={canvasWidth - 25}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="#e8edf4"
                  strokeDasharray="3 4"
                />
                <text
                  x="42"
                  y={y(value) + 4}
                  textAnchor="end"
                  className="console-axis"
                >
                  {Intl.NumberFormat("vi-VN", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)}
                </text>
              </g>
            );
          })}
          {type === "line" && (
            <polyline
              points={points}
              fill="none"
              stroke={colors[0]}
              strokeWidth="3"
              strokeLinejoin="round"
            />
          )}
          {data.map((row, i) => (
            <g key={i}>
              {type === "line" ? (
                <circle cx={x(i)} cy={y(row.value)} r="4" fill={colors[0]}>
                  <title>{`${row.label}: ${format(row.value)}`}</title>
                </circle>
              ) : (
                <rect
                  x={x(i) - Math.min(28, 140 / data.length)}
                  y={Math.min(y(row.value), baseline)}
                  width={Math.min(56, 280 / data.length)}
                  height={Math.abs(y(row.value) - baseline)}
                  rx="4"
                  fill={row.color || colors[i % colors.length]}
                >
                  <title>{`${row.label}: ${format(row.value)}`}</title>
                </rect>
              )}
              {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0) && (
                <text
                  x={x(i)}
                  y="218"
                  textAnchor="middle"
                  className="console-axis"
                >
                  {String(row.label).length > 12
                    ? String(row.label).slice(0, 11) + "…"
                    : row.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      {data.length > 0 && (
        <details className="console-chart-data">
          <summary>Xem số liệu</summary>
          <div className="console-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhóm / thời gian</th>
                  <th>Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td>{row.label}</td>
                    <td>{format(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  );
}
