import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Edit3,
  X,
  Eye,
  Star,
  MessageSquare,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  User,
  Calendar,
  Tag,
  HelpCircle,
  Filter,
  Layers,
  FileText,
  CheckSquare,
  Check
} from 'lucide-react';

function CustomQuestionTypeDropdown({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const options = [
    { value: 'text', label: 'Văn bản ngắn', icon: '✍️' },
    { value: 'paragraph', label: 'Đoạn văn dài', icon: '📄' },
    { value: 'rating', label: 'Đánh giá sao (1-5)', icon: '⭐' },
    { value: 'choice', label: 'Trắc nghiệm (Chọn 1)', icon: '🔘' },
    { value: 'checkbox', label: 'Hộp kiểm (Chọn nhiều)', icon: '☑️' },
    { value: 'dropdown', label: 'Menu thả xuống', icon: '🔽' },
    { value: 'date', label: 'Chọn Ngày', icon: '📅' },
    { value: 'time', label: 'Chọn Giờ', icon: '⏰' }
  ];

  const selectedOpt = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '220px' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '0.45rem 0.75rem',
          borderRadius: '10px',
          border: isOpen ? '2px solid #4f46e5' : '1px solid #cbd5e1',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontWeight: '700',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          gap: '0.5rem',
          boxShadow: isOpen ? '0 4px 14px rgba(79, 70, 229, 0.2)' : '0 1px 2px rgba(0,0,0,0.02)',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{selectedOpt.icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedOpt.label}</span>
        </div>
        <ChevronDown size={16} color={isOpen ? '#4f46e5' : '#64748b'} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.2)',
            padding: '0.35rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem'
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? '#e0e7ff' : 'transparent',
                  color: isSelected ? '#4f46e5' : '#334155',
                  fontWeight: isSelected ? '700' : '600',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <span style={{ fontSize: '1rem' }}>{opt.icon}</span>
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check size={16} color="#4f46e5" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ManagerSurveyPanel({
  surveysState = { items: [], loading: false },
  surveyResponsesState = { items: [], loading: false },
  onKichHoatForm,
  onTaoForm,
  onSuaForm,
  onXoaForm,
  onTaiForms,
  onTaiResponses,
}) {
  const [activeSubTab, setActiveSubTab] = useState('forms'); // 'forms' | 'responses' | 'analytics'
  const [isEditing, setIsEditing] = useState(false);
  const [editingFormId, setEditingFormId] = useState(null); // null = create new
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [questions, setQuestions] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedResponse, setSelectedResponse] = useState(null);

  // Pagination for responses tab (10 items per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Selected form for analytics tab
  const [selectedAnalyticsFormId, setSelectedAnalyticsFormId] = useState('ALL');

  const startCreateNew = () => {
    setFormTitle('');
    setFormDesc('');
    setQuestions([
      { id: 'q_' + Date.now(), tieu_de: 'Bạn đánh giá thế nào về chất lượng đồ uống?', loai: 'rating', bat_buoc: true },
      { id: 'q_' + (Date.now() + 1), tieu_de: 'Bạn chọn chi nhánh nào để đặt hàng hôm nay?', loai: 'choice', bat_buoc: true, lua_chon: ['Cửa hàng chính', 'Chi nhánh 1', 'Chi nhánh 2'] },
      { id: 'q_' + (Date.now() + 2), tieu_de: 'Ý kiến đóng góp khác của bạn:', loai: 'paragraph', bat_buoc: false }
    ]);
    setEditingFormId(null);
    setIsEditing(true);
  };

  const startEdit = (form) => {
    setFormTitle(form.tieu_de || '');
    setFormDesc(form.mo_ta || '');
    setQuestions(form.cau_hoi || []);
    setEditingFormId(form.id);
    setIsEditing(true);
  };

  const handleAddQuestion = () => {
    const newQ = {
      id: 'q_' + Date.now() + Math.random().toString(36).substring(2, 5),
      tieu_de: 'Câu hỏi mới',
      loai: 'text',
      bat_buoc: false,
      lua_chon: ['Lựa chọn A', 'Lựa chọn B']
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemoveQuestion = (id) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleQuestionChange = (id, field, val) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === id) {
          return { ...q, [field]: val };
        }
        return q;
      })
    );
  };

  const handleOptionChange = (qId, optIndex, newVal) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === qId) {
          const newOpts = [...(q.lua_chon || [])];
          newOpts[optIndex] = newVal;
          return { ...q, lua_chon: newOpts };
        }
        return q;
      })
    );
  };

  const handleAddOption = (qId) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === qId) {
          const newOpts = [...(q.lua_chon || []), `Lựa chọn ${((q.lua_chon || []).length + 1)}`];
          return { ...q, lua_chon: newOpts };
        }
        return q;
      })
    );
  };

  const handleRemoveOption = (qId, optIndex) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === qId) {
          const newOpts = (q.lua_chon || []).filter((_, i) => i !== optIndex);
          return { ...q, lua_chon: newOpts };
        }
        return q;
      })
    );
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Vui lòng nhập tiêu đề biểu mẫu khảo sát!');
      return;
    }
    if (questions.length === 0) {
      alert('Biểu mẫu khảo sát phải chứa ít nhất 1 câu hỏi!');
      return;
    }

    const payload = {
      tieu_de: formTitle.trim(),
      mo_ta: formDesc.trim() || undefined,
      cau_hoi: questions.map((q) => ({
        id: q.id,
        tieu_de: q.tieu_de.trim(),
        loai: q.loai,
        bat_buoc: !!q.bat_buoc,
        lua_chon: ['choice', 'checkbox', 'dropdown'].includes(q.loai) ? (q.lua_chon || []).map((o) => o.trim()).filter(Boolean) : undefined,
      })),
    };

    let res;
    if (editingFormId) {
      res = await onSuaForm(editingFormId, payload);
    } else {
      res = await onTaoForm(payload);
    }

    if (res?.ok) {
      setIsEditing(false);
      setEditingFormId(null);
    }
  };

  // Compute responses analytics
  const allResponses = surveyResponsesState?.items || [];
  const totalResponses = allResponses.length;

  const ratingAnswers = [];
  allResponses.forEach((resp) => {
    (resp.tra_loi || []).forEach((ans) => {
      if (typeof ans.cau_tra_loi === 'number') {
        ratingAnswers.push(ans.cau_tra_loi);
      }
    });
  });

  const avgRating =
    ratingAnswers.length > 0
      ? (ratingAnswers.reduce((sum, val) => sum + val, 0) / ratingAnswers.length).toFixed(1)
      : 'N/A';

  // Filter responses by search text
  const filteredResponses = allResponses.filter((resp) => {
    if (!searchText.trim()) return true;
    const cleanSearch = searchText.toLowerCase();
    const nameMatch = String(resp.ten_nguoi_dung || '').toLowerCase().includes(cleanSearch);
    const phoneMatch = String(resp.so_dien_thoai || '').toLowerCase().includes(cleanSearch);
    const orderMatch = String(resp.ma_don_hang || '').toLowerCase().includes(cleanSearch);
    const answerMatch = (resp.tra_loi || []).some((ans) =>
      String(ans.cau_tra_loi || '').toLowerCase().includes(cleanSearch)
    );
    return nameMatch || phoneMatch || orderMatch || answerMatch;
  });

  // Pagination calculation
  const totalPages = Math.ceil(filteredResponses.length / pageSize) || 1;
  const paginatedResponses = filteredResponses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Cascade delete survey form and all associated responses
  const handleDeleteForm = async (form) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bài khảo sát "${form.tieu_de}"? Thao tác này cũng sẽ XÓA TOÀN BỘ tất cả các phản hồi đã thu thập từ bài khảo sát này!`)) {
      return;
    }

    if (onXoaForm) {
      await onXoaForm(form.id);
    }

    if (surveyResponsesState?.items) {
      const updatedResponses = surveyResponsesState.items.filter(
        (resp) => resp.form_id !== form.id && resp.survey_id !== form.id && resp.ten_form !== form.tieu_de
      );
      surveyResponsesState.items = updatedResponses;
    }

    if (selectedResponse && (selectedResponse.form_id === form.id || selectedResponse.ten_form === form.tieu_de)) {
      setSelectedResponse(null);
    }
  };

  // CSV Export Function - Each Question is a Dedicated Column
  const exportResponsesToCSV = () => {
    if (!filteredResponses || filteredResponses.length === 0) {
      alert('Không có dữ liệu phản hồi khảo sát để xuất CSV!');
      return;
    }

    // Collect all distinct question titles across responses
    const questionTitlesSet = new Set();
    filteredResponses.forEach((resp) => {
      (resp.tra_loi || []).forEach((ans) => {
        if (ans.cau_hoi_tieu_de) {
          questionTitlesSet.add(ans.cau_hoi_tieu_de);
        }
      });
    });

    const questionTitles = Array.from(questionTitlesSet);

    // Build headers: Base info + 1 column per question
    const baseHeaders = ['STT', 'Mã Phản Hồi', 'Họ Tên Khách Hàng', 'Số Điện Thoại', 'Mã Đơn Hàng', 'Ngày Nộp', 'Tên Khảo Sát'];
    const headers = [...baseHeaders, ...questionTitles.map((qTitle) => `"[Câu hỏi] ${qTitle.replace(/"/g, '""')}"`)];

    // Build data rows
    const rows = filteredResponses.map((resp, index) => {
      const baseRow = [
        index + 1,
        `"${resp.id || ''}"`,
        `"${(resp.ten_nguoi_dung || 'Khách vãng lai').replace(/"/g, '""')}"`,
        `"${(resp.so_dien_thoai || '').replace(/"/g, '""')}"`,
        `"${(resp.ma_don_hang || '').replace(/"/g, '""')}"`,
        `"${resp.ngay_tao ? new Date(resp.ngay_tao).toLocaleString('vi-VN') : ''}"`,
        `"${(resp.ten_form || 'Khảo sát trải nghiệm').replace(/"/g, '""')}"`
      ];

      const answerCols = questionTitles.map((qTitle) => {
        const foundAns = (resp.tra_loi || []).find((a) => a.cau_hoi_tieu_de === qTitle);
        if (!foundAns || foundAns.cau_tra_loi === undefined || foundAns.cau_tra_loi === null) {
          return '""';
        }
        const rawVal = foundAns.cau_tra_loi;
        let formattedVal = '';
        if (typeof rawVal === 'number') {
          formattedVal = `${rawVal}/5 sao`;
        } else if (Array.isArray(rawVal)) {
          formattedVal = rawVal.join('; ');
        } else {
          formattedVal = String(rawVal);
        }
        return `"${formattedVal.replace(/"/g, '""')}"`;
      });

      return [...baseRow, ...answerCols];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `khao_sat_phan_hoi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate Google Forms style question analytics
  const activeForms = surveysState?.items || [];
  const selectedForm = activeForms.find(f => String(f.id) === String(selectedAnalyticsFormId)) || activeForms[0];
  const targetQuestions = selectedForm?.cau_hoi || [];

  return (
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* PANEL HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={22} color="#4f46e5" /> Quản Lý Khảo Sát &amp; Đánh Giá
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Thiết kế biểu mẫu khảo sát, xem phản hồi dạng bảng phân trang và phân tích thống kê kiểu Google Forms
          </p>
        </div>

        {/* PILL SUBTABS NAVIGATION */}
        <div style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', padding: '0.35rem', borderRadius: '12px', border: '1px solid #e2e8f0', gap: '0.35rem' }}>
          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'forms' ? 'is-active' : ''}`}
            onClick={() => { setActiveSubTab('forms'); setIsEditing(false); }}
          >
            <FileText size={17} color={activeSubTab === 'forms' ? '#ffffff' : '#475569'} />
            <span>Biểu mẫu khảo sát ({surveysState.items.length})</span>
          </button>

          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'responses' ? 'is-active' : ''}`}
            onClick={() => { setActiveSubTab('responses'); setIsEditing(false); }}
          >
            <MessageSquare size={17} color={activeSubTab === 'responses' ? '#ffffff' : '#475569'} />
            <span>Bảng phản hồi ({totalResponses})</span>
          </button>

          <button
            type="button"
            className={`admin-subtab-btn ${activeSubTab === 'analytics' ? 'is-active' : ''}`}
            onClick={() => { setActiveSubTab('analytics'); setIsEditing(false); }}
          >
            <BarChart3 size={17} color={activeSubTab === 'analytics' ? '#ffffff' : '#475569'} />
            <span>Thống kê chi tiết</span>
          </button>
        </div>
      </div>

      {/* SUBTAB 1: FORMS DESIGNER */}
      {activeSubTab === 'forms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isEditing ? (
            /* FORM EDITOR STUDIO */
            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="system-admin-card" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '1.1rem 1.5rem', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: editingFormId ? '#eff6ff' : '#ecfdf5', color: editingFormId ? '#2563eb' : '#059669', border: editingFormId ? '1px solid #bfdbfe' : '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {editingFormId ? <Edit3 size={20} /> : <Plus size={20} />}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                        {editingFormId ? 'Chỉnh sửa biểu mẫu khảo sát' : 'Thiết kế biểu mẫu khảo sát mới'}
                      </h3>
                      <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>Nhập thông tin chung và cấu hình nội dung câu hỏi</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    style={{ padding: '0.4rem', borderRadius: '50%', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={18} color="#64748b" />
                  </button>
                </div>

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                        Tiêu đề khảo sát <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                        <Tag size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <input
                          type="text"
                          style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="VD: Khảo sát chất lượng phục vụ & đồ uống"
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                        Mô tả ngắn / Quyền lợi tham gia
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', minHeight: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0.4rem 0.85rem', gap: '0.65rem' }}>
                        <FileText size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <input
                          type="text"
                          style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                          value={formDesc}
                          onChange={(e) => setFormDesc(e.target.value)}
                          placeholder="VD: Hoàn thành khảo sát nhận ngay Voucher 20% giảm giá"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* QUESTIONS LIST DESIGNER */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={18} color="#4f46e5" /> Danh sách câu hỏi ({questions.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.45rem 1.1rem',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
                    }}
                  >
                    <Plus size={16} color="#ffffff" /> Thêm câu hỏi
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {questions.map((q, qIndex) => (
                    <div
                      key={q.id}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '260px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              minWidth: '32px',
                              minHeight: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#e0e7ff',
                              color: '#4f46e5',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '800',
                              fontSize: '0.8125rem',
                              flexShrink: 0
                            }}
                          >
                            #{qIndex + 1}
                          </div>
                          <div style={{ flex: 1 }}>
                            <input
                              type="text"
                              value={q.tieu_de}
                              onChange={(e) => handleQuestionChange(q.id, 'tieu_de', e.target.value)}
                              placeholder="Nhập nội dung câu hỏi..."
                              style={{ width: '100%', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', fontSize: '0.9rem', color: '#0f172a' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          {/* Custom Question Type Dropdown */}
                          <CustomQuestionTypeDropdown
                            value={q.loai}
                            onChange={(newLoai) => handleQuestionChange(q.id, 'loai', newLoai)}
                          />

                          {/* Mandatory Checkbox */}
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>
                            <input
                              type="checkbox"
                              checked={!!q.bat_buoc}
                              onChange={(e) => handleQuestionChange(q.id, 'bat_buoc', e.target.checked)}
                              style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }}
                            />
                            <span>Bắt buộc</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(q.id)}
                            style={{
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              padding: '0.4rem 0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.78125rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <Trash2 size={14} color="#dc2626" /> Xóa
                          </button>
                        </div>
                      </div>

                      {/* Options builder for choice/checkbox/dropdown */}
                      {['choice', 'checkbox', 'dropdown'].includes(q.loai) && (
                        <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Danh sách phương án lựa chọn</span>
                            <button
                              type="button"
                              onClick={() => handleAddOption(q.id)}
                              style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                            >
                              + Thêm phương án
                            </button>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {(q.lua_chon || []).map((opt, optIndex) => (
                              <div key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.3rem 0.65rem' }}>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => handleOptionChange(q.id, optIndex, e.target.value)}
                                  style={{ border: 'none', outline: 'none', fontSize: '0.8125rem', fontWeight: '600', color: '#0f172a', width: '130px' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOption(q.id, optIndex)}
                                  style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                                >
                                  &times;
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTION FOOTER */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', height: '40px', padding: '0 1.5rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn-save-green"
                >
                  <CheckCircle2 size={18} color="#ffffff" />
                  <span>Lưu Biểu Mẫu Khảo Sát</span>
                </button>
              </div>
            </form>
          ) : (
            /* FORMS LIST VIEW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                  Danh sách biểu mẫu đã thiết lập ({surveysState.items.length})
                </h3>
                <button
                  type="button"
                  onClick={startCreateNew}
                  className="btn-save-green"
                >
                  <Plus size={18} color="#ffffff" />
                  <span>Thiết kế biểu mẫu mới</span>
                </button>
              </div>

              {surveysState.loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Đang tải biểu mẫu...</div>
              ) : surveysState.items.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '16px', color: '#64748b' }}>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '1rem', color: '#334155' }}>Chưa có biểu mẫu khảo sát nào</p>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8125rem' }}>Nhấp nút thiết kế biểu mẫu mới để bắt đầu tạo câu hỏi thu thập ý kiến khách hàng.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                  {surveysState.items.map((form) => (
                    <div
                      key={form.id}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderLeft: `6px solid ${form.trang_thai ? '#10b981' : '#94a3b8'}`,
                        borderRadius: '14px',
                        padding: '1.25rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                            {form.tieu_de}
                          </h4>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                            Mã: {form.id}
                          </span>
                        </div>
                        <span style={{ backgroundColor: form.trang_thai ? '#ecfdf5' : '#f1f5f9', color: form.trang_thai ? '#059669' : '#64748b', fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '9999px', border: form.trang_thai ? '1px solid #a7f3d0' : '1px solid #e2e8f0' }}>
                          {form.trang_thai ? 'Đang hoạt động' : 'Tạm dừng'}
                        </span>
                      </div>

                      {form.mo_ta && (
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.4 }}>
                          {form.mo_ta}
                        </p>
                      )}

                      <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>📝 {form.cau_hoi?.length || 0} câu hỏi</span>
                        <span>📅 {new Date(form.ngay_tao || Date.now()).toLocaleDateString('vi-VN')}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                        {!form.trang_thai && (
                          <button
                            type="button"
                            onClick={() => onKichHoatForm(form.id)}
                            style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Kích hoạt
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(form)}
                          style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Edit3 size={14} color="#2563eb" /> Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteForm(form)}
                          style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <Trash2 size={14} color="#dc2626" /> Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: PAGINATED RESPONSES TABLE WITH CSV EXPORT */}
      {activeSubTab === 'responses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* SEARCH & CSV EXPORT HEADER BAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem', flex: 1 }}>
                <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo tên khách, SĐT, mã đơn hoặc câu trả lời..."
                  value={searchText}
                  onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
                  style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => { setSearchText(''); setCurrentPage(1); }}
                    style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: '700' }}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* EXPORT CSV BUTTON */}
            <button
              type="button"
              onClick={exportResponsesToCSV}
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                height: '40px',
                padding: '0 1.25rem',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
              }}
            >
              <FileSpreadsheet size={18} color="#ffffff" />
              <span>Xuất kết quả CSV</span>
            </button>
          </div>

          {/* RESPONSES DATA TABLE */}
          {surveyResponsesState.loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Đang tải danh sách phản hồi khảo sát...</div>
          ) : filteredResponses.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', color: '#64748b' }}>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '1rem', color: '#334155' }}>Không tìm thấy bài khảo sát nào</p>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8125rem' }}>Chưa nhận được phản hồi phù hợp với từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '0.85rem 1rem', width: '60px', textAlign: 'center' }}>STT</th>
                      <th style={{ padding: '0.85rem 1rem', width: '220px' }}>Khách hàng</th>
                      <th style={{ padding: '0.85rem 1rem', width: '130px' }}>Mã đơn hàng</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Tên khảo sát</th>
                      <th style={{ padding: '0.85rem 1rem', width: '160px' }}>Thời gian nộp</th>
                      <th style={{ padding: '0.85rem 1rem', width: '110px', textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResponses.map((resp, idx) => {
                      const absoluteIndex = (currentPage - 1) * pageSize + idx + 1;

                      return (
                        <tr key={resp.id || idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'backgroundColor 0.15s ease' }}>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: '700', color: '#64748b' }}>
                            #{absoluteIndex}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem', flexShrink: 0 }}>
                                {(resp.ten_nguoi_dung || 'K')[0].toUpperCase()}
                              </div>
                              <div>
                                <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.84rem' }}>{resp.ten_nguoi_dung || 'Khách vãng lai'}</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{resp.so_dien_thoai || 'Chưa cung cấp SĐT'}</span>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {resp.ma_don_hang ? (
                              <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#2563eb', backgroundColor: '#eff6ff', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem' }}>
                                #{resp.ma_don_hang}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Không liên kết</span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: '600', color: '#334155' }}>
                            {resp.ten_form || 'Khảo sát chất lượng'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.78rem' }}>
                            {resp.ngay_tao ? new Date(resp.ngay_tao).toLocaleString('vi-VN') : 'Mới đây'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedResponse(resp)}
                              style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <Eye size={14} color="#2563eb" /> Xem
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION FOOTER */}
              <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Hiển thị <strong>{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredResponses.length)}</strong> trên tổng <strong>{filteredResponses.length}</strong> bài khảo sát
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0.35rem 0.65rem', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1, fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}
                  >
                    Trang trước
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        border: pageNum === currentPage ? 'none' : '1px solid #cbd5e1',
                        backgroundColor: pageNum === currentPage ? '#4f46e5' : '#ffffff',
                        color: pageNum === currentPage ? '#ffffff' : '#334155',
                        fontWeight: '700',
                        fontSize: '0.8125rem',
                        cursor: 'pointer'
                      }}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0.35rem 0.65rem', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1, fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DETAILED RESPONSE MODAL / DRAWER */}
          {selectedResponse && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', width: 'min(650px, 95vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                {/* Modal Header */}
                <div style={{ padding: '1.1rem 1.5rem', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                      Chi tiết bài khảo sát #{selectedResponse.id}
                    </h3>
                    <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>
                      Nộp ngày {selectedResponse.ngay_tao ? new Date(selectedResponse.ngay_tao).toLocaleString('vi-VN') : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedResponse(null)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0.4rem' }}
                  >
                    <X size={20} color="#64748b" />
                  </button>
                </div>

                {/* Modal Content */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Customer Meta Pill */}
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', fontSize: '0.8125rem' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Họ tên khách hàng</span>
                      <strong style={{ color: '#0f172a' }}>{selectedResponse.ten_nguoi_dung || 'Khách vãng lai'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Số điện thoại</span>
                      <strong style={{ color: '#0f172a' }}>{selectedResponse.so_dien_thoai || 'Không cung cấp'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Mã đơn hàng</span>
                      <strong style={{ color: '#2563eb' }}>{selectedResponse.ma_don_hang ? `#${selectedResponse.ma_don_hang}` : 'Không có'}</strong>
                    </div>
                  </div>

                  {/* Answers breakdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '700', color: '#334155' }}>
                      Chi tiết các câu trả lời:
                    </h4>

                    {(selectedResponse.tra_loi || []).map((ans, idx) => (
                      <div key={idx} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#4f46e5' }}>
                          Câu {idx + 1}: {ans.cau_hoi_tieu_de}
                        </span>
                        <div style={{ fontSize: '0.9rem', fontWeight: '600', color: typeof ans.cau_tra_loi === 'number' ? '#d97706' : '#0f172a' }}>
                          {typeof ans.cau_tra_loi === 'number'
                            ? '⭐'.repeat(ans.cau_tra_loi) + ` (${ans.cau_tra_loi}/5 sao)`
                            : Array.isArray(ans.cau_tra_loi)
                              ? ans.cau_tra_loi.join(', ')
                              : ans.cau_tra_loi || '(Không trả lời)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modal Footer */}
                <div style={{ padding: '0.85rem 1.5rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedResponse(null)}
                    style={{ backgroundColor: '#334155', color: '#ffffff', border: 'none', padding: '0.45rem 1.25rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* SUBTAB 3: GOOGLE FORMS STYLE QUESTION ANALYTICS */}
      {activeSubTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* ANALYTICS HEADER & FORM SELECTOR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff', padding: '1rem 1.25rem', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={18} color="#4f46e5" /> Thống Kê Tổng Quan Theo Từng Câu Hỏi
              </h3>
              <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>
                Biểu đồ phân bổ tỷ lệ câu trả lời tương tự Google Forms
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>Chọn bài khảo sát:</span>
              <select
                style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', fontWeight: '700', color: '#0f172a', cursor: 'pointer' }}
                value={selectedAnalyticsFormId}
                onChange={(e) => setSelectedAnalyticsFormId(e.target.value)}
              >
                {activeForms.map(f => (
                  <option key={f.id} value={f.id}>{f.tieu_de}</option>
                ))}
              </select>
            </div>
          </div>

          {/* OVERVIEW STATS PILLS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={22} color="#4f46e5" />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>TỔNG PHẢN HỒI NỘP</span>
                <strong style={{ display: 'block', fontSize: '1.25rem', color: '#0f172a', marginTop: '0.15rem' }}>{totalResponses} bài</strong>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={22} color="#d97706" />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>ĐÁNH GIÁ TRUNG BÌNH</span>
                <strong style={{ display: 'block', fontSize: '1.25rem', color: '#d97706', marginTop: '0.15rem' }}>⭐ {avgRating} / 5.0</strong>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={22} color="#059669" />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>TỔNG SỐ CÂU HỎI</span>
                <strong style={{ display: 'block', fontSize: '1.25rem', color: '#059669', marginTop: '0.15rem' }}>{targetQuestions.length} câu hỏi</strong>
              </div>
            </div>
          </div>

          {/* QUESTION ANALYTICS CARDS (GOOGLE FORMS STYLE) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {targetQuestions.map((q, qIdx) => {
              // Collect all answers for this question title
              const qAnswers = [];
              allResponses.forEach(r => {
                const matchAns = (r.tra_loi || []).find(a => a.cau_hoi_tieu_de === q.tieu_de || a.cau_hoi_id === q.id);
                if (matchAns && matchAns.cau_tra_loi !== undefined && matchAns.cau_tra_loi !== '') {
                  qAnswers.push(matchAns.cau_tra_loi);
                }
              });

              return (
                <div
                  key={q.id || qIdx}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '1.25rem 1.5rem',
                    boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}
                >
                  {/* Question Title & Meta Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{ backgroundColor: '#4f46e5', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                        Câu {qIdx + 1}
                      </span>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                        {q.tieu_de}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: '600' }}>
                        {q.loai === 'rating' ? '⭐ Rating' : q.loai === 'choice' ? '🔘 Trắc nghiệm' : q.loai === 'checkbox' ? '☑️ Hộp kiểm' : '✍️ Văn bản'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#059669', backgroundColor: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: '700' }}>
                        {qAnswers.length} lượt trả lời
                      </span>
                    </div>
                  </div>

                  {/* STATS BREAKDOWN ACCORDING TO QUESTION TYPE */}
                  
                  {/* TYPE 1: RATING (1-5 STARS) */}
                  {q.loai === 'rating' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {[5, 4, 3, 2, 1].map((starVal) => {
                        const count = qAnswers.filter(v => Number(v) === starVal).length;
                        const pct = qAnswers.length > 0 ? ((count / qAnswers.length) * 100).toFixed(1) : 0;

                        return (
                          <div key={starVal} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.8125rem' }}>
                            <span style={{ width: '70px', fontWeight: '700', color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              {starVal} ⭐
                            </span>
                            <div style={{ flex: 1, backgroundColor: '#f1f5f9', height: '12px', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                                  borderRadius: '9999px',
                                  transition: 'width 0.4s ease'
                                }}
                              />
                            </div>
                            <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>
                              {pct}% ({count})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TYPE 2: CHOICE / CHECKBOX / DROPDOWN */}
                  {['choice', 'checkbox', 'dropdown'].includes(q.loai) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {(q.lua_chon || []).map((optName, optIdx) => {
                        let count = 0;
                        qAnswers.forEach(ans => {
                          if (Array.isArray(ans) && ans.includes(optName)) count++;
                          else if (String(ans) === String(optName)) count++;
                        });
                        const pct = qAnswers.length > 0 ? ((count / qAnswers.length) * 100).toFixed(1) : 0;

                        return (
                          <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.8125rem' }}>
                            <span style={{ width: '180px', fontWeight: '600', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {optName}
                            </span>
                            <div style={{ flex: 1, backgroundColor: '#f1f5f9', height: '12px', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #4f46e5 0%, #3730a3 100%)',
                                  borderRadius: '9999px',
                                  transition: 'width 0.4s ease'
                                }}
                              />
                            </div>
                            <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                              {pct}% ({count})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TYPE 3: TEXT / PARAGRAPH */}
                  {['text', 'paragraph'].includes(q.loai) && (
                    <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {qAnswers.length === 0 ? (
                        <span style={{ fontSize: '0.78125rem', color: '#94a3b8' }}>Chưa có ý kiến phản hồi bằng văn bản.</span>
                      ) : (
                        qAnswers.map((txtVal, txtIdx) => (
                          <div key={txtIdx} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.55rem 0.75rem', fontSize: '0.8125rem', color: '#1e293b' }}>
                            💬 "{String(txtVal)}"
                          </div>
                        ))
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      )}

    </section>
  );
}
