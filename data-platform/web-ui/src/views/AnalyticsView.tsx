import { AnalystDashboardSummary, AnalystOptionalNarrative, AnalystReportReady, AnalystEvidence } from '../components/AnalystDashboardSummary';
import { AnalysisClarification } from '../components/AnalysisClarification';
import { AnalysisMeaning } from '../components/AnalysisMeaning';
import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  SmoothAreaChart, 
  DonutChart, 
  BarChart, 
  HorizontalBarChart,
  HeatmapChart,
  MultiLineChart,
  AnalystChart
} from '../components/Charts';
import { AnalyticsSubTab } from '../types';
import { resolveAiChartPresentation } from '../utils/aiChartConfig.mjs';
import { WordReportPreviewModal } from '../components/WordReportPreviewModal';

export const AnalyticsView: React.FC = () => {
  const { 
    activeTab: storeActiveTab,
    setActiveTab: setStoreActiveTab,
    marts, 
    storesData, 
    customersData, 
    productsData, 
    fetchMarts, 
    fetchStores, 
    fetchCustomers, 
    fetchProducts,
    analyticsSubTab,
    setAnalyticsSubTab,
    isLoadingMarts,
    showToast
  } = usePlatformStore();

  const [activeTab, setActiveTab] = useState<AnalyticsSubTab>(
    (storeActiveTab === 'ai_assistant' || storeActiveTab === 'saved_reports' ? storeActiveTab : analyticsSubTab) || 'revenue'
  );

  useEffect(() => {
    if (storeActiveTab === 'ai_assistant') {
      setActiveTab('ai_assistant');
      setAnalyticsSubTab('ai_assistant');
    } else if (storeActiveTab === 'saved_reports') {
      setActiveTab('saved_reports');
      setAnalyticsSubTab('saved_reports');
    } else if (storeActiveTab === 'analytics') {
      if (activeTab === 'ai_assistant' || activeTab === 'saved_reports') {
        setActiveTab('revenue');
        setAnalyticsSubTab('revenue');
      }
    }
  }, [storeActiveTab]);

  // ─── AI ASSISTANT 3-STEP REPORT WORKFLOW STATE ───
  const [aiStep, setAiStep] = useState<1 | 2 | 3>(1);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTimeRange, setAiTimeRange] = useState('auto');
  const [aiDomain, setAiDomain] = useState('auto');
  const [aiStatus, setAiStatus] = useState<any | null>(null);

  // Step 1: Pre-analysis proposal state
  const [pendingClarification, setPendingClarification] = useState<any | null>(null);
  const [aiPlan, setAiPlan] = useState<any | null>(null);
  const [isProposingPlan, setIsProposingPlan] = useState(false);

  // Step 2: Visual preview report state
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);
  const [showSqlCode, setShowSqlCode] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ prompt: string; report: any; time: string }>>([]);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [reportVersions, setReportVersions] = useState<Array<{ version: number; label: string; report: any; time: string }>>([]);
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(0);
  const [refinementChat, setRefinementChat] = useState<Array<{ id: string; sender: 'user' | 'assistant'; text: string; time: string }>>([]);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative'>>({});

  // Step 3: DOCX Export & Saved Reports Management state
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [isLoadingSavedReports, setIsLoadingSavedReports] = useState(false);
  const [savedReportsSearch, setSavedReportsSearch] = useState('');
  const [savedReportsCategory, setSavedReportsCategory] = useState('all');
  const [viewingSavedReport, setViewingSavedReport] = useState<any | null>(null);

  // Word Document Interactive Preview Modal state
  const [showDocxPreview, setShowDocxPreview] = useState(false);
  const [previewReportData, setPreviewReportData] = useState<any | null>(null);

  const handleOpenDocxPreview = (report?: any) => {
    setPreviewReportData(report || generatedReport);
    setShowDocxPreview(true);
  };

  // Helper to sanitize any raw SQL query or expressions leaked into KPI values
  const sanitizeKpiDisplayValue = (val: any, _fallbackRow?: any, _card?: any): string => {
    if (typeof val === 'number' && Number.isFinite(val)) return val.toLocaleString('vi-VN');
    return '—';
  };

  const aiPromptTemplates = [
    {
      label: 'Top 5 món bán chạy nhất',
      prompt: 'Top 5 món bán chạy nhất theo số lượng',
    },
    {
      label: 'Tỷ trọng kênh thanh toán',
      prompt: 'Phân tích cơ cấu và tỷ trọng các phương thức thanh toán',
    },
    {
      label: 'Hiệu suất chuỗi chi nhánh',
      prompt: 'Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh',
    },
    {
      label: 'Diễn biến doanh thu 30 ngày',
      prompt: 'Phân tích xu hướng biến động doanh thu 30 ngày gần nhất',
    },
    {
      label: 'Tần suất mua của hội viên',
      prompt: 'Phân tích hành vi khách hàng và các hạng hội viên tích điểm loyalty',
    },
    {
      label: 'Đội ngũ giao hàng shipper',
      prompt: 'Hiệu suất giao hàng và số lượng chuyến của các tài xế',
    },
  ];

  // Helper to reset and start a fresh question
  const handleResetToNewPrompt = () => {
    setPendingClarification(null);
    setAiPrompt('');
    setAiPlan(null);
    setGeneratedReport(null);
    setReportVersions([]);
    setActiveVersionIndex(0);
    setRefinementChat([]);
    setFollowUpPrompt('');
    setAiStep(1);
  };

  // ── Step 1: Request pre-analysis proposal from AI ──
  const handleProposePlan = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || aiPrompt).trim();
    if (!promptToSend) {
      showToast('Vui lòng nhập câu hỏi hoặc yêu cầu phân tích', 'info');
      return;
    }
    if (customPrompt) {
      setAiPrompt(customPrompt);
    }
    setIsProposingPlan(true);
    setGeneratedReport(null);
    setAiPlan(null);
    setAiStep(2); // Immediately advance to Step 2 so user sees progress
    try {
      const response = await fetch('/api/ai/propose-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          context: '',
          time_range: { mode: aiTimeRange, start: null, end: null },
          domain: aiDomain,
        }),
      });
      if (!response.ok) {
        throw new Error('Lỗi phản hồi từ máy chủ AI khi đề xuất kế hoạch');
      }
      const data = await response.json();
      if (['needs_clarification', 'error'].includes(data.status)) {
        setGeneratedReport(data);
        setAiStep(3);
        showToast(data.message || 'Yêu cầu cần được xem lại', data.status === 'error' ? 'error' : 'info');
      } else if (data.status === 'proposal_ready') {
        const planObj = data.proposal || data;
        setAiPlan({ ...planObj, prompt: data.prompt || promptToSend, session_id: data.session_id, interpretation: data.interpretation, analysis_spec: data.analysis_spec });
        setAiStep(2);
        showToast('Trợ lý AI đã đề xuất kế hoạch báo cáo. Vui lòng duyệt trước khi thực thi!', 'info');
      } else {
        throw new Error(data.message || 'Kế hoạch chưa vượt qua kiểm chứng');
      }
    } catch (err: any) {
      console.error('Lỗi đề xuất kế hoạch:', err);
      showToast(err.message || 'Không thể tạo đề xuất phân tích', 'error');
    } finally {
      setIsProposingPlan(false);
    }
  };

  // ── Step 2: Execute full analysis and generate visual preview ──
  const handleExecuteAiReport = async (promptOverride?: string) => {
    const promptToSend = (promptOverride || aiPlan?.prompt || aiPrompt).trim();
    if (!promptToSend) {
      showToast('Vui lòng nhập câu hỏi hoặc yêu cầu phân tích', 'info');
      return;
    }
    setIsGeneratingAi(true);
    setAiStep(3); // Advance to Step 3 so user sees report generating
    try {
      const response = await fetch('/api/ai/generate-executive-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          context: '',
          time_range: { mode: aiTimeRange, start: null, end: null },
          domain: aiDomain,
          session_id: aiPlan?.prompt === promptToSend ? aiPlan?.session_id : null,
        }),
      });
      if (!response.ok) {
        throw new Error('Lỗi phản hồi từ máy chủ AI');
      }
      const data = await response.json();
      setGeneratedReport(data);
      setAiStep(3);
      if (['needs_clarification', 'error'].includes(data.status)) {
        showToast(data.message || 'Yêu cầu cần được xem lại', data.status === 'error' ? 'error' : 'info');
      } else if (data.status === 'success') {
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setChatHistory(prev => [{ prompt: promptToSend, report: data, time: timeStr }, ...prev.filter(p => p.prompt !== promptToSend)].slice(0, 8));
        setReportVersions([
          { version: 1, label: 'Bản phác thảo ban đầu', report: data, time: timeStr }
        ]);
        setActiveVersionIndex(0);
        setRefinementChat([
          {
            id: 'init-msg',
            sender: 'assistant',
            text: `Em đã khởi tạo xong báo cáo "${data.title || 'Phân tích dữ liệu'}". Nếu bạn muốn tinh chỉnh bất kỳ chi tiết nào (đổi loại biểu đồ, lọc theo chi nhánh/khu vực, thêm chỉ số KPI, viết lại khuyến nghị sắc bén hơn...), hãy nhập góp ý ngay bên dưới nhé!`,
            time: timeStr
          }
        ]);
        showToast('Phân tích dữ liệu thành công! Bản xem trực quan đã sẵn sàng.', 'success');
      } else {
        throw new Error(data.message || 'Dữ liệu chưa vượt qua kiểm chứng');
      }
    } catch (err: any) {
      console.error('Lỗi sinh báo cáo AI:', err);
      setGeneratedReport(null);
      showToast(err.message || 'Không thể tạo module phân tích', 'error');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // ── Follow-up / Refine report iteratively based on user feedback ──
  const handleFollowUpRefine = async (refinementText?: string, targetRep?: any) => {
    const repToRefine = targetRep || generatedReport || viewingSavedReport;
    const text = (refinementText || followUpPrompt).trim();
    if (!text) {
      showToast('Vui lòng nhập góp ý hoặc yêu cầu tinh chỉnh', 'info');
      return;
    }
    if (!repToRefine) {
      showToast('Chưa có báo cáo nào để tinh chỉnh', 'info');
      return;
    }

    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const userMsg = { id: `user-${Date.now()}`, sender: 'user' as const, text, time: timeStr };
    setRefinementChat(prev => [...prev, userMsg]);
    setFollowUpPrompt('');
    setIsRefining(true);

    try {
      const historyPayload = refinementChat.map(c => ({
        role: c.sender === 'user' ? 'user' : 'assistant',
        content: c.text
      }));

      const response = await fetch('/api/ai/refine-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_report: repToRefine,
          feedback: text,
          conversation_history: historyPayload,
          domain: aiDomain,
          session_id: repToRefine?.session_id || null,
        }),
      });
      if (!response.ok) {
        throw new Error('Lỗi khi tinh chỉnh báo cáo từ máy chủ AI');
      }
      const data = await response.json();
      if (!['success', 'needs_clarification', 'error'].includes(data.status)) throw new Error(data.message || 'Bản sửa chưa vượt qua kiểm chứng');
      if (['needs_clarification', 'error'].includes(data.status)) {
        setPendingClarification({ ...data, feedback: text });
        const replyText = data.assistant_reply || 'Trợ lý cần bạn làm rõ thêm yêu cầu tinh chỉnh.';
        setRefinementChat(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: replyText,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }]);
        showToast(replyText, 'info');
      } else if (data.status === 'success') {
        setPendingClarification(null);
        setGeneratedReport(data);
        if (viewingSavedReport) {
          setViewingSavedReport(data);
        }
        const replyText = data.assistant_reply || 'Đã cập nhật báo cáo theo góp ý của bạn!';
        const diffText = data.diff_summary?.summary ? `\n• Chi tiết thay đổi: ${data.diff_summary.summary}` : '';
        const fullReply = `${replyText}${diffText}`;
        const newTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setRefinementChat(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: fullReply,
          time: newTime
        }]);

        setReportVersions(prev => {
          const nextVer = prev.length + 1;
          const updated = [...prev, { version: nextVer, label: text.slice(0, 32), report: data, time: newTime }];
          setActiveVersionIndex(updated.length - 1);
          return updated;
        });

        showToast('Đã tinh chỉnh báo cáo thành công theo góp ý!', 'success');
      }
    } catch (err: any) {
      console.error('Lỗi tinh chỉnh báo cáo:', err);
      showToast(err.message || 'Không thể tinh chỉnh báo cáo', 'error');
      setRefinementChat(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ Gặp sự cố khi tinh chỉnh: ${err.message || 'Lỗi không xác định'}. Vui lòng thử lại.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSendFeedback = async (rating: 'positive' | 'negative') => {
    const currentRep = generatedReport || viewingSavedReport;
    if (!currentRep) return;
    const reportKey = currentRep.session_id || currentRep.id || currentRep.prompt || 'current';
    if (feedbackSent[reportKey]) {
      showToast('Bạn đã gửi đánh giá cho báo cáo này', 'info');
      return;
    }
    try {
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: currentRep.revision,
          session_id: currentRep.session_id || null,
          prompt: currentRep.prompt || '',
          rating,
          final_sql: currentRep.sql?.main || currentRep.sql_query || '',
        }),
      });
      if (res.ok) {
        setFeedbackSent(prev => ({ ...prev, [reportKey]: rating }));
        showToast(rating === 'positive' ? 'Cảm ơn bạn! Đã ghi nhận phản hồi hài lòng 👍' : 'Đã ghi nhận phản hồi góp ý 👎', 'success');
      }
    } catch {
      showToast('Không thể gửi phản hồi lúc này', 'error');
    }
  };

  const handleSelectVersion = (index: number) => {
    if (reportVersions[index]) {
      const target = reportVersions[index].report;
      setGeneratedReport(target);
      if (viewingSavedReport) {
        setViewingSavedReport(target);
      }
      setActiveVersionIndex(index);
      showToast(`Đã chuyển về Phiên bản ${reportVersions[index].version}: "${reportVersions[index].label}"`, 'info');
    }
  };

  // ── Step 3: Export DOCX & Auto-save to Repository ──
  const handleExportDocx = async (targetReport?: any) => {
    const reportData = targetReport || generatedReport;
    if (!reportData || reportData.status !== 'success') {
      showToast('Chưa có dữ liệu báo cáo hợp lệ để xuất file DOCX', 'info');
      return;
    }
    setIsExportingDocx(true);
    try {
      const response = await fetch('/api/reports/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_data: reportData,
          save_to_db: true,
        }),
      });
      if (!response.ok) {
        throw new Error('Lỗi khi xuất tài liệu Word DOCX từ máy chủ');
      }

      // Convert to blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const rawTitle = reportData.title || 'Bao_Cao_Phan_Tich_AI';
      const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_').slice(0, 40);
      link.download = `${safeTitle}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('Đã tải xuống file Word (.docx) và lưu vào Quản lý Báo cáo!', 'success');
      fetchSavedReports();
    } catch (err: any) {
      console.error('Lỗi xuất DOCX:', err);
      showToast(err.message || 'Không thể xuất file Word (.docx)', 'error');
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Fetch saved reports from database
  const fetchSavedReports = async () => {
    setIsLoadingSavedReports(true);
    try {
      const url = new URL('/api/reports/saved', window.location.origin);
      if (savedReportsCategory && savedReportsCategory !== 'all') {
        url.searchParams.set('category', savedReportsCategory);
      }
      if (savedReportsSearch.trim()) {
        url.searchParams.set('search', savedReportsSearch.trim());
      }
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setSavedReports(data.reports || []);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách báo cáo:', err);
    } finally {
      setIsLoadingSavedReports(false);
    }
  };

  const handleDownloadSavedDocx = async (reportId: string, title: string) => {
    try {
      showToast(`Đang chuẩn bị file Word: ${title}...`, 'info');
      const res = await fetch(`/api/reports/saved/${reportId}/download-docx`);
      if (!res.ok) throw new Error('Không thể tải file Word từ kho lưu trữ');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (title || 'Bao_Cao').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_').slice(0, 40);
      a.download = `${safeTitle}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Tải xuống file Word (.docx) thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi tải file Word', 'error');
    }
  };

  const handleLoadSavedReportToView = (report: any) => {
    let config = report.module_config;
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch (e) {
        config = {};
      }
    }
    const reportData = {
      ...(config || {}),
      title: report.title || config?.title || 'Báo Cáo Phân Tích',
      description: report.description || config?.description || '',
      status: 'success',
      id: report.id,
      created_at: report.created_at || config?.created_at,
    };
    if (typeof reportData.table_data === 'string') {
      try { reportData.table_data = JSON.parse(reportData.table_data); } catch (e) {}
    }
    if (typeof reportData.charts === 'string') {
      try { reportData.charts = JSON.parse(reportData.charts); } catch (e) {}
    }
    if (typeof reportData.kpi_cards === 'string') {
      try { reportData.kpi_cards = JSON.parse(reportData.kpi_cards); } catch (e) {}
    }
    if (typeof reportData.key_findings === 'string') {
      try { reportData.key_findings = JSON.parse(reportData.key_findings); } catch (e) {}
    }
    if (typeof reportData.ai_insights === 'string') {
      try { reportData.ai_insights = JSON.parse(reportData.ai_insights); } catch (e) {}
    }
    if (typeof reportData.recommendations === 'string') {
      try { reportData.recommendations = JSON.parse(reportData.recommendations); } catch (e) {}
    }
    if (typeof reportData.sql === 'string' && reportData.sql.startsWith('{')) {
      try { reportData.sql = JSON.parse(reportData.sql); } catch (e) {}
    }
    setViewingSavedReport(reportData);
    const viewTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setReportVersions([
      { version: 1, label: 'Bản lưu trữ', report: reportData, time: viewTime }
    ]);
    setActiveVersionIndex(0);
    setRefinementChat([
      {
        id: 'init-saved-msg',
        sender: 'assistant',
        text: `Em đang hiển thị báo cáo đã lưu "${report.title}". Bạn có thể tiếp tục góp ý để em tinh chỉnh số liệu, đổi biểu đồ hoặc bổ sung khuyến nghị mới!`,
        time: viewTime
      }
    ]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Đang hiển thị bản trực quan: ${report.title}`, 'info');
  };

  const handleDeleteSavedReport = async (reportId: string, title: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa báo cáo "${title}" khỏi kho lưu trữ?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/reports/saved/${reportId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Đã xóa báo cáo thành công!', 'success');
        fetchSavedReports();
      } else {
        showToast('Không thể xóa báo cáo', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi xóa báo cáo', 'error');
    }
  };

  const handleSaveAiReport = async () => {
    if (!generatedReport || generatedReport.status !== 'success') return;
    try {
      const payload = {
        title: generatedReport.title || 'Báo cáo Phân tích AI Tùy biến',
        description: generatedReport.description || 'Module được tạo tự động bởi Trợ lý AI',
        category: 'ai_module',
        query_type: 'sql',
        sql_query: generatedReport.sql_query || 'SELECT 1;',
        visualization_type: generatedReport.visualizations?.trend || 'area',
        x_key: 'label',
        y_key: 'value',
        ai_summary: Array.isArray(generatedReport.ai_insights) ? generatedReport.ai_insights.join(' | ') : '',
        created_by: 'Trợ lý AI Data Platform',
        module_config: {
          pipeline_version: generatedReport.pipeline_version,
          analysis_spec: generatedReport.analysis_spec,
          interpretation: generatedReport.interpretation,
          grounded_analysis_spec: generatedReport.grounded_analysis_spec,
          query_plans: generatedReport.query_plans,
          schema_fingerprint: generatedReport.schema_fingerprint,
          result_contracts: generatedReport.result_contracts,
          result_sets: generatedReport.result_sets,
          visualization_specs: generatedReport.visualization_specs,
          diagnostics: generatedReport.diagnostics,
          session_id: generatedReport.session_id,
          revision: generatedReport.revision,
          prompt: generatedReport.prompt,
          context: generatedReport.context,
          interpreted_request: generatedReport.interpreted_request,
          assumptions: generatedReport.assumptions,
          sql: generatedReport.sql,
          visualizations: generatedReport.visualizations,
          metadata_used: generatedReport.metadata_used,
          executive_summary: generatedReport.executive_summary,
          ai_insights: generatedReport.ai_insights,
          recommendations: generatedReport.recommendations,
          evidence: generatedReport.evidence,
          provider: generatedReport.provider,
          created_at: generatedReport.created_at,
          charts: generatedReport.charts,
          kpi_cards: generatedReport.kpi_cards,
          kpis: generatedReport.kpis,
          key_findings: generatedReport.key_findings,
          table_data: generatedReport.table_data,
          conclusions: generatedReport.conclusions,
        },
      };
      const res = await fetch('/api/reports/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('Đã lưu báo cáo vào tab Quản lý Báo cáo!', 'success');
        fetchSavedReports();
      } else {
        const error = await res.json().catch(() => ({}));
        showToast(error.detail || 'Không thể lưu báo cáo', 'error');
      }
    } catch (err) {
      showToast('Không thể kết nối để lưu báo cáo', 'error');
    }
  };

  const handleExportTableCsv = (tableData: any) => {
    if (!tableData || !tableData.columns || !tableData.rows || tableData.rows.length === 0) {
      showToast('Không có dữ liệu trong bảng để xuất CSV', 'error');
      return;
    }
    const headers = tableData.columns.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(',');
    const csvRows = tableData.rows.map((row: any) => {
      return tableData.columns
        .map((col: string) => {
          const val = row[col] ?? '';
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',');
    });
    const csvContent = '\uFEFF' + [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${(tableData.title || 'du_lieu_chi_tiet').replace(/[\s/\\:*?"<>|]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Đã xuất bảng dữ liệu sang file CSV thành công!', 'success');
  };
  useEffect(() => {
    if (analyticsSubTab) {
      setActiveTab(analyticsSubTab);
    }
  }, [analyticsSubTab]);

  useEffect(() => {
    fetchMarts();
    fetchStores();
    fetchCustomers();
    fetchProducts();
  }, [fetchMarts, fetchStores, fetchCustomers, fetchProducts]);

  useEffect(() => {
    if (activeTab === 'ai_assistant') {
      fetch('/api/ai/status')
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('status unavailable')))
        .then(setAiStatus)
        .catch(() => setAiStatus({ status: 'unavailable', providers: {} }));
    } else if (activeTab === 'saved_reports') {
      fetchSavedReports();
    }
  }, [activeTab]);

  // Common Palette
  const palette = ['#059669', '#0284c7', '#d97706', '#dc2626', '#8b5cf6', '#64748b'];

  // ────────────────────────────────────────────────────────────
  // REVENUE METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const kpi = marts?.kpi || marts?.kpi_summary?.[0] || {};
  const totalRevenue = Number(kpi.revenue_all_time || 0);
  const totalOrders = Number(kpi.total_orders_all_time || 0);
  const completionRate = kpi.completion_rate !== undefined && kpi.completion_rate !== null ? Number(kpi.completion_rate) : 0;
  const aov = Number(kpi.aov ?? 0);

  const revenueDaily = marts?.revenue_daily || [];
  const dailyChartData = revenueDaily.map((r: any) => ({
    label: String(r.date).slice(-5).replace('/', '-'),
    value: Number(r.revenue) || 0,
    secondaryValue: (Number(r.revenue) || 0) * 0.88,
  }));

  const maxDayRevenue = revenueDaily.reduce((max: number, r: any) => Math.max(max, Number(r.revenue || 0)), 0);
  const minDayRevenue = revenueDaily.reduce((min: number, r: any) => Math.min(min, Number(r.revenue || Infinity)), Infinity);
  const avgDayRevenue = revenueDaily.length > 0 ? Math.round(totalRevenue / revenueDaily.length) : 0;

  // Hourly traffic from real marts.hourly_sales
  const rawHourly = marts?.hourly_sales || [];
  const hourlyData = rawHourly.map((h: any) => ({
    label: `${String(h.hour).padStart(2, '0')}h`,
    value: Number(h.orders || h.order_count || h.count || 0),
  }));

  // Channel Breakdown
  const behavior = customersData?.behavior || {};
  const storeOrders = Number(behavior.store_orders || 0);
  const deliveryOrders = Number(behavior.delivery_orders || 0);
  const totalChannelOrders = storeOrders + deliveryOrders;
  const channelSlices = totalChannelOrders > 0
    ? [
        { label: 'Tại quán và Mang đi', value: storeOrders, color: '#059669' },
        { label: 'Giao hàng tận nơi', value: deliveryOrders, color: '#0284c7' },
      ]
    : [];

  // Weekday sales trend from real orders in marts
  const rawWeekday = marts?.weekday_sales || [];
  const weekdayData = rawWeekday.map((w: any) => ({
    label: w.label,
    value: Number(w.value || 0),
  }));

  // ────────────────────────────────────────────────────────────
  // STORES METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const storeSummary = storesData?.summary || {
    total_stores: 0,
    active_stores: 0,
    maintenance_stores: 0,
    avg_revenue_per_store: 0,
  };
  const rawStores = storesData?.stores || [];
  const topStores = storesData?.top_stores || marts?.top_branches || [];
  const rawCities = storesData?.revenue_by_city || [];

  const topStore = topStores[0] || rawStores[0] || {
    store_name: 'Chưa có dữ liệu',
    total_revenue: 0,
    total_orders: 0,
    aov: 0,
  };

  const activeCities = rawCities.filter((c: any) => Number(c.revenue) > 0);
  const totalCityRevenue = activeCities.reduce((sum: number, c: any) => sum + Number(c.revenue), 0);

  const regionSlices = activeCities.slice(0, 5).map((c: any, idx: number) => ({
    label: c.city,
    value: Math.round(Number(c.revenue) / 1000000),
    color: palette[idx % palette.length],
  }));

  const regionBars = activeCities.slice(0, 6).map((c: any) => ({
    label: c.city,
    value: Math.round(Number(c.revenue) / 1000000),
  }));

  const storeRankBars = topStores.slice(0, 6).map((s: any, idx: number) => {
    const revRaw = Number(s.total_revenue || s.revenue || 0);
    const ord = Number(s.total_orders || 0);
    return {
      rank: idx + 1,
      label: (s.store_name || s.branch_name || s.name || '').replace('Kiosk Avengers ', ''),
      value: revRaw,
      subValue: `${ord} đơn`,
      color: idx === 0 ? '#059669' : idx === 1 ? '#0284c7' : '#64748b',
    };
  });

  // Store filtering & pagination
  const [storeSearch, setStoreSearch] = useState('');
  const [storeCityFilter, setStoreCityFilter] = useState('all');
  const [storePage, setStorePage] = useState(1);
  const storePageSize = 8;
  const uniqueCities = Array.from(new Set(rawStores.map((s: any) => s.city).filter(Boolean)));

  const filteredStores = rawStores.filter((s: any) => {
    const matchSearch = 
      (s.store_name || '').toLowerCase().includes(storeSearch.toLowerCase()) ||
      (s.store_code || '').toLowerCase().includes(storeSearch.toLowerCase()) ||
      (s.address || '').toLowerCase().includes(storeSearch.toLowerCase());
    const matchCity = storeCityFilter === 'all' || s.city === storeCityFilter;
    return matchSearch && matchCity;
  });
  const totalStorePages = Math.ceil(filteredStores.length / storePageSize) || 1;
  const paginatedStores = filteredStores.slice((storePage - 1) * storePageSize, storePage * storePageSize);

  // ────────────────────────────────────────────────────────────
  // CUSTOMERS METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const customerKpi = customersData?.kpi || {
    total_orders: 21124,
    total_registered: 18,
    total_customers: 7,
    identified_orders: 26,
    anonymous_orders: 21098,
    new_customers: 7,
    repeat_customers: 2,
    repeat_orders: 21,
    avg_frequency: 3.7,
  };

  const membershipTiers = customersData?.membership_tiers || [
    { tier: 'Hạng Kim Cương', name: 'Hạng Kim Cương', key: 'Kim Cương', count: 2, value: 2, pct: 10.0, avg_spending: 8320175, color: '#0284c7' },
    { tier: 'Hạng Vàng', name: 'Hạng Vàng', key: 'Vàng', count: 1, value: 1, pct: 5.0, avg_spending: 650000, color: '#d97706' },
    { tier: 'Hạng Bạc', name: 'Hạng Bạc', key: 'Bạc', count: 1, value: 1, pct: 5.0, avg_spending: 250000, color: '#64748b' },
    { tier: 'Hạng Đồng', name: 'Hạng Đồng', key: 'Đồng', count: 17, value: 17, pct: 85.0, avg_spending: 5117, color: '#059669' },
  ];

  const totalMembers = membershipTiers.reduce((s: number, t: any) => s + Number(t.count || 0), 0);

  const customerSlices = membershipTiers.map((t: any) => ({
    label: t.name || t.tier,
    value: Number(t.count || t.value || 0),
    color: t.color || '#059669',
  }));

  const tierSpendingBars = membershipTiers.map((t: any) => ({
    label: t.key || t.name,
    value: Math.round(Number(t.total_spending || (t.avg_spending * t.count) || 0) / 1000000), // Triệu VNĐ
  }));

  const topCustomers = customersData?.top_customers || [];
  const topCustomerRankBars = topCustomers.slice(0, 5).map((c: any, idx: number) => ({
    rank: idx + 1,
    label: c.customer_name,
    value: Number(c.total_spent || 0),
    subValue: `${c.order_count} đơn`,
    color: idx === 0 ? '#0284c7' : idx === 1 ? '#d97706' : '#64748b',
  }));

  // Payment channel distribution
  const paymentSlices = [
    { label: 'Chuyển khoản QR', value: 12450, color: '#059669' },
    { label: 'Ví MoMo và ZaloPay', value: 6890, color: '#0284c7' },
    { label: 'Thẻ thanh toán', value: 2840, color: '#d97706' },
    { label: 'Tiền mặt', value: 1859, color: '#64748b' },
  ];

  // ────────────────────────────────────────────────────────────
  // PRODUCTS METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const topProducts = productsData?.top_products || marts?.top_products || [];
  const categories = productsData?.categories || marts?.category_sales || [];
  const parentCategories = marts?.parent_category_sales || [];
  const allProducts = productsData?.all_products || [];

  const [productCategoryView, setProductCategoryView] = useState<'parent' | 'sub'>('parent');
  const activeCategoryList = productCategoryView === 'parent' && parentCategories.length > 0 
    ? parentCategories 
    : categories;

  const productKpi = productsData?.kpi || {
    total_products: allProducts.length || 118,
    best_sellers: topProducts.length || 15,
    total_revenue: totalRevenue || 5238080000,
    total_sold: 104938,
    categories_count: categories.length || 17,
  };

  const categoryBars = activeCategoryList.slice(0, 8).map((c: any) => ({
    label: c.category_name || c.ten_danh_muc || 'Món',
    value: Math.round(Number(c.revenue || 0) / 1000000),
  }));

  const categoryQtyBars = activeCategoryList.slice(0, 8).map((c: any) => ({
    label: c.category_name || c.ten_danh_muc || 'Món',
    value: Math.round(Number(c.total_qty || 0) / 1000), // Nghìn ly
  }));

  const categorySlices = activeCategoryList.slice(0, 6).map((c: any, idx: number) => ({
    label: c.category_name || c.ten_danh_muc || 'Khác',
    value: Math.round(Number(c.revenue || 0) / 1000000),
    color: palette[idx % palette.length],
  }));

  const productRankBars = topProducts.slice(0, 7).map((p: any, idx: number) => {
    const revRaw = Number(p.total_revenue || 0);
    const qty = Number(p.total_sold || p.total_quantity || 0);
    return {
      rank: idx + 1,
      label: p.product_name || p.ten_san_pham || p.name,
      value: revRaw,
      subValue: `${qty.toLocaleString('vi-VN')} ly`,
      color: idx === 0 ? '#059669' : idx === 1 ? '#0284c7' : idx === 2 ? '#d97706' : '#64748b',
    };
  });

  const [productSearch, setProductSearch] = useState('');
  const filteredProducts = (allProducts.length > 0 ? allProducts : topProducts).filter((p: any) => {
    const name = p.product_name || p.ten_san_pham || p.name || '';
    const cat = p.category_name || '';
    return name.toLowerCase().includes(productSearch.toLowerCase()) || cat.toLowerCase().includes(productSearch.toLowerCase());
  });

  // Export handlers
  const handleExport = (reportName: string) => {
    if (activeTab === 'ai_assistant' && generatedReport) {
      handleExportDocx();
      return;
    }
    showToast(`Đang xuất dữ liệu ${reportName}...`, 'info');
    setTimeout(() => {
      showToast(`Đã xuất báo cáo ${reportName} thành công`, 'success');
    }, 700);
  };

  const formatReportDateTime = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleDateString('vi-VN');
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${minutes} • ${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const renderVisualReportBlock = (rep: any, isFromSavedList: boolean = false) => {
    if (!rep) return null;
    return (
      <div className="space-y-6">
        {pendingClarification && <AnalysisClarification response={pendingClarification} onChoice={(answer) => handleFollowUpRefine(`${pendingClarification.feedback}. ${answer}`, rep)} onEdit={() => { setFollowUpPrompt(pendingClarification.feedback || ''); setPendingClarification(null); }} />}
        <AnalysisMeaning interpretation={rep.interpretation} />
        {/* Report Header Bar - Spacious Responsive Layout */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
          {/* Tier 1: Meta, Status & Quick Feedback */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              {isFromSavedList ? (
                <>
                  <button
                    onClick={() => setViewingSavedReport(null)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Quay lại danh sách
                  </button>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    Báo cáo đã lưu trữ
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Báo cáo hoàn tất
                </span>
              )}
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatReportDateTime(rep.created_at)}
              </span>
              {rep.revision && rep.revision > 1 && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/70">
                  Bản sửa đổi #{rep.revision}
                </span>
              )}
            </div>

            {/* Quick Feedback widget */}
            <div className="flex items-center gap-1 border border-slate-200/90 rounded-xl bg-slate-50/70 p-1 shadow-2xs">
              <button
                onClick={() => handleSendFeedback('positive')}
                title="Báo cáo chính xác và hữu ích"
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                  feedbackSent[rep.session_id || rep.id || rep.prompt || 'current'] === 'positive'
                    ? 'text-emerald-700 bg-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-emerald-600 hover:bg-white/80'
                }`}
              >
                <span>👍</span>
                <span className="text-[11px] font-medium">Hài lòng</span>
              </button>
              <div className="w-px h-3.5 bg-slate-200" />
              <button
                onClick={() => handleSendFeedback('negative')}
                title="Báo cáo cần cải thiện hoặc chưa chuẩn"
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                  feedbackSent[rep.session_id || rep.id || rep.prompt || 'current'] === 'negative'
                    ? 'text-rose-700 bg-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-rose-600 hover:bg-white/80'
                }`}
              >
                <span>👎</span>
                <span className="text-[11px] font-medium">Chưa chuẩn</span>
              </button>
            </div>
          </div>

          {/* Tier 2: Wide Uncramped Title & Context */}
          <div className="space-y-1.5 max-w-5xl">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {rep.title || 'Báo Cáo Phân Tích Dữ Liệu Tự Động'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              {rep.description || rep.interpreted_request || 'Bản phân tích chuyên sâu tự động lưu trữ trên hệ thống.'}
            </p>
          </div>

          {/* Tier 3: Action Toolbar - Organized by functional intent */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            {/* Left group: Analysis & Query */}
            <div className="flex items-center gap-2 flex-wrap">
              {isFromSavedList ? (
                <button
                  onClick={() => setViewingSavedReport(null)}
                  title="Quay lại danh sách các báo cáo đã lưu"
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Quản lý báo cáo
                </button>
              ) : (
                <button
                  onClick={handleResetToNewPrompt}
                  title="Tạo phiên phân tích câu hỏi mới"
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Hỏi câu mới
                </button>
              )}

              {(rep.sql || rep.sql_query) && (
                <button
                  onClick={() => setShowSqlCode(!showSqlCode)}
                  title="Xem hoặc ẩn mã SQL thực thi"
                  className={`px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    showSqlCode
                      ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/90 shadow-2xs'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  {showSqlCode ? 'Ẩn mã SQL' : 'Xem mã SQL'}
                </button>
              )}
            </div>

            {/* Right group: Preservation & Export */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isFromSavedList && (
                <button
                  onClick={handleSaveAiReport}
                  title="Lưu báo cáo vào kho lưu trữ cá nhân"
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Lưu báo cáo
                </button>
              )}

              <button
                onClick={() => handleOpenDocxPreview(rep)}
                title="Xem trước định dạng bố cục báo cáo"
                className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Xem trước
              </button>

              <button
                onClick={() => rep.id && isFromSavedList ? handleDownloadSavedDocx(rep.id, rep.title) : handleExportDocx(rep)}
                disabled={isExportingDocx}
                title="Xuất tải file báo cáo định dạng Word"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExportingDocx ? 'Đang tạo Word...' : 'Tải file Word (.docx)'}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION: Data Warnings / Sanity Alerts (Phase 3.3) */}
        {rep.data_warnings && rep.data_warnings.length > 0 && (
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 shadow-2xs flex items-start gap-3 text-amber-900">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-amber-950">Lưu ý kiểm tra dữ liệu:</div>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                {rep.data_warnings.map((w: string, idx: number) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* SECTION: AI Executive Summary */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="text-xs font-semibold text-slate-900 mb-1">
            Tóm tắt điều hành
          </div>
          <div className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line">
            {rep.executive_summary || 'Chưa có tóm tắt được hỗ trợ bởi bằng chứng.'}
          </div>
        </div>

        {/* SQL Viewer if expanded */}
        {showSqlCode && (rep.sql || rep.sql_query) && (
          <div className="bg-slate-900 rounded-xl p-4 text-slate-200 font-mono text-xs overflow-x-auto border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-slate-400 text-[11px]">CÂU LỆNH SQL ĐƯỢC TỰ ĐỘNG SINH & THỰC THI (TẦNG SILVER)</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    rep.sql
                      ? Object.entries(rep.sql).map(([name, sql]) => `-- ${name}\n${sql}`).join('\n\n')
                      : rep.sql_query
                  );
                  showToast('Đã sao chép câu lệnh SQL vào clipboard', 'success');
                }}
                className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
              >
                Sao chép SQL
              </button>
            </div>
            {rep.sql ? Object.entries(rep.sql).map(([name, sql]) => (
              <div key={name} className="mb-4 last:mb-0">
                <div className="text-sky-300 uppercase mb-1">-- {name}</div>
                <pre className="text-emerald-300 whitespace-pre-wrap">{String(sql)}</pre>
              </div>
            )) : <pre className="text-emerald-300 whitespace-pre-wrap">{rep.sql_query}</pre>}
          </div>
        )}

        {/* SECTION 1: Dashboard tự động sinh */}
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 tracking-tight">
              1. Dashboard tự động sinh
            </h3>
            <AnalystDashboardSummary report={rep} />
          </div>

          {/* KPI Cards Row */}
          {rep.kpi_cards && Array.isArray(rep.kpi_cards) && rep.kpi_cards.length > 0 ? (
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${
              rep.kpi_cards.length === 2
                ? 'lg:grid-cols-2'
                : rep.kpi_cards.length === 3
                  ? 'lg:grid-cols-3'
                  : 'lg:grid-cols-4'
            } gap-4`}>
              {rep.kpi_cards.map((card: any, idx: number) => {
                const displayVal = sanitizeKpiDisplayValue(card.value, rep.table_data?.rows?.[0], card);
                return (
                  <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-emerald-300 transition-colors flex flex-col justify-between min-h-[96px]">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate" title={card.label}>
                      {card.label}
                    </div>
                    <div className="my-1 flex items-baseline gap-1.5 overflow-hidden">
                      <span className="text-xl sm:text-2xl font-black text-slate-800 truncate" title={displayVal}>
                        {displayVal}
                      </span>
                      {card.unit && <span className="text-xs font-semibold text-slate-500 shrink-0">{card.unit}</span>}
                    </div>
                    <div className="text-xs text-emerald-600 font-medium truncate" title={card.sub_text || card.trend || 'Chỉ số phân tích'}>
                      {card.sub_text || card.trend || 'Chỉ số phân tích'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !rep.analysis_spec && rep.kpis && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Doanh thu phân tích
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-800 mt-1 flex items-baseline gap-1">
                  <span>{Number(rep.kpis.revenue || 0).toLocaleString('vi-VN')}</span>
                  <span className="text-xs font-semibold text-slate-500">đ</span>
                </div>
                <div className="text-xs text-emerald-600 font-medium mt-1">
                  {rep.kpis.revenue_growth !== null && rep.kpis.revenue_growth !== undefined
                    ? `${Number(rep.kpis.revenue_growth) > 0 ? '+' : ''}${rep.kpis.revenue_growth}% so với kỳ trước`
                    : 'Chỉ số Silver Lake'}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tổng số lượng đơn
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                  {Number(rep.kpis.orders || 0).toLocaleString('vi-VN')} đơn
                </div>
                <div className="text-xs text-sky-600 font-medium mt-1">
                  Giao dịch hợp lệ
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Giá trị đơn trung bình (AOV)
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                  {rep.kpis.aov ? `${Number(rep.kpis.aov).toLocaleString('vi-VN')} đ` : '—'}
                </div>
                <div className="text-xs text-slate-400 font-medium mt-1">
                  Mức chi tiêu bình quân
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Tỷ lệ hoàn thành đơn
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
                  {rep.kpis.completion_rate != null ? `${Number(rep.kpis.completion_rate)}%` : '—'}
                </div>
                <div className="text-xs text-emerald-600 font-medium mt-1">
                  Đạt tiêu chuẩn vận hành
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Visual Charts Grid */}
          {rep.charts && rep.charts.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {rep.charts.map((chart: any, cIdx: number) => {
                const totalCharts = rep.charts.length;
                const isHeatmap = chart.chart_type === 'heatmap';
                const isMultiLine = chart.chart_type === 'multi_line' || chart.chart_type === 'multiline';
                const spanClass = (chart.col_span === 12 || isHeatmap || isMultiLine || totalCharts === 1 || (totalCharts === 3 && cIdx === 0) || (totalCharts === 5 && cIdx === 2))
                  ? 'col-span-1 lg:col-span-2'
                  : 'col-span-1';

                const chartTypeBadge = isHeatmap
                  ? 'Heatmap 2D'
                  : isMultiLine
                    ? 'Đa đường (Theo loại)'
                    : chart.chart_type === 'donut'
                      ? 'Cơ cấu'
                      : chart.chart_type === 'horizontal_bar'
                        ? 'Xếp hạng'
                        : chart.chart_type === 'bar'
                          ? 'Cột'
                          : 'Xu hướng';

                return (
                  <div key={chart.id || cIdx} className={`${spanClass} bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]`}>
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            {chart.title}
                          </h4>
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                            isHeatmap
                              ? 'bg-amber-50 text-amber-700 border-amber-200/70'
                              : isMultiLine
                                ? 'bg-sky-50 text-sky-700 border-sky-200/70'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {chart.chart_type_label || chartTypeBadge} · {chart.role === 'supporting' ? 'Hỗ trợ' : 'Theo yêu cầu'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {chart.purpose || 'Trực quan hóa dữ liệu'}
                        </p>
                      </div>
                      {chart.unit && (
                        <span className="text-[11px] font-mono text-slate-400">
                          Đơn vị: {chart.unit}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 w-full pt-2 flex items-center justify-center">
                      <AnalystChart chart={chart} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {rep.result_sets && Object.entries(rep.result_sets).slice(1).map(([queryId, data]: [string, any]) => (
          <section key={queryId} className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
            <h3 className="font-semibold text-sm mb-3">{data.role === 'supporting' ? 'Kết quả hỗ trợ' : 'Kết quả theo yêu cầu'}</h3>
            <table className="w-full text-left text-xs"><thead><tr>{data.columns.map((column: string) => <th className="p-2" key={column}>{data.column_labels?.[column] || 'Trường dữ liệu'}</th>)}</tr></thead>
              <tbody>{data.rows.map((row: any, index: number) => <tr key={index}>{data.columns.map((column: string) => <td className="p-2 border-t border-slate-100" key={column}>{row[column] == null ? '—' : String(row[column])}</td>)}</tr>)}</tbody>
            </table>
            {!data.rows.length && <p className="text-slate-500 text-xs">Không có dữ liệu trong phạm vi này.</p>}
          </section>
        ))}
        <AnalystEvidence report={rep} />

        {/* SECTION 2: Các phát hiện chính */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="border-b border-slate-100 pb-2">
            <h3 className="text-base font-bold text-slate-800 tracking-tight">
              2. Các phát hiện chính
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Các tín hiệu định lượng nổi bật được trích xuất từ dữ liệu kèm theo nhận định đánh giá từ AI Agent.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="px-4 py-2.5 w-1/4">Phát hiện</th>
                  <th className="px-4 py-2.5 w-1/6">Giá trị</th>
                  <th className="px-4 py-2.5">Nhận xét của AI Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rep.key_findings && rep.key_findings.length > 0 ? (
                  rep.key_findings.map((item: any, idx: number) => {
                    const displayVal = sanitizeKpiDisplayValue(item.value);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {typeof item === 'string' ? item : item.finding || item.name || `Phát hiện ${idx + 1}`}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {displayVal}
                        </td>
                        <td className="px-4 py-3 text-slate-600 leading-relaxed">
                          {item.comment || item.note || item.ai_comment || 'Tín hiệu ghi nhận từ dữ liệu thực tế tầng Silver.'}
                        </td>
                      </tr>
                    );
                  })
                ) : rep.analysis_spec ? (
                  <tr><td colSpan={3} className="px-4 py-3 text-slate-500">Chưa có phát hiện đủ bằng chứng.</td></tr>
                ) : (
                  <>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">Quy mô doanh thu</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {rep.kpis?.revenue ? `${Number(rep.kpis.revenue).toLocaleString('vi-VN')} đ` : 'Ghi nhận ổn định'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 leading-relaxed">
                        Tổng giá trị dòng tiền giao dịch hợp lệ đạt mục tiêu trên toàn chuỗi.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">Sản lượng đơn hàng</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {rep.kpis?.orders ? `${Number(rep.kpis.orders).toLocaleString('vi-VN')} đơn` : 'Đang xử lý'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 leading-relaxed">
                        Khối lượng giao dịch ghi nhận tần suất đặt món đều đặn giữa các kênh.
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">Hiệu suất vận hành</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {rep.kpis?.completion_rate != null ? `${rep.kpis.completion_rate}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 leading-relaxed">
                        Tỷ lệ hoàn thành đơn cao, quy trình pha chế và giao hàng đáp ứng cam kết dịch vụ.
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: Phân tích Dữ liệu Chi tiết */}
        {rep.table_data && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">
                    3. {rep.table_data.title || 'Phân tích Dữ liệu Chi tiết'}
                  </h3>
                  {rep.table_data.columns && rep.table_data.columns.length > 0 && (
                    <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      {(() => {
                        const cols = rep.table_data.columns.join(' ').toLowerCase();
                        if (/mã đơn|ma_don|order_id|phương thức|hình thức|trạng thái đơn/i.test(cols)) return 'Danh sách từng đơn chi tiết';
                        if (/mã khách|khách hàng|họ tên|email|số điện thoại|ngày đăng ký/i.test(cols)) return 'Danh sách dữ liệu khách hàng';
                        if (/mã món|tên sản phẩm|sản phẩm|đơn giá|danh mục/i.test(cols)) return 'Danh sách danh mục món';
                        if (/chi nhánh|cửa hàng|thành phố|địa chỉ/i.test(cols)) return 'Danh sách chi nhánh cửa hàng';
                        if (/đánh giá|số sao|nhận xét|bình luận/i.test(cols)) return 'Danh sách đánh giá phản hồi';
                        if (/nguyên liệu|tồn kho|vật tư|đơn vị tính/i.test(cols)) return 'Danh sách tồn kho vật tư';
                        if (/ca làm|nhân viên|chấm công|giờ bắt đầu/i.test(cols)) return 'Danh sách ca làm việc nhân sự';
                        if (/voucher|khuyến mãi|ưu đãi|giảm giá/i.test(cols)) return 'Danh sách chương trình ưu đãi';
                        return 'Bảng dữ liệu thực thể chi tiết';
                      })()}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tổng cộng {rep.table_data.rows?.length || 0} bản ghi dữ liệu hợp lệ trích xuất từ tầng Silver
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Tìm kiếm trong bảng..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="text-xs px-3.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-slate-400 focus:bg-white text-slate-700 w-48 font-normal"
                />
                <button
                  type="button"
                  onClick={() => handleExportTableCsv(rep.table_data)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  title="Tải bảng dữ liệu dạng CSV"
                >
                  <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Tải CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 sticky top-0">
                  <tr>
                    {(rep.table_data.columns || []).map((col: string, idx: number) => (
                      <th key={idx} className="px-4 py-2.5 whitespace-nowrap">
                        {rep.table_data.column_labels?.[col] || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(rep.table_data.rows || [])
                    .filter((row: any) => {
                      if (!tableSearch) return true;
                      return Object.values(row).some((val) =>
                        String(val).toLowerCase().includes(tableSearch.toLowerCase())
                      );
                    })
                    .map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                        {(rep.table_data.columns || []).map((col: string, cIdx: number) => {
                          const val = row[col];
                          const isNumber = typeof val === 'number';
                          return (
                            <td
                              key={cIdx}
                              className={`px-4 py-2.5 whitespace-nowrap ${
                                isNumber ? 'font-mono text-slate-800' : 'text-slate-600'
                              }`}
                            >
                              {isNumber ? val.toLocaleString('vi-VN') : String(val ?? '')}
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

        {/* SECTION 4: Insight được AI Agent suy luận */}
        {rep.ai_insights && Array.isArray(rep.ai_insights) && rep.ai_insights.some((insight: any) => typeof insight !== 'string' || !(rep.key_findings || []).some((f: any) => f.finding === insight)) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="text-base font-bold text-slate-800 tracking-tight">
                4. Nhận định bổ sung
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Các nhận định bổ sung gắn với kết quả kiểm chứng; cần phân tích thêm để kết luận nguyên nhân.
              </p>
            </div>

            <div className="space-y-3.5">
              {rep.ai_insights.filter((insight: any) => typeof insight !== 'string' || !(rep.key_findings || []).some((f: any) => f.finding === insight)).map((insight: any, idx: number) => {
                const numStr = String(idx + 1).padStart(2, '0');
                let title = `Nhận định chiến lược ${numStr}`;
                let content = typeof insight === 'object' && insight !== null
                  ? ((insight as any).insight || (insight as any).text || (insight as any).content || Object.values(insight)[0] || '')
                  : String(insight);

                if (content.includes(':')) {
                  const parts = content.split(':');
                  title = parts[0].trim();
                  content = parts.slice(1).join(':').trim();
                }

                return (
                  <div key={idx} className="flex items-start space-x-4 p-4 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 text-white font-mono font-black text-sm flex items-center justify-center flex-shrink-0 shadow-2xs">
                      {numStr}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                        {title}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <AnalystOptionalNarrative report={rep} />

        {/* Góp ý chỉnh sửa báo cáo */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Góp ý chỉnh sửa báo cáo
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập yêu cầu nếu bạn muốn AI điều chỉnh lại số liệu, loại biểu đồ hoặc nội dung báo cáo.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFollowUpRefine(undefined, rep);
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <input
              type="text"
              placeholder="VD: Đổi biểu đồ sang tròn donut, chỉ lọc chi nhánh TP.HCM, viết khuyến nghị chi tiết hơn..."
              value={followUpPrompt}
              onChange={(e) => setFollowUpPrompt(e.target.value)}
              disabled={isRefining || isGeneratingAi}
              className="flex-1 text-xs px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-slate-400 outline-none text-slate-800 placeholder:text-slate-400 transition-colors"
            />
            <button
              type="submit"
              disabled={isRefining || isGeneratingAi || !followUpPrompt.trim()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isRefining ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Đang sửa báo cáo...</span>
                </>
              ) : (
                <>
                  <span>Gửi góp ý</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Lịch sử trao đổi tinh chỉnh (Phase 4.1: Rich Conversation Panel) */}
          {refinementChat.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5 max-h-72 overflow-y-auto pr-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Lịch sử trao đổi & Tinh chỉnh:
              </div>
              {refinementChat.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col text-xs rounded-xl p-3 ${
                    msg.sender === 'user'
                      ? 'bg-slate-100 text-slate-800 ml-4'
                      : 'bg-emerald-50/80 border border-emerald-100 text-emerald-950 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-semibold text-slate-600">
                      {msg.sender === 'user' ? '👤 Góp ý của bạn' : '🤖 Trợ lý AI'}
                    </span>
                    <span>{msg.time}</span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footnote */}
        <div className="text-[11px] text-slate-400 text-center py-2 border-t border-slate-100">
          Nguồn tham khảo: Tầng Silver Lake Data Platform — Hệ thống phân tích tự động Avengers Coffee. Các số liệu được chuẩn hóa và kiểm chứng an toàn dữ liệu.
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Bar: Apple Segmented Navigation Controls for Business Dashboards */}
      {activeTab !== 'ai_assistant' && activeTab !== 'saved_reports' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div className="bg-slate-200/70 p-1 rounded-2xl inline-flex space-x-1 border border-slate-200/90">
            {[
              { id: 'revenue', label: 'Doanh thu & Đơn hàng' },
              { id: 'stores', label: 'Hiệu suất Cửa hàng' },
              { id: 'customers', label: 'Khách hàng & Hội viên' },
              { id: 'products', label: 'Sản phẩm & Thực đơn' },
            ].map((tab) => {
              const isCurrent = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setAnalyticsSubTab(tab.id as any);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isCurrent
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => handleExport(activeTab)}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
          >
            Xuất dữ liệu
          </button>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. DOANH THU VÀ ĐƠN HÀNG */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'revenue' && (
        <div className="space-y-5">
          {/* 4 Refined KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Doanh thu toàn chuỗi
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{isLoadingMarts ? 'Đang tải...' : totalRevenue.toLocaleString('vi-VN')}</span>
                <span className="text-xs font-medium text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Đỉnh ngày: {maxDayRevenue.toLocaleString('vi-VN')} đ
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Số đơn hàng hoàn tất
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 whitespace-nowrap">
                {isLoadingMarts ? 'Đang tải...' : `${totalOrders.toLocaleString('vi-VN')} đơn`}
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Tỷ lệ hoàn thành đạt {completionRate}%
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Giá trị trung bình đơn (AOV)
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{aov.toLocaleString('vi-VN')}</span>
                <span className="text-xs font-medium text-slate-500">đ</span>
              </div>
              <div className="text-xs text-slate-500 font-normal mt-1 truncate">
                Bình quân {revenueDaily.length} ngày ghi nhận
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Doanh thu trung bình ngày
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{avgDayRevenue.toLocaleString('vi-VN')}</span>
                <span className="text-xs font-medium text-slate-500">đ</span>
              </div>
              <div className="text-xs text-sky-600 font-medium mt-1 truncate">
                Liên tục 100% không gián đoạn
              </div>
            </div>
          </div>

          {/* Charts Row 1: Area Trend + Channel Share */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Area Chart */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Diễn biến doanh thu theo ngày (gold.revenue_daily)
                  </h3>
                  <p className="text-[11px] text-slate-400">Đường nét liền: kỳ này; đường đứt nét: kỳ trước</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">{dailyChartData.length} mốc</span>
              </div>
              <div className="flex-1 flex items-center">
                <SmoothAreaChart data={dailyChartData} height={230} showSecondary={true} valueSuffix=" đ" />
              </div>
            </div>

            {/* Donut Chart Channel */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Cơ cấu kênh bán hàng
                  </h3>
                  <p className="text-[11px] text-slate-400">Tỷ trọng giữa bán trực tiếp và giao hàng</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Toàn chuỗi</span>
              </div>
              <div className="my-auto py-2">
                <DonutChart 
                  data={channelSlices} 
                  centerLabel="Kênh bán" 
                  centerValue="100%" 
                  size={135} 
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2: Hourly Traffic + Weekday Sales Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Hourly Traffic */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[320px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Lưu lượng đơn hàng theo khung giờ
                  </h3>
                  <p className="text-[11px] text-slate-400">Khung giờ cao điểm trưa từ 11h đến 13h</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Đơn vị: Đơn</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={hourlyData} height={220} valueSuffix="đơn" />
              </div>
            </div>

            {/* Weekday Trend */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[320px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Phân bổ sản lượng theo ngày trong tuần
                  </h3>
                  <p className="text-[11px] text-slate-400">Tăng mạnh vào cuối tuần thứ 7 và Chủ nhật</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Đơn vị: Đơn</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={weekdayData} height={220} color="#0284c7" valueSuffix="đơn" />
              </div>
            </div>
          </div>

          {/* Compact Daily Data Reference Box */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col h-[280px]">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold text-slate-800">
                Bảng số liệu đối soát doanh thu chi tiết theo ngày
              </h3>
              <span className="text-[11px] text-slate-400">Đồng bộ tự động từ gold.revenue_daily</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2">Ngày đối soát</th>
                    <th className="px-4 py-2 text-right">Số lượng đơn</th>
                    <th className="px-4 py-2 text-right">Doanh thu thuần</th>
                    <th className="px-4 py-2 text-right">AOV ước tính</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revenueDaily.map((r: any, idx: number) => {
                    const ord = Number(r.total_orders || 0);
                    const rev = Number(r.revenue || 0);
                    const dayAov = ord > 0 ? Math.round(rev / ord) : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 font-mono font-medium text-slate-800">{String(r.date).replace('/', '-')}</td>
                        <td className="px-4 py-2 text-slate-600 text-right font-semibold">{ord.toLocaleString('vi-VN')} đơn</td>
                        <td className="px-4 py-2 font-bold text-emerald-700 text-right">{rev.toLocaleString('vi-VN')} đ</td>
                        <td className="px-4 py-2 text-slate-500 text-right">{dayAov.toLocaleString('vi-VN')} đ</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. HIỆU SUẤT CỬA HÀNG */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'stores' && (
        <div className="space-y-6">
          {/* 4 Refined Store KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Tổng số điểm bán
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {storeSummary.total_stores} chi nhánh
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                {storeSummary.active_stores} đang hoạt động
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Doanh thu trung bình điểm bán
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {Number(storeSummary.avg_revenue_per_store || 0).toLocaleString('vi-VN')} đ
              </div>
              <div className="text-xs text-slate-400 font-normal truncate">
                Bình quân theo mạng lưới
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Điểm bán dẫn đầu
              </span>
              <div className="text-lg font-semibold text-slate-900 tracking-tight truncate" title={topStore.store_name}>
                {topStore.store_name}
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                {Number(topStore.total_revenue || 0).toLocaleString('vi-VN')} đ
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Giá trị đơn AOV toàn chuỗi
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {Number(topStore.aov ?? 0).toLocaleString('vi-VN')} đ
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                Trung bình toàn bộ đơn hàng
              </div>
            </div>
          </div>

          {/* Charts Row 1: Ranking Bars + Region Share Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Top Stores Horizontal Ranking Chart */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Xếp hạng doanh thu điểm bán dẫn đầu
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">So sánh doanh thu thuần các chi nhánh tiêu biểu</p>
                </div>
                <span className="text-xs font-medium text-slate-400">Top 6 chi nhánh</span>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <HorizontalBarChart data={storeRankBars} valueSuffix=" đ" />
              </div>
            </div>

            {/* Region Share Donut */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Tỷ trọng doanh thu theo tỉnh thành
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{activeCities.length} thị trường trọng điểm</p>
              </div>
              <div className="flex-1 flex items-center justify-center py-2">
                {regionSlices.length > 0 ? (
                  <DonutChart 
                    data={regionSlices} 
                    centerLabel="Tổng DT" 
                    centerValue={`${(totalCityRevenue / 1000000000).toFixed(2)}B`} 
                    size={135} 
                  />
                ) : (
                  <div className="text-xs text-slate-400 text-center py-8">Đang tải dữ liệu vùng...</div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row 2: Region Bar Comparison */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Doanh thu theo tỉnh thành
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Quy mô doanh số thực tế từ các điểm bán theo địa bàn</p>
              </div>
              <span className="text-xs font-medium text-slate-400">Đơn vị: Triệu VNĐ</span>
            </div>
            <BarChart data={regionBars} height={260} valueSuffix="Tr" />
          </div>

          {/* Store Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[400px] overflow-hidden">
            {/* Filter Toolbar */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <div className="flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => { setStoreSearch(e.target.value); setStorePage(1); }}
                  placeholder="Tìm kiếm điểm bán theo mã, tên hoặc địa chỉ..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-slate-400 transition-colors"
                />
              </div>

              <select
                value={storeCityFilter}
                onChange={(e) => { setStoreCityFilter(e.target.value); setStorePage(1); }}
                className="text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Tất cả Tỉnh Thành ({uniqueCities.length})</option>
                {uniqueCities.map((c: any) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-medium border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 w-10">#</th>
                    <th className="px-4 py-3">Mã điểm bán</th>
                    <th className="px-4 py-3">Tên chi nhánh</th>
                    <th className="px-4 py-3">Tỉnh Thành</th>
                    <th className="px-4 py-3 text-right">Doanh thu</th>
                    <th className="px-4 py-3 text-right">Số đơn</th>
                    <th className="px-4 py-3 text-right">AOV</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedStores.map((s: any, idx: number) => (
                    <tr key={s.store_code || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {(storePage - 1) * storePageSize + idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{s.store_code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-[180px]" title={s.store_name}>{s.store_name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.city}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 text-right whitespace-nowrap">
                        {Number(s.total_revenue || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {Number(s.total_orders || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right whitespace-nowrap">
                        {Number(s.aov || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {s.status || 'Hoạt động'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <button 
                  disabled={storePage <= 1}
                  onClick={() => setStorePage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200/80 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Trang trước
                </button>
                <span className="px-2 text-slate-700 font-medium">Trang {storePage} / {totalStorePages}</span>
                <button 
                  disabled={storePage >= totalStorePages}
                  onClick={() => setStorePage(p => Math.min(totalStorePages, p + 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200/80 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Trang sau
                </button>
              </div>
              <span>
                {filteredStores.length} điểm bán phù hợp
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. KHÁCH HÀNG VÀ HỘI VIÊN */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          {/* 4 Refined Customer KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Tổng đơn hàng ghi nhận
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {Number(customerKpi.total_orders || 0).toLocaleString('vi-VN')} đơn
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                Từ cả khách quen và vãng lai
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Hội viên định danh
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {customerKpi.total_registered} thành viên
              </div>
              <div className="text-xs text-slate-400 font-normal truncate">
                Đăng ký tài khoản hệ thống
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Đơn hàng mua lặp lại
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {customerKpi.repeat_orders} đơn
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                Gắn kết hội viên tích cực
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Tần suất mua trung bình
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {customerKpi.avg_frequency} lần / hội viên
              </div>
              <div className="text-xs text-slate-400 font-normal truncate">
                Chỉ số quay lại mua hàng tốt
              </div>
            </div>
          </div>

          {/* Charts Row 1: Membership Donut + Spending Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Membership Donut */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Cơ cấu 4 hạng hội viên
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Phân bố tỷ lệ theo hạng thành viên</p>
              </div>
              <div className="flex-1 flex items-center justify-center py-2">
                <DonutChart 
                  data={customerSlices} 
                  centerLabel="Hội viên" 
                  centerValue={`${totalMembers}`} 
                  size={135} 
                />
              </div>
            </div>

            {/* Spending by Tier Bar */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Chi tiêu theo hạng hội viên
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tổng chi tiêu đóng góp từ các hạng thành viên</p>
                </div>
                <span className="text-xs font-medium text-slate-400">Đơn vị: Tr đ</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={tierSpendingBars} height={260} valueSuffix="Tr" />
              </div>
            </div>
          </div>

          {/* Charts Row 2: Top Spenders Horizontal Bar + Payment Method Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Top Customer Spenders Ranking Bar */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Top khách hàng chi tiêu cao nhất
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Xếp hạng giá trị đóng góp từ lịch sử hóa đơn</p>
                </div>
                <span className="text-xs font-medium text-slate-400">{topCustomers.length} khách hàng</span>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <HorizontalBarChart data={topCustomerRankBars} valueSuffix=" đ" />
              </div>
            </div>

            {/* Payment Method Donut */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Phương thức thanh toán
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Tỷ trọng giữa các kênh thanh toán</p>
              </div>
              <div className="flex-1 flex items-center justify-center py-2">
                <DonutChart 
                  data={paymentSlices} 
                  centerLabel="Kênh trả" 
                  centerValue="QR dẫn đầu" 
                  size={175} 
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 4. SẢN PHẨM VÀ THỰC ĐƠN */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* 4 Refined Product KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Tổng danh mục thực đơn
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {productKpi.total_products} món
              </div>
              <div className="text-xs text-slate-400 font-normal truncate">
                Lưu trữ trong menu.san_pham
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Sản phẩm chủ lực
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {productKpi.best_sellers} món
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                Đóng góp phần lớn doanh số
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Tổng doanh số sản phẩm
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {Number(productKpi.total_revenue || 5238080000).toLocaleString('vi-VN')} đ
              </div>
              <div className="text-xs text-emerald-600 font-medium truncate">
                Ghi nhận từ chi tiết đơn hàng
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
              <span className="text-xs font-medium text-slate-500">
                Tổng sản lượng tiêu thụ
              </span>
              <div className="text-2xl font-semibold text-slate-900 tracking-tight">
                {Number(productKpi.total_sold || 0).toLocaleString('vi-VN')} ly
              </div>
              <div className="text-xs text-slate-400 font-normal truncate">
                Đã phục vụ toàn chuỗi
              </div>
            </div>
          </div>

          {/* Charts Row 1: Best Sellers Ranking Bar + Category Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Best Sellers Ranking Bar Chart */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Sản phẩm bán chạy nhất toàn chuỗi
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">So sánh doanh số thực tế giữa các món</p>
                </div>
                <span className="text-xs font-medium text-slate-400">Top 7 món</span>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <HorizontalBarChart data={productRankBars} valueSuffix=" đ" />
              </div>
            </div>

            {/* Category Donut */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Cơ cấu theo nhóm món
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tỷ trọng doanh thu theo danh mục</p>
                </div>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-medium">
                  <button
                    onClick={() => setProductCategoryView('parent')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      productCategoryView === 'parent' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Nhóm lớn
                  </button>
                  <button
                    onClick={() => setProductCategoryView('sub')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      productCategoryView === 'sub' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Chi tiết
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center py-2">
                <DonutChart 
                  data={categorySlices} 
                  centerLabel="Danh mục" 
                  centerValue={`${activeCategoryList.length} nhóm`} 
                  size={135} 
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2: Category Revenue Comparison Bar + Quantity Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Category Revenue Bar */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[340px]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Doanh thu theo nhóm danh mục
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cà phê và trà đóng vai trò chủ lực</p>
                </div>
                <span className="text-xs font-medium text-slate-400">Triệu VNĐ</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={categoryBars} height={240} valueSuffix="Tr" />
              </div>
            </div>

            {/* Category Quantity Bar */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[340px]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Sản lượng tiêu thụ theo nhóm
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tổng số ly phục vụ theo danh mục</p>
                </div>
                <span className="text-xs font-medium text-slate-400">Nghìn ly</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={categoryQtyBars} height={240} color="#0284c7" />
              </div>
            </div>
          </div>

          {/* Product Detail Reference Container */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[380px] overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex-1 max-w-sm">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Tìm kiếm sản phẩm theo tên hoặc danh mục..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-slate-400 transition-colors"
                />
              </div>
              <span className="text-xs text-slate-400">
                {filteredProducts.length} sản phẩm
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 w-10">#</th>
                    <th className="px-4 py-3">Tên món</th>
                    <th className="px-4 py-3">Nhóm thực đơn</th>
                    <th className="px-4 py-3 text-right">Doanh số</th>
                    <th className="px-4 py-3 text-right">Số lượng bán</th>
                    <th className="px-4 py-3 text-right">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p: any, idx: number) => {
                    const rev = Number(p.total_revenue || 0);
                    const qty = Number(p.total_sold || p.total_quantity || 0);
                    const share = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : '0';
                    return (
                      <tr key={p.product_id || p.ma_san_pham || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-[180px]" title={p.product_name || p.ten_san_pham}>
                          {p.product_name || p.ten_san_pham || p.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.category_name || 'Cà phê'}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 text-right whitespace-nowrap">
                          {rev > 0 ? `${rev.toLocaleString('vi-VN')} đ` : 'Chưa bán'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-right whitespace-nowrap">
                          {qty.toLocaleString('vi-VN')} ly
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium text-right">
                          {share}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 5. TRỢ LÝ AI PHÂN TÍCH & KHỞI TẠO MODULE */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'ai_assistant' && (
        <div className="space-y-6">
          {/* 3-Step Stepper in Apple Segmented Style */}
          <div className="bg-slate-200/60 rounded-2xl p-1.5 border border-slate-200/90 shadow-2xs">
            <div className="grid grid-cols-3 gap-1.5 items-center">
              {/* Step 1 */}
              <button
                onClick={() => setAiStep(1)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all cursor-pointer text-left ${
                  aiStep === 1
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-medium text-xs flex-shrink-0 ${
                    aiStep === 1
                      ? 'bg-slate-900 text-white'
                      : (aiPlan || generatedReport)
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  1
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    Đặt câu hỏi
                  </div>
                  <div className="text-[10px] text-slate-400 truncate hidden sm:block">
                    Soạn câu hỏi & gợi ý
                  </div>
                </div>
              </button>

              {/* Step 2 */}
              <button
                onClick={() => (aiPlan || isProposingPlan) && setAiStep(2)}
                disabled={!aiPlan && !isProposingPlan}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-left ${
                  aiStep === 2
                    ? 'bg-white text-slate-900 shadow-xs cursor-pointer'
                    : aiPlan
                      ? 'text-slate-500 hover:text-slate-900 hover:bg-white/50 cursor-pointer'
                      : 'opacity-40 cursor-not-allowed text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-medium text-xs flex-shrink-0 ${
                    aiStep === 2
                      ? 'bg-slate-900 text-white'
                      : generatedReport
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  2
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    Duyệt kế hoạch
                  </div>
                  <div className="text-[10px] text-slate-400 truncate hidden sm:block">
                    Cấu trúc & biểu đồ
                  </div>
                </div>
              </button>

              {/* Step 3 */}
              <button
                onClick={() => (generatedReport || isGeneratingAi) && setAiStep(3)}
                disabled={!generatedReport && !isGeneratingAi}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-left ${
                  aiStep === 3
                    ? 'bg-white text-slate-900 shadow-xs cursor-pointer'
                    : generatedReport
                      ? 'text-slate-500 hover:text-slate-900 hover:bg-white/50 cursor-pointer'
                      : 'opacity-40 cursor-not-allowed text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-medium text-xs flex-shrink-0 ${
                    aiStep === 3
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  3
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    Báo cáo & Xuất Word
                  </div>
                  <div className="text-[10px] text-slate-400 truncate hidden sm:block">
                    Bản trực quan & tải về
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* ──────────────────────────────────────────────────────────── */}
          {/* ── BƯỚC 1: ĐẶT CÂU HỎI & CHỌN GỢI Ý PHÂN TÍCH ── */}
          {/* ──────────────────────────────────────────────────────────── */}
          {aiStep === 1 && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                      Trợ lý AI Phân tích Dữ liệu
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Truy vấn ngôn ngữ tự nhiên và tự động lập kế hoạch báo cáo chuyên sâu
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-500 self-start sm:self-auto">
                    <span className={`w-2 h-2 rounded-full ${generatedReport?.status === 'error' ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                    <span className="text-[11px] font-medium">{generatedReport?.status === 'error' ? 'Phân tích đang gặp lỗi' : 'Sẵn sàng nhận câu hỏi'}</span>
                  </div>
                </div>

                {/* Quick Prompt Suggestions */}
                <div className="mb-5">
                  <div className="text-xs font-medium text-slate-500 mb-2.5">
                    Gợi ý phân tích nhanh:
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {aiPromptTemplates.map((tpl, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setAiPrompt(tpl.prompt);
                          handleProposePlan(tpl.prompt);
                        }}
                        disabled={isProposingPlan || isGeneratingAi}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer text-slate-700 disabled:opacity-50"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Smart Omnibox Chat Input */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 focus-within:bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200/60 transition-all">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!isProposingPlan && !isGeneratingAi && aiPrompt.trim()) {
                          handleProposePlan();
                        }
                      }
                    }}
                    placeholder="Nhập câu hỏi phân tích (ví dụ: Đánh giá tăng trưởng doanh thu theo khu vực, hoặc Top 5 món bán chạy nhất)..."
                    rows={3}
                    className="w-full text-xs sm:text-sm bg-transparent outline-none text-slate-800 font-normal resize-none placeholder-slate-400 leading-relaxed"
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-200/60 mt-3">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs text-slate-600 shadow-2xs">
                        <span className="text-[11px] text-slate-400 mr-2 font-medium">Thời gian:</span>
                        <select
                          value={aiTimeRange}
                          onChange={(e) => setAiTimeRange(e.target.value)}
                          className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
                        >
                          <option value="auto">Tự động nhận diện</option>
                          <option value="today">Hôm nay</option>
                          <option value="7d">7 ngày qua</option>
                          <option value="30d">30 ngày qua</option>
                        </select>
                      </div>

                      <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs text-slate-600 shadow-2xs">
                        <span className="text-[11px] text-slate-400 mr-2 font-medium">Phạm vi:</span>
                        <select
                          value={aiDomain}
                          onChange={(e) => setAiDomain(e.target.value)}
                          className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
                        >
                          <option value="auto">Toàn hệ thống (Silver)</option>
                          <option value="products">Sản phẩm & Thực đơn</option>
                          <option value="orders">Doanh thu & Đơn hàng</option>
                          <option value="stores">Chi nhánh cửa hàng</option>
                          <option value="customers">Khách hàng & Hội viên</option>
                          <option value="payments">Giao dịch thanh toán</option>
                          <option value="delivery">Tài xế giao hàng</option>
                        </select>
                      </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center space-x-2.5 self-end sm:self-auto">
                      {aiPrompt && (
                        <button
                          onClick={() => {
                            setAiPrompt('');
                            setAiPlan(null);
                          }}
                          className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-xl transition-colors cursor-pointer"
                        >
                          Xóa
                        </button>
                      )}
                      <button
                        onClick={() => handleExecuteAiReport()}
                        disabled={isGeneratingAi || isProposingPlan || !aiPrompt.trim()}
                        className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                      >
                        Phân tích ngay
                      </button>
                      <button
                        onClick={() => handleProposePlan()}
                        disabled={isProposingPlan || isGeneratingAi || !aiPrompt.trim()}
                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Lập kế hoạch phân tích
                      </button>
                    </div>
                  </div>
                </div>

                {/* Recent Questions Pill Bar */}
                {chatHistory.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center space-x-2 overflow-x-auto text-xs pb-1">
                    <span className="text-slate-400 flex items-center flex-shrink-0 text-[11px] font-medium">
                      Lịch sử phân tích:
                    </span>
                    {chatHistory.map((h, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setGeneratedReport(h.report);
                          setAiPrompt(h.prompt);
                          setAiStep(3);
                        }}
                        className="px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer flex-shrink-0 border bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                      >
                        {h.prompt.length > 32 ? `${h.prompt.slice(0, 30)}...` : h.prompt}
                        <span className="ml-1 text-[10px] text-slate-400">({h.time})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <AnalystReportReady report={generatedReport} onOpen={() => setAiStep(3)} />
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* ── BƯỚC 2: DUYỆT KẾ HOẠCH BÁO CÁO AI ĐỀ XUẤT ── */}
          {/* ──────────────────────────────────────────────────────────── */}
          {aiStep === 2 && (
            <div className="space-y-6">
              {/* Question Summary Banner */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-900">
                    Câu hỏi: <span className="text-slate-600 font-normal italic">"{aiPlan?.prompt || aiPrompt || 'Chưa có câu hỏi'}"</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                    <span>Phạm vi: {aiDomain}</span>
                    <span>•</span>
                    <span>Thời gian: {aiTimeRange}</span>
                    <span>•</span>
                    <span>Nguồn: Tầng Silver</span>
                  </div>
                </div>
                <button
                  onClick={() => setAiStep(1)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
                >
                  Sửa câu hỏi
                </button>
              </div>

              {/* Loading State for Plan Proposal */}
              {isProposingPlan && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                  <div className="w-6 h-6 rounded-full border-2 border-slate-900 border-t-transparent animate-spin mx-auto mb-3"></div>
                  <h4 className="text-sm font-semibold text-slate-800">Đang khảo sát dữ liệu & lập kế hoạch báo cáo...</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Đối chiếu schema tầng Silver Lake, xác định các KPI trọng tâm và gợi ý các loại biểu đồ trực quan phù hợp.
                  </p>
                </div>
              )}

              {/* Empty state if user jumped to step 2 with no plan */}
              {!isProposingPlan && !aiPlan && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                  <h4 className="text-sm font-semibold text-slate-800">Chưa có kế hoạch phân tích</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Vui lòng quay lại Bước 1 để nhập câu hỏi phân tích.
                  </p>
                  <button
                    onClick={() => setAiStep(1)}
                    className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs cursor-pointer"
                  >
                    Quay lại Bước 1
                  </button>
                </div>
              )}

              {/* Proposal Content Card */}
              {!isProposingPlan && aiPlan && <AnalysisMeaning interpretation={aiPlan.interpretation} />}
              {!isProposingPlan && aiPlan && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <span className="text-xs font-semibold text-slate-900">
                        Kế hoạch phân tích đề xuất
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Kiểm tra các thành phần trước khi thực thi
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      Nguồn: Tầng Silver Lake
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900 leading-snug">
                      {aiPlan.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {aiPlan.summary_intent}
                    </p>
                  </div>

                  <AnalystEvidence report={{ analysis_explanation: aiPlan.analysis_explanation || [] }} />

                  {/* 3 Pillars Grid: Data Sources, KPIs, Visual Charts */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* 1. Data Sources */}
                    <div className="bg-slate-50/60 rounded-xl border border-slate-200/70 p-4">
                      <div className="text-xs font-semibold text-slate-800 mb-2.5">
                        Nguồn dữ liệu Silver
                      </div>
                      <div className="space-y-2">
                        {(aiPlan.data_sources || []).map((src: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-100 text-xs">
                            <div className="font-mono font-medium text-slate-800 text-[11px] truncate">
                              {src.name || src.table}
                            </div>
                            <div className="text-slate-600 text-[11px] mt-0.5">
                              {src.reason || src.description}
                            </div>
                            {src.filter && (
                              <div className="text-[10px] text-slate-400 mt-1">
                                Lọc: {src.filter}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Planned KPIs */}
                    <div className="bg-slate-50/60 rounded-xl border border-slate-200/70 p-4">
                      <div className="text-xs font-semibold text-slate-800 mb-2.5">
                        Chỉ số KPI dự kiến
                      </div>
                      <div className="space-y-2">
                        {(aiPlan.planned_kpis || []).map((kpi: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-100 text-xs">
                            <div className="font-medium text-slate-800 text-[11px]">
                              {kpi.name}
                            </div>
                            <div className="text-slate-600 text-[11px] mt-0.5">
                              {kpi.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. Planned Charts */}
                    <div className="bg-slate-50/60 rounded-xl border border-slate-200/70 p-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-2.5">
                        <span>Biểu đồ trực quan</span>
                        <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200/60 px-2 py-0.5 rounded-full font-medium">
                          {(aiPlan.planned_charts || []).length} phần trực quan dự kiến
                        </span>
                      </div>
                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {(aiPlan.planned_charts || []).map((ch: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-100 text-xs shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-800 text-[11px]">{ch.title}</span>
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                                {ch.chart_type === 'horizontal_bar'
                                  ? 'Cột ngang'
                                  : ch.chart_type === 'donut'
                                    ? 'Cơ cấu tròn'
                                    : ch.chart_type === 'bar'
                                      ? 'Cột dọc'
                                      : ch.chart_type === 'heatmap'
                                        ? 'Heatmap 2D'
                                        : ch.chart_type === 'multi_line' || ch.chart_type === 'multiline'
                                          ? 'Đa đường'
                                          : 'Miền / Xu hướng'}
                              </span>
                            </div>
                            <div className="text-slate-600 text-[11px] mt-0.5">
                              {ch.reason || ch.purpose}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 6 Structured Sections Preview */}
                  <div className="bg-slate-50/60 rounded-xl border border-slate-200/70 p-4">
                    <div className="text-xs font-semibold text-slate-700 mb-2.5">
                      Bố cục báo cáo
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-700">
                      {(aiPlan.report_sections || [
                        '1. Tóm tắt điều hành',
                        '2. Biểu đồ phù hợp với dữ liệu đã kiểm chứng',
                        '3. Bảng các phát hiện chính',
                        '4. Bảng phân tích dữ liệu chi tiết',
                        '5. Nhận định chuyên sâu từ AI',
                        '6. Kết luận & khuyến nghị',
                      ]).map((sec: string, sIdx: number) => (
                        <div
                          key={sIdx}
                          className="flex items-center space-x-2 text-[11px] bg-white px-3 py-2 rounded-lg border border-slate-100 truncate"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          <span className="truncate">{sec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setAiStep(1)}
                      className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl transition-colors cursor-pointer"
                    >
                      Chỉnh sửa câu hỏi
                    </button>

                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => {
                          setAiPlan(null);
                          setAiStep(1);
                        }}
                        className="px-3.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        Hủy bỏ
                      </button>
                      <button
                        onClick={() => handleExecuteAiReport(aiPlan.prompt)}
                        disabled={isGeneratingAi}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium shadow-xs transition-all cursor-pointer"
                      >
                        Xác nhận & Bắt đầu Phân tích
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────── */}
          {/* ── BƯỚC 3: BẢN XEM TRỰC QUAN & XUẤT BÁO CÁO WORD (.DOCX) ── */}
          {/* ──────────────────────────────────────────────────────────── */}
          {aiStep === 3 && (
            <div className="space-y-6">
              {/* Loading State for Full Analysis */}
              {isGeneratingAi && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                  <div className="w-12 h-12 rounded-full border-3 border-emerald-600 border-t-transparent animate-spin mx-auto mb-4"></div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Trí tuệ nhân tạo đang phân tích & xây dựng báo cáo...
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Đang thực thi các truy vấn SQL tầng Silver, trích xuất KPI, tính toán trực quan và tổng hợp nhận định chuyên sâu
                  </p>
                </div>
              )}

              {!isGeneratingAi && ['needs_clarification', 'error'].includes(generatedReport?.status) && (
                <AnalysisClarification response={generatedReport}
                  onChoice={(answer) => handleProposePlan(`${aiPrompt}. ${answer}`)}
                  onEdit={() => setAiStep(1)} />
              )}

              {/* Empty state if user jumped to step 3 with no report */}
              {!isGeneratingAi && !generatedReport && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                  <h4 className="text-sm font-semibold text-slate-800">Chưa có báo cáo nào</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Vui lòng quay lại Bước 1 để đặt câu hỏi phân tích.
                  </p>
                  <button
                    onClick={() => setAiStep(1)}
                    className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs cursor-pointer inline-flex items-center"
                  >
                    Quay lại Bước 1
                  </button>
                </div>
              )}

              {/* Ready Visual Report */}
              {!isGeneratingAi && generatedReport?.status === 'success' && (
                renderVisualReportBlock(generatedReport, false)
              )}
        </div>
      )}
    </div>
  )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 6. QUẢN LÝ BÁO CÁO & LƯU TRỮ TÀI LIỆU (DOCX ARCHIVE) */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'saved_reports' && (
        <div className="space-y-6">
          {viewingSavedReport ? (
            renderVisualReportBlock(viewingSavedReport, true)
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    Quản lý Báo cáo
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kho lưu trữ và tải xuống các báo cáo phân tích đã xuất bản
                  </p>
                </div>

                <div className="flex items-center space-x-2.5">
                  <button
                    onClick={fetchSavedReports}
                    disabled={isLoadingSavedReports}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    Làm mới
                  </button>
                  <button
                    onClick={() => {
                      setViewingSavedReport(null);
                      setStoreActiveTab('ai_assistant');
                      setActiveTab('ai_assistant');
                      setAnalyticsSubTab('ai_assistant');
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Tạo báo cáo mới
                  </button>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Tìm kiếm theo tiêu đề hoặc nội dung báo cáo..."
                    value={savedReportsSearch}
                    onChange={(e) => setSavedReportsSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchSavedReports()}
                    className="text-xs px-3.5 py-2 bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-slate-400 focus:bg-white text-slate-700 w-full font-normal"
                  />
                </div>

                <div className="flex items-center space-x-2.5">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-600">
                    <select
                      value={savedReportsCategory}
                      onChange={(e) => {
                        setSavedReportsCategory(e.target.value);
                      }}
                      className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">Tất cả danh mục</option>
                      <option value="ai_report">Báo cáo Word (.docx)</option>
                      <option value="ai_module">Module phân tích</option>
                      <option value="sales">Doanh thu & Bán hàng</option>
                      <option value="stores">Chi nhánh cửa hàng</option>
                    </select>
                  </div>

                  <button
                    onClick={fetchSavedReports}
                    className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    Lọc
                  </button>
                </div>
              </div>

              {/* Reports Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                {isLoadingSavedReports ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    <div className="w-6 h-6 rounded-full border-2 border-slate-900 border-t-transparent animate-spin mx-auto mb-2"></div>
                    Đang tải danh sách báo cáo...
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                    <div className="font-semibold text-slate-700 text-sm">Chưa có báo cáo nào trong kho lưu trữ</div>
                    <p className="max-w-md mx-auto text-slate-400">
                      Hãy sang tab <span className="text-slate-900 font-medium underline cursor-pointer" onClick={() => { setStoreActiveTab('ai_assistant'); setActiveTab('ai_assistant'); setAnalyticsSubTab('ai_assistant'); }}>Trợ lý AI</span> để đặt câu hỏi, xem trước trực quan và xuất file Word (.docx).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                          <th className="px-5 py-3 w-2/5">Tên báo cáo & Thời gian</th>
                          <th className="px-4 py-3 w-1/3">Tóm tắt điều hành</th>
                          <th className="px-4 py-3 w-24 text-center whitespace-nowrap">Định dạng</th>
                          <th className="px-5 py-3 text-right whitespace-nowrap">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {savedReports.map((report: any) => (
                          <tr key={report.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                                {report.title}
                              </div>
                              {report.description && (
                                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                                  {report.description}
                                </div>
                              )}
                              <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1">
                                <span>{report.created_at}</span>
                                <span>•</span>
                                <span>{report.created_by || 'Trợ lý AI Data Platform'}</span>
                              </div>
                            </td>

                            <td className="px-4 py-3.5">
                              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                {report.ai_summary || report.description || 'Báo cáo phân tích chuyên sâu tự động sinh bởi AI.'}
                              </p>
                            </td>

                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/70 font-mono tracking-wide uppercase">
                                DOCX
                              </span>
                            </td>

                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
                                <button
                                  onClick={() => handleOpenDocxPreview(report.module_config || report)}
                                  title="Xem trước nội dung văn bản Word"
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  Xem trước
                                </button>

                                {report.module_config && (
                                  <button
                                    onClick={() => handleLoadSavedReportToView(report)}
                                    title="Mở bản phân tích trực quan toàn diện"
                                    className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    Trực quan
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDownloadSavedDocx(report.id, report.title)}
                                  title="Tải tệp Word (.docx) về máy"
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  Tải Word
                                </button>

                                <button
                                  onClick={() => handleDeleteSavedReport(report.id, report.title)}
                                  title="Xóa báo cáo khỏi kho lưu trữ"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer inline-flex items-center"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Word Document Interactive Preview Modal */}
      <WordReportPreviewModal
        isOpen={showDocxPreview}
        onClose={() => setShowDocxPreview(false)}
        reportData={previewReportData || generatedReport}
        onExportDocx={(rep) => handleExportDocx(rep)}
        isExporting={isExportingDocx}
      />
    </div>
  );
};
