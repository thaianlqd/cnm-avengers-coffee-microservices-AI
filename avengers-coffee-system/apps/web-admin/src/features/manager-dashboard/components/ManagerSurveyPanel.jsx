import React, { useState } from 'react';

export function ManagerSurveyPanel({
  surveysState,
  surveyResponsesState,
  onKichHoatForm,
  onTaoForm,
  onSuaForm,
  onXoaForm,
  onTaiForms,
  onTaiResponses,
}) {
  const [activeSubTab, setActiveSubTab] = useState('forms'); // 'forms' | 'responses'
  const [isEditing, setIsEditing] = useState(false);
  const [editingFormId, setEditingFormId] = useState(null); // null means creating new
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [questions, setQuestions] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedResponse, setSelectedResponse] = useState(null);

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
    setFormTitle(form.tieu_de);
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
      alert('Vui lòng nhập tiêu đề biểu mẫu');
      return;
    }
    if (questions.length === 0) {
      alert('Biểu mẫu phải chứa ít nhất 1 câu hỏi');
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

  // Compute analytics
  const totalResponses = surveyResponsesState.items.length;
  const ratingQuestions = [];
  const ratingAnswers = [];

  surveyResponsesState.items.forEach((resp) => {
    (resp.tra_loi || []).forEach((ans) => {
      if (typeof ans.cau_tra_loi === 'number') {
        ratingAnswers.push(ans.cau_tra_loi);
        if (!ratingQuestions.includes(ans.cau_hoi_tieu_de)) {
          ratingQuestions.push(ans.cau_hoi_tieu_de);
        }
      }
    });
  });

  const avgRating =
    ratingAnswers.length > 0
      ? (ratingAnswers.reduce((sum, val) => sum + val, 0) / ratingAnswers.length).toFixed(1)
      : 'N/A';

  // Filtered responses
  const filteredResponses = surveyResponsesState.items.filter((resp) => {
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

  // Styled components wrapper styles (Outfit & premium UI)
  const containerStyle = {
    padding: '32px',
    background: '#fff',
    borderRadius: '24px',
    border: '1px solid #f2ede4',
    boxShadow: '0 10px 30px rgba(74, 47, 32, 0.03)',
    color: '#2d221c',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    borderBottom: '2px solid #f6f3ed',
    paddingBottom: '20px',
  };

  const tabButtonStyle = (isActive) => ({
    padding: '10px 22px',
    borderRadius: '30px',
    border: 'none',
    background: isActive ? '#c41230' : '#f8f6f2',
    color: isActive ? '#fff' : '#5c4d44',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    boxShadow: isActive ? '0 4px 12px rgba(196, 18, 48, 0.2)' : 'none',
    transition: 'all 0.25s ease',
  });

  const cardStyle = {
    background: '#fdfdfc',
    border: '1px solid #efeae0',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 4px 12px rgba(74, 47, 32, 0.015)',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#84746a',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid #e1dacf',
    fontSize: '14px',
    fontWeight: 500,
    color: '#2d221c',
    background: '#fff',
    outline: 'none',
    transition: 'all 0.2s',
  };

  const questionCardStyle = {
    background: '#fff',
    border: '1px solid #efeae0',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.01)',
    transition: 'transform 0.2s',
  };

  return (
    <div style={containerStyle}>
      {/* Panel Header */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            📊 Quản Lý Khảo Sát Hệ Thống
          </h2>
          <p style={{ fontSize: '13px', color: '#84746a', margin: '6px 0 0 0', fontWeight: 400 }}>
            Quản trị viên thiết lập câu hỏi và theo dõi đánh giá của khách hàng.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setActiveSubTab('forms'); setIsEditing(false); }}
            style={tabButtonStyle(activeSubTab === 'forms')}
          >
            📋 Thiết kế Biểu mẫu
          </button>
          <button
            onClick={() => { setActiveSubTab('responses'); setIsEditing(false); }}
            style={tabButtonStyle(activeSubTab === 'responses')}
          >
            💬 Phản hồi ({totalResponses})
          </button>
        </div>
      </div>

      {/* SUBTAB: FORMS DESIGNER */}
      {activeSubTab === 'forms' && (
        <div>
          {isEditing ? (
            /* SURVEY EDITOR */
            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 700, color: '#c41230', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {editingFormId ? '✏️ Chỉnh sửa biểu mẫu' : '➕ Thêm biểu mẫu mới'}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Tiêu đề khảo sát</label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Ví dụ: Khảo sát trải nghiệm khách hàng tại Avengers House"
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Mô tả ngắn & Quyền lợi</label>
                    <textarea
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Ví dụ: Đóng góp ý kiến của bạn để nhận Voucher 20% giảm giá cho đơn từ 100k"
                      rows={2}
                      style={{ ...inputStyle, fontFamily: 'inherit', resize: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* Questions Designer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#1a1a1a' }}>
                    Câu hỏi thiết lập ({questions.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    style={{
                      padding: '8px 16px',
                      background: '#1a1a1a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '30px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                      transition: 'all 0.2s',
                    }}
                  >
                    ➕ Thêm câu hỏi
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {questions.map((q, qIndex) => (
                    <div key={q.id} style={questionCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#c41230', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Câu hỏi {qIndex + 1}
                          </span>
                          <input
                            type="text"
                            value={q.tieu_de}
                            onChange={(e) => handleQuestionChange(q.id, 'tieu_de', e.target.value)}
                            placeholder="Nhập nội dung câu hỏi..."
                            style={{ ...inputStyle, marginTop: '6px', fontWeight: 500, padding: '10px 14px', border: '1px solid #e5dfd5' }}
                          />
                        </div>
                        
                        <div style={{ width: '180px' }}>
                          <span style={labelStyle}>Loại câu hỏi</span>
                          <select
                            value={q.loai}
                            onChange={(e) => handleQuestionChange(q.id, 'loai', e.target.value)}
                            style={{ ...inputStyle, marginTop: '6px', padding: '10px', fontSize: '13px', fontWeight: 500, border: '1px solid #e5dfd5', appearance: 'none', cursor: 'pointer' }}
                          >
                            <option value="text">✍️ Văn bản ngắn</option>
                            <option value="paragraph">📄 Đoạn văn dài</option>
                            <option value="rating">⭐ Đánh giá sao (1-5)</option>
                            <option value="choice">🔘 Trắc nghiệm (Chọn 1)</option>
                            <option value="checkbox">☑️ Hộp kiểm (Chọn nhiều)</option>
                            <option value="dropdown">🔽 Menu thả xuống</option>
                            <option value="date">📅 Chọn Ngày</option>
                            <option value="time">⏰ Chọn Giờ</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '24px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#84746a', textTransform: 'uppercase' }}>Bắt buộc</span>
                          <input
                            type="checkbox"
                            checked={!!q.bat_buoc}
                            onChange={(e) => handleQuestionChange(q.id, 'bat_buoc', e.target.checked)}
                            style={{ marginTop: '6px', width: '16px', height: '16px', accentColor: '#c41230' }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(q.id)}
                          style={{
                            marginTop: '20px',
                            padding: '10px 14px',
                            background: '#ffebeb',
                            color: '#c41230',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          Xóa
                        </button>
                      </div>

                      {/* Options list for choice, checkbox, dropdown type */}
                      {['choice', 'checkbox', 'dropdown'].includes(q.loai) && (
                        <div style={{ background: '#faf9f6', border: '1px dashed #e1dacf', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#5c4d44', textTransform: 'uppercase' }}>Các phương án lựa chọn</span>
                            <button
                              type="button"
                              onClick={() => handleAddOption(q.id)}
                              style={{ padding: '4px 10px', background: '#fff', border: '1px solid #dcd5ca', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              ➕ Thêm phương án
                            </button>
                          </div>
                          
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(q.lua_chon || []).map((opt, optIndex) => (
                              <div key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #e5dfd5', borderRadius: '8px', padding: '6px 12px', boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => handleOptionChange(q.id, optIndex, e.target.value)}
                                  style={{ border: 'none', fontSize: '12px', fontWeight: 500, outline: 'none', width: '120px', color: '#2d221c' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOption(q.id, optIndex)}
                                  style={{ background: 'transparent', border: 'none', color: '#a89d94', cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: 0 }}
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

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '14px', marginTop: '16px', borderTop: '2px solid #f6f3ed', paddingTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  style={{ flex: 1, padding: '14px', border: '1px solid #e1dacf', borderRadius: '30px', background: '#fff', color: '#5c4d44', fontWeight: 600, fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  style={{ flex: 2, padding: '14px', border: 'none', borderRadius: '30px', background: '#c41230', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(196,18,48,0.2)' }}
                >
                  Lưu biểu mẫu
                </button>
              </div>
            </form>
          ) : (
            /* FORMS LIST */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5c4d44' }}>
                  Danh sách biểu mẫu ({surveysState.items.length})
                </h4>
                <button
                  onClick={startCreateNew}
                  style={{
                    padding: '10px 20px',
                    background: '#c41230',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '30px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(196, 18, 48, 0.15)',
                    transition: 'all 0.25s',
                  }}
                >
                  ➕ Thiết kế biểu mẫu mới
                </button>
              </div>

              {surveysState.loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#84746a', fontWeight: 500 }}>☕ Đang tải danh sách biểu mẫu...</div>
              ) : surveysState.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#84746a', border: '2px dashed #efeae0', borderRadius: '16px', background: '#fdfcfb' }}>
                  <p style={{ fontWeight: 700, fontSize: '15px', margin: 0 }}>Chưa có biểu mẫu khảo sát nào</p>
                  <p style={{ fontSize: '13px', margin: '4px 0 0 0' }}>Bấm nút phía trên bên phải để bắt đầu thiết kế biểu mẫu đầu tiên cho hệ thống.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {surveysState.items.map((form) => (
                    <div
                      key={form.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid #efeae0',
                        borderRadius: '16px',
                        padding: '20px',
                        background: form.trang_thai ? '#fffdfa' : '#fff',
                        borderLeft: form.trang_thai ? '6px solid #c41230' : '1px solid #efeae0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.015)',
                      }}
                    >
                      <div style={{ flex: 1, marginRight: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 700, color: '#1d1512', fontSize: '15px' }}>{form.tieu_de}</span>
                          {form.trang_thai ? (
                            <span style={{ fontSize: '11px', background: '#e6f4ea', color: '#137333', padding: '3px 10px', borderRadius: '20px', fontWeight: 600 }}>Đang hoạt động</span>
                          ) : (
                            <span style={{ fontSize: '11px', background: '#f1f3f4', color: '#5f6368', padding: '3px 10px', borderRadius: '20px', fontWeight: 600 }}>Tạm dừng</span>
                          )}
                        </div>
                        {form.mo_ta && (
                          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#685950', fontWeight: 400 }}>{form.mo_ta}</p>
                        )}
                        <p style={{ margin: '12px 0 0 0', fontSize: '11px', color: '#a89d94', fontWeight: 400 }}>
                          📝 <strong>{form.cau_hoi?.length || 0} câu hỏi</strong> • 👤 Người tạo: {form.nguoi_tao || 'Admin'} • 📅 {new Date(form.ngay_tao).toLocaleDateString('vi-VN')}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {!form.trang_thai && (
                          <button
                            onClick={() => onKichHoatForm(form.id)}
                            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #137333', color: '#137333', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                          >
                            Kích hoạt
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(form)}
                          style={{ padding: '8px 16px', background: '#fff', border: '1px solid #dcd5ca', color: '#5c4d44', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => onXoaForm(form.id)}
                          style={{ padding: '8px 16px', background: '#ffebeb', border: '1px solid #ffd1d1', color: '#c41230', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          Xóa
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

      {/* SUBTAB: RESPONSES & ANALYTICS */}
      {activeSubTab === 'responses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Analytics Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#fcfbfa', border: '1px solid #efeae0', borderRadius: '16px', padding: '20px', textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#84746a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tổng lượt phản hồi</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1d1512', marginTop: '6px' }}>{totalResponses}</div>
            </div>
            
            <div style={{ background: '#fffcf5', border: '1px solid #fef08a', borderRadius: '16px', padding: '20px', textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Đánh giá trung bình</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#ca8a04', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                ⭐ {avgRating}
              </div>
            </div>

            <div style={{ background: '#f5fdf8', border: '1px solid #bbf7d0', borderRadius: '16px', padding: '20px', textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chỉ số hài lòng</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#14532d', marginTop: '10px', wordBreak: 'break-word', lineHeight: '1.4' }}>
                {ratingQuestions.length > 0 ? ratingQuestions.join(', ') : 'Chưa có câu hỏi xếp hạng'}
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Tìm kiếm theo tên khách, SĐT, mã đơn hàng hoặc nội dung câu trả lời..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ ...inputStyle, flex: 1, padding: '12px 18px', fontSize: '13px' }}
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                style={{ padding: '8px 16px', background: '#f1ece4', color: '#5c4d44', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          {/* Responses Table/List */}
          {surveyResponsesState.loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#84746a', fontWeight: 500 }}>☕ Đang tải danh sách phản hồi...</div>
          ) : filteredResponses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#84746a', border: '2px dashed #efeae0', borderRadius: '16px', background: '#fdfcfb' }}>
              <p style={{ fontWeight: 700, fontSize: '15px', margin: 0 }}>Không tìm thấy phản hồi nào</p>
              <p style={{ fontSize: '13px', margin: '4px 0 0 0' }}>Chưa nhận được phản hồi nào từ khách hàng khớp với từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '24px', alignItems: 'start' }}>
              
              {/* List left */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxH: '520px', overflowY: 'auto', borderRight: '1px solid #efeae0', paddingRight: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#a89d94', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Danh sách phản hồi ({filteredResponses.length})
                </span>
                {filteredResponses.map((resp) => {
                  const isSelected = selectedResponse?.id === resp.id;
                  
                  return (
                    <div
                      key={resp.id}
                      onClick={() => setSelectedResponse(resp)}
                      style={{
                        padding: '16px',
                        border: isSelected ? '2px solid #c41230' : '1px solid #efeae0',
                        borderRadius: '12px',
                        background: isSelected ? '#fffcfc' : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isSelected ? '0 4px 12px rgba(196,18,48,0.04)' : '0 2px 6px rgba(0,0,0,0.005)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#1d1512' }}>
                          {resp.ten_nguoi_dung || 'Khách vãng lai'}
                        </span>
                        <span style={{ fontSize: '10px', color: '#a89d94', fontWeight: 450 }}>
                          {new Date(resp.ngay_tao).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#685950', marginTop: '8px', fontWeight: 450 }}>
                        {resp.so_dien_thoai && <span>📞 {resp.so_dien_thoai}</span>}
                        {resp.ma_don_hang && <span>📦 Đơn: {resp.ma_don_hang}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detail right */}
              <div style={{ background: '#fff', border: '1px solid #efeae0', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.015)' }}>
                {selectedResponse ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ borderBottom: '2px solid #f6f3ed', paddingBottom: '16px', marginBottom: '4px' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#c41230' }}>
                        Chi tiết phản hồi
                      </h4>
                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#1d1512', fontWeight: 600 }}>
                        Khách hàng: <span style={{ color: '#c41230' }}>{selectedResponse.ten_nguoi_dung || 'Khách vãng lai'}</span>
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#685950', fontWeight: 450 }}>
                        SĐT: {selectedResponse.so_dien_thoai || 'Không cung cấp'} • Mã đơn: {selectedResponse.ma_don_hang || 'Không liên kết'}
                      </p>
                      <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#a89d94', fontWeight: 450 }}>
                        Thời gian nộp: {new Date(selectedResponse.ngay_tao).toLocaleString('vi-VN')}
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {(selectedResponse.tra_loi || []).map((ans, idx) => (
                        <div key={idx} style={{ background: '#fdfcfb', border: '1px solid #f0eae0', borderRadius: '12px', padding: '16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#5c4d44', lineHeight: '1.4' }}>
                            Câu {idx + 1}: {ans.cau_hoi_tieu_de}
                          </div>
                          <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 600, color: typeof ans.cau_tra_loi === 'number' ? '#d97706' : '#1d1512', lineHeight: '1.5' }}>
                            {typeof ans.cau_tra_loi === 'number'
                              ? '⭐'.repeat(ans.cau_tra_loi) + ` (${ans.cau_tra_loi}/5)`
                              : Array.isArray(ans.cau_tra_loi)
                                ? ans.cau_tra_loi.join(', ')
                                : ans.cau_tra_loi || '(Không trả lời)'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#a89d94', padding: '100px 0' }}>
                    <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>💡</span>
                    <p style={{ fontSize: '13px', fontWeight: 450, margin: 0 }}>Chọn một phản hồi ở danh sách bên trái để hiển thị thông tin trả lời chi tiết.</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
