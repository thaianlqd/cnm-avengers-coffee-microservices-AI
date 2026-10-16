import React from 'react';
import { forecastSummary, forecastChartData, forecastFreshness } from '../utils/forecastPresentation.mjs';
import { ForecastChart } from './Charts';

/** Server-computed forecasts with provenance; no client-side numbers. */
export const ForecastPanel: React.FC<{ forecasts?: any[]; coverage?: any }> = ({ forecasts, coverage }) => {
  if (!Array.isArray(forecasts) || forecasts.length === 0) return null;
  return (
    <div className="space-y-4" data-forecast-panel>
      {forecasts.map((forecast, index) => {
        const s = forecastSummary(forecast);
        if (s.unavailable) return (
          <section key={forecast.query_id || index} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 space-y-1">
            <h4 className="text-sm font-semibold text-slate-800">{s.title}</h4>
            <p className="text-xs text-amber-900">{s.unavailable}</p>
          </section>
        );
        const chart = forecastChartData(forecast);
        return (
          <section key={forecast.query_id || index} className="rounded-2xl border border-indigo-200 bg-white p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 className="text-sm font-semibold text-slate-900">{s.title}</h4><p className="text-[11px] text-slate-500 mt-1">{s.method} · {s.history}</p></div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">Dự báo thống kê tất định</span>
            </div>
            {(chart.history.length > 0 || chart.forecast.length > 0) && <ForecastChart history={chart.history} forecast={chart.forecast} unit={forecast.metric_unit} />}
            <div className="grid gap-1 text-xs text-slate-600">
              <p><strong>Chất lượng kiểm tra lùi:</strong> {s.quality}</p>
              {forecastFreshness(forecast, coverage).map((note: string, i: number) => <p key={i} className={i ? 'text-amber-800' : ''}>{note}</p>)}
            </div>
            <details className="text-xs"><summary className="cursor-pointer font-medium text-slate-700">Bảng dự báo ({s.rows.length} kỳ)</summary>
              <div className="overflow-x-auto mt-2">
                <table className="min-w-full text-xs">
                  <thead><tr className="text-left text-slate-500">
                    <th className="py-1 pr-4">Kỳ</th><th className="py-1 pr-4">Loại</th>
                    <th className="py-1 pr-4 text-right">Dự báo</th><th className="py-1 text-right">Khoảng 80%</th>
                  </tr></thead>
                  <tbody>
                    {s.rows.slice(0, 40).map((row: any) => (
                      <tr key={row.period} className="border-t border-indigo-100">
                        <td className="py-1 pr-4">{row.period}</td>
                        <td className="py-1 pr-4">{row.label}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{Number(row.value).toLocaleString('vi-VN')}</td>
                        <td className="py-1 text-right tabular-nums">{Number(row.lower_80).toLocaleString('vi-VN')} – {Number(row.upper_80).toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {s.interval && <p className="text-[11px] text-slate-500">{s.interval}</p>}
            {s.limitations.map((text: string, i: number) => <p key={i} className="text-[11px] text-amber-800">{text}</p>)}
          </section>
        );
      })}
    </div>
  );
};
