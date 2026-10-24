import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { number, normalizeChartRows, donutSegments } from './chartModel'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Table } from '../ui/table'
const colors = ['#0284c7', '#16354d', '#0f766e', '#65a7c4', '#5b7288', '#a2becd']

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
    <Card className="console-card console-metric">
      <div className={"console-metric-icon tone-" + tone}>
        {Icon ? <Icon size={21} /> : null}
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </Card>
  );
}


// shadcn chart framing with Recharts geometry. Full labels stay in tooltip and data table.
export function Chart({ title, subtitle, rows = [], type = 'bar', format = number, totalLabel = 'Tổng', loading = false, error = '' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const data = normalizeChartRows(rows), positive = donutSegments(data)
  const total = positive.reduce((sum, row) => sum + row.value, 0)
  const empty = !data.length || (type === 'donut' && !total)
  const config = { value: { label: title, color: '#0284c7' } }
  const short = label => String(label).length > 19 ? String(label).slice(0, 18) + '…' : label
  const compact = value => Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  const tooltip = <ChartTooltip content={<ChartTooltipContent formatter={value => format(Number(value))} />} cursor={type === 'bar' ? { fill: '#f1f5f9' } : false} />
  return <Card className="console-card console-chart shadcn-chart" data-chart-type={type}>
    <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><Badge variant="outline">{type === 'line' ? 'Xu hướng' : type === 'donut' ? 'Phân bổ' : 'So sánh'}</Badge></header>
    {!empty && error && <p className="console-error" role="alert">Đang hiển thị lần tải gần nhất. Cập nhật chưa thành công: {error}</p>}
    {!empty && type === 'line' && data.length < 2 && <p className="workspace-chart-note">Mới có một kỳ dữ liệu; chưa đủ để xác định xu hướng.</p>}
    {empty ? <div className="console-chart-empty" role={error ? 'alert' : 'status'}>{loading ? 'Đang tải số liệu…' : error ? 'Không tải được số liệu: ' + error : 'Chưa ghi nhận dữ liệu trong tập đã tải.'}</div> : type === 'donut' ? <div className="shadcn-donut-layout">
      <div className="shadcn-donut-plot">
        <ChartContainer config={config} className="shadcn-chart-canvas" role="img" aria-label={title}>
          <PieChart accessibilityLayer><Pie data={positive} dataKey="value" nameKey="label" innerRadius="63%" outerRadius="86%" paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
            {positive.map((row, index) => <Cell key={index} fill={row.color || colors[index % colors.length]} />)}
          </Pie>{tooltip}</PieChart>
        </ChartContainer>
        <div className="shadcn-donut-center" aria-hidden="true"><strong>{compact(total)}</strong><span>{totalLabel}</span></div>
      </div>
      <ul className="shadcn-chart-legend">{positive.map((row, index) => <li key={index}><i style={{ background: row.color || colors[index % colors.length] }} /><span>{row.label}</span><strong>{row.share.toFixed(1)}%</strong></li>)}</ul>
    </div> : <ChartContainer config={config} className="shadcn-chart-canvas" role="img" aria-label={title} style={{ height: type === 'bar' ? Math.max(260, Math.min(420, data.length * 38)) : 280 }}>
      {type === 'line' ? <AreaChart data={data} margin={{ left: 8, right: 16, top: 18, bottom: 8 }} accessibilityLayer>
        <defs><linearGradient id={id + 'area'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0284c7" stopOpacity={.22} /><stop offset="100%" stopColor="#0284c7" stopOpacity={.02} /></linearGradient></defs>
        <CartesianGrid vertical={false} strokeDasharray="3 5" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} minTickGap={30} interval="preserveStartEnd" tickFormatter={short} height={42} /><YAxis tickLine={false} axisLine={false} tickFormatter={compact} width={52} tickMargin={8} />{tooltip}
        <Area type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={2.5} fill={'url(#' + id + 'area)'} isAnimationActive={false} dot={data.length < 2} />
      </AreaChart> : <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 8, bottom: 8 }} barCategoryGap="28%" accessibilityLayer>
        <CartesianGrid horizontal={false} strokeDasharray="3 5" /><XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={compact} /><YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={125} tickFormatter={short} tickMargin={10} interval={0} />{tooltip}
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>{data.map((row, index) => <Cell key={index} fill={row.color || colors[index % colors.length]} />)}</Bar>
      </BarChart>}
    </ChartContainer>}
    {data.length > 0 && <details className="console-chart-data"><summary>Xem số liệu</summary><Table><thead><tr><th>Nhóm / thời gian</th><th>Giá trị</th></tr></thead><tbody>{data.map((row,index) => <tr key={index}><td>{row.label}</td><td>{format(row.value)}</td></tr>)}</tbody></Table></details>}
  </Card>
}
