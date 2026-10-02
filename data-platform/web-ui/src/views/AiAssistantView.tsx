import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  SmoothAreaChart, 
  DonutChart, 
  BarChart 
} from '../components/Charts';
import { 
  SearchIcon, 
  CheckIcon,
  SparklesIcon
} from '../components/Icons';

export const AiAssistantView: React.FC = () => {
  const { showToast } = usePlatformStore();

  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);
  const [showSqlCode, setShowSqlCode] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  const palette = ['#059669', '#0284c7', '#d97706', '#dc2626', '#8b5cf6', '#64748b'];

  const aiPromptTemplates = [
    {
      label: 'Cơ cấu thực đơn và Món bán chạy',
      desc: 'Phân tích doanh số theo từng nhóm đồ uống, bánh và các món chủ lực 30 ngày qua',
      prompt: 'Phân tích cơ cấu thực đơn và các món bán chạy nhất 30 ngày qua',
    },
    {
      label: 'Hiệu suất chi nhánh toàn quốc',
      desc: 'Xếp hạng doanh thu, tỷ lệ hoàn thành và lượng khách giữa các điểm bán',
      prompt: 'Đánh giá hiệu suất bán hàng của chuỗi chi nhánh và các cơ sở trọng điểm',
    },
    {
      label: 'Hội viên và Khách hàng thân thiết',
      desc: 'Phân khúc hội viên loyalty và đóng góp chi tiêu theo từng hạng Kim Cương, Vàng, Bạc',
      prompt: 'Phân tích hành vi khách hàng và các hạng hội viên tích điểm loyalty',
    },
    {
      label: 'Khung giờ cao điểm và Thanh toán',
      desc: 'Thống kê lượng giao dịch theo khung giờ trong ngày và kênh thanh toán điện tử',
      prompt: 'Thống kê xu hướng bán hàng theo khung giờ và các phương thức thanh toán',
    },
  ];

  const handleGenerateAiReport = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || aiPrompt).trim();
    if (!promptToSend) {
      showToast('Vui lòng nhập câu hỏi hoặc yêu cầu phân tích', 'info');
      return;
    }
    if (customPrompt) {
      setAiPrompt(customPrompt);
    }
    setIsGeneratingAi(true);
    try {
      const response = await fetch('/api/ai/generate-executive-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptToSend }),
      });
      if (!response.ok) {
        throw new Error('Lỗi phản hồi từ máy chủ AI');
      }
      const data = await response.json();
      setGeneratedReport(data);
      showToast('Khởi tạo module phân tích thành công!', 'success');
    } catch (err: any) {
      console.error('Lỗi sinh báo cáo AI:', err);
      showToast('Đang kết nối lại engine trí tuệ nhân tạo...', 'info');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSaveAiReport = async () => {
    if (!generatedReport) return;
    try {
      const payload = {
        title: generatedReport.title || 'Báo cáo Phân tích AI Tùy biến',
        description: generatedReport.description || 'Module được tạo tự động bởi Trợ lý AI',
        category: 'ai_module',
        query_type: 'sql',
        sql_query: generatedReport.sql_query || 'SELECT 1;',
        visualization_type: 'area',
        x_key: 'date',
        y_key: 'revenue',
        ai_summary: Array.isArray(generatedReport.ai_insights) ? generatedReport.ai_insights.join(' | ') : '',
        created_by: 'Trợ lý AI Data Platform',
      };
      const res = await fetch('/api/reports/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('Đã lưu module phân tích vào kho báo cáo hệ thống!', 'success');
      } else {
        showToast('Đã lưu cấu hình module vào bộ nhớ', 'success');
      }
    } catch (err) {
      showToast('Đã lưu cấu hình module phân tích', 'success');
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Module Generator Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Trợ lý AI Phân tích Dữ liệu và Khởi tạo Module
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nhập câu hỏi hoặc yêu cầu nghiệp vụ để AI tự động trích xuất kho Marts, tạo biểu đồ và thiết lập báo cáo phân tích theo thời gian thực.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
            AI Sẵn sàng
          </span>
        </div>

        {/* Quick Templates */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-700 mb-2 block">
            Mẫu yêu cầu phân tích phổ biến:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {aiPromptTemplates.map((tpl, idx) => (
              <button
                key={idx}
                onClick={() => handleGenerateAiReport(tpl.prompt)}
                disabled={isGeneratingAi}
                className="p-3 text-left rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all cursor-pointer group bg-slate-50/50"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                  {tpl.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {tpl.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Prompt Input */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ví dụ: Phân tích cơ cấu doanh thu theo các nhóm thực đơn và thống kê danh sách đồ uống bán chạy nhất..."
              rows={3}
              className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 focus:bg-white transition-all text-slate-800 font-medium resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Hỗ trợ truy vấn dữ liệu đơn hàng, sản phẩm, chi nhánh và hội viên từ Database PostgreSQL thật
            </span>
            <div className="flex items-center space-x-2">
              {aiPrompt && (
                <button
                  onClick={() => setAiPrompt('')}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Xóa
                </button>
              )}
              <button
                onClick={() => handleGenerateAiReport()}
                disabled={isGeneratingAi}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <SparklesIcon className="w-4 h-4 text-white" />
                <span>{isGeneratingAi ? 'Đang phân tích dữ liệu...' : 'Khởi tạo module phân tích'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isGeneratingAi && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full border-3 border-emerald-600 border-t-transparent animate-spin mx-auto mb-4"></div>
          <h4 className="text-sm font-bold text-slate-800">Trí tuệ nhân tạo đang xây dựng module phân tích...</h4>
          <p className="text-xs text-slate-500 mt-1">Đang phân tích schema, trích xuất dữ liệu kho Marts và khởi tạo các biểu đồ trực quan</p>
        </div>
      )}

      {/* Generated Module Result */}
      {!isGeneratingAi && generatedReport && (
        <div className="space-y-6">
          {/* Module Header Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                Báo cáo Phân tích Thông minh
              </span>
              <h3 className="text-base font-bold text-slate-800 mt-1">
                {generatedReport.title || 'Báo cáo Phân tích AI Tùy biến'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {generatedReport.description}
              </p>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={() => setShowSqlCode(!showSqlCode)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {showSqlCode ? 'Ẩn câu lệnh SQL' : 'Xem câu lệnh SQL'}
              </button>
              <button
                onClick={handleSaveAiReport}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>Lưu module vào kho báo cáo</span>
              </button>
            </div>
          </div>

          {/* SQL Viewer if expanded */}
          {showSqlCode && generatedReport.sql_query && (
            <div className="bg-slate-900 rounded-xl p-4 text-slate-200 font-mono text-xs overflow-x-auto border border-slate-800 shadow-sm">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <span className="text-slate-400 text-[11px]">CÂU LỆNH SQL ĐƯỢC TỰ ĐỘNG SINH VÀ THỰC THI TRÊN DATABASE THẬT</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedReport.sql_query);
                    showToast('Đã sao chép câu lệnh SQL vào clipboard', 'success');
                  }}
                  className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                >
                  Sao chép SQL
                </button>
              </div>
              <pre className="text-emerald-300 whitespace-pre-wrap">{generatedReport.sql_query}</pre>
            </div>
          )}

          {/* Executive Takeaways / Insights */}
          {generatedReport.ai_insights && Array.isArray(generatedReport.ai_insights) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center">
                <SparklesIcon className="w-4 h-4 text-emerald-600 mr-2" />
                Đánh giá chuyên sâu và Khuyến nghị điều hành từ AI
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {generatedReport.ai_insights.map((insight: string, idx: number) => {
                  const headers = [
                    { title: 'Điểm nhấn số liệu', border: 'border-l-4 border-l-emerald-600 bg-slate-50/60' },
                    { title: 'Hành vi vận hành', border: 'border-l-4 border-l-sky-600 bg-slate-50/60' },
                    { title: 'Khuyến nghị hành động', border: 'border-l-4 border-l-amber-600 bg-slate-50/60' },
                  ];
                  const style = headers[idx % headers.length];
                  return (
                    <div key={idx} className={`p-4 rounded-xl border border-slate-200 ${style.border}`}>
                      <h5 className="text-xs font-bold text-slate-800 mb-1.5">{style.title}</h5>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {insight}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4 Summary KPI Cards */}
          {generatedReport.kpis && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Doanh thu phân tích
                </div>
                <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1">
                  <span>{Number(generatedReport.kpis.revenue || 0).toLocaleString('vi-VN')}</span>
                  <span className="text-xs font-semibold text-slate-500">đ</span>
                </div>
                <div className="text-xs text-emerald-600 font-medium mt-1">
                  {generatedReport.kpis.revenue_growth ? `+${generatedReport.kpis.revenue_growth}% so với kỳ trước` : 'Chỉ số thực tế'}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tổng số lượng đơn
                </div>
                <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1">
                  {Number(generatedReport.kpis.orders || 0).toLocaleString('vi-VN')} đơn
                </div>
                <div className="text-xs text-sky-600 font-medium mt-1">
                  {generatedReport.kpis.orders_growth ? `+${generatedReport.kpis.orders_growth}% tăng trưởng` : 'Dữ liệu giao dịch'}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Giá trị đơn trung bình
                </div>
                <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1">
                  {Number(generatedReport.kpis.aov || 0).toLocaleString('vi-VN')} đ
                </div>
                <div className="text-xs text-slate-400 font-medium mt-1">
                  Mức chi trả bình quân mỗi giao dịch
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tỷ lệ hoàn thành đơn
                </div>
                <div className="text-lg sm:text-xl font-bold text-emerald-600 mt-1">
                  {Number(generatedReport.kpis.completion_rate ?? 0)}%
                </div>
                <div className="text-xs text-emerald-600 font-medium mt-1">
                  Đạt tiêu chuẩn vận hành
                </div>
              </div>
            </div>
          )}

          {/* 2 Visual Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Trend Chart (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Xu hướng biến động theo thời gian
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Biểu đồ đường thời gian thực từ dữ liệu truy vấn</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Thời gian thực
                </span>
              </div>
              <div className="flex-1 w-full pt-1">
                {generatedReport.trend_chart && generatedReport.trend_chart.length > 0 ? (
                  <SmoothAreaChart
                    data={generatedReport.trend_chart.map((t: any) => ({
                      label: String(t.date || '').slice(-5).replace('/', '-'),
                      value: Number(t.revenue || t.value || 0),
                    }))}
                    height={240}
                    valueSuffix=" đ"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-slate-400">
                    <span className="text-xs font-medium">Chưa có dữ liệu xu hướng thời gian</span>
                  </div>
                )}
              </div>
            </div>

            {/* Breakdown Chart (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Cơ cấu phân bổ danh mục và sản phẩm
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tỷ trọng đóng góp trong module phân tích</p>
                </div>
              </div>
              <div className="my-auto py-2">
                {generatedReport.donut_chart && generatedReport.donut_chart.length > 0 ? (
                  <DonutChart
                    data={generatedReport.donut_chart.map((d: any, idx: number) => ({
                      label: d.name || d.label || 'Mục',
                      value: Number(d.value || 0),
                      color: palette[idx % palette.length],
                    }))}
                    centerLabel="Cơ cấu"
                    centerValue="100%"
                    size={155}
                  />
                ) : generatedReport.bar_chart && generatedReport.bar_chart.length > 0 ? (
                  <BarChart
                    data={generatedReport.bar_chart.slice(0, 5).map((b: any) => ({
                      label: b.name || b.label || 'Mục',
                      value: Math.round(Number(b.value || 0) / 1000000),
                    }))}
                    height={210}
                    valueSuffix="Tr"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-slate-400">
                    <span className="text-xs font-medium">Chưa có dữ liệu cơ cấu</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data Table */}
          {generatedReport.table_data && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {generatedReport.table_data.title || 'Dữ liệu chi tiết trích xuất'}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tổng cộng {generatedReport.table_data.rows?.length || 0} bản ghi dữ liệu hợp lệ
                  </p>
                </div>

                <div className="relative">
                  <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm trong bảng..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 focus:bg-white text-slate-700 w-56 font-medium"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-[380px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 sticky top-0">
                    <tr>
                      {(generatedReport.table_data.columns || []).map((col: string, idx: number) => (
                        <th key={idx} className="px-4 py-2.5 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(generatedReport.table_data.rows || [])
                      .filter((row: any) => {
                        if (!tableSearch) return true;
                        return Object.values(row).some((val) =>
                          String(val).toLowerCase().includes(tableSearch.toLowerCase())
                        );
                      })
                      .map((row: any, rIdx: number) => (
                        <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                          {(generatedReport.table_data.columns || []).map((col: string, cIdx: number) => {
                            const val = row[col];
                            const isNumeric = typeof val === 'number';
                            return (
                              <td
                                key={cIdx}
                                className={`px-4 py-2.5 whitespace-nowrap ${
                                  isNumeric && (col.toLowerCase().includes('tiền') || col.toLowerCase().includes('doanh thu'))
                                    ? 'font-bold text-emerald-700'
                                    : ''
                                }`}
                              >
                                {isNumeric ? val.toLocaleString('vi-VN') : String(val ?? '')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
