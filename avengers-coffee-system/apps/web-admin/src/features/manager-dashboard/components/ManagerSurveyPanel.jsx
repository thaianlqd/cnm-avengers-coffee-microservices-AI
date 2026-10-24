import StatusBadge from '../../../components/console/StatusBadge'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Table } from '../../../components/ui/table'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog';
import SearchableSelect from '../../../components/console/SearchableSelect'
import { PageNumbers } from '../../../components/console/CompactPagination'
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
  Check,
  PenLine,
  Radio,
  ListFilter,
  Clock,
  Gift,
  Sparkles,
  Award, QrCode, Copy, ExternalLink
} from '../../../components/console/WorkspaceIcons';

const DEFAULT_REALISTIC_SURVEY_QUESTIONS = [
  {
    id: 'q_bev_taste',
    tieu_de: '1. Bạn đánh giá thế nào về hương vị và chất lượng tổng thể của đồ uống hôm nay?',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_fav_category',
    tieu_de: '2. Nhóm sản phẩm nào bạn yêu thích và thường xuyên lựa chọn nhất?',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Cà phê truyền thống (Cà phê Đen, Cà phê Sữa đá, Bạc xỉu)',
      'Cà phê pha máy Espresso (Latte, Cappuccino, Americano)',
      'Trà trái cây nhiệt đới & Trà sữa thanh mát',
      'Đá xay Frappuccino & Sinh tố hoa quả tươi',
      'Bánh ngọt & Đồ ăn nhẹ dùng kèm'
    ]
  },
  {
    id: 'q_sugar_ice_ratio',
    tieu_de: '3. Độ ngọt và lượng đá trong món đồ uống có vừa với khẩu vị của bạn không?',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Rất vừa miệng, đúng khẩu vị yêu cầu',
      'Hơi ngọt so với khẩu vị',
      'Quá ngọt / Cần giảm lượng đường',
      'Nhiều đá, làm loãng vị thức uống',
      'Hơi ít đá'
    ]
  },
  {
    id: 'q_packaging_look',
    tieu_de: '4. Hình thức trình bày, thiết kế ly cốc và bao bì đóng gói mang đi:',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_store_ambiance',
    tieu_de: '5. Bạn cảm nhận như thế nào về không gian (ánh sáng, âm nhạc, nhiệt độ điều hòa) tại quán?',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Rất thoải mái, yên tĩnh, thích hợp học tập & làm việc',
      'Âm nhạc nhẹ nhàng, không gian ấm cúng, thư giãn',
      'Nhiệt độ phòng chưa phù hợp (hơi lạnh hoặc hơi nóng)',
      'Âm nhạc hơi to, không gian ồn ào',
      'Bàn ghế cần bố trí thêm ổ cắm điện phục vụ laptop'
    ]
  },
  {
    id: 'q_cleanliness_rating',
    tieu_de: '6. Mức độ sạch sẽ, ngăn nắp tại khu vực bàn ghế và quầy phục vụ:',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_staff_attitude',
    tieu_de: '7. Sự niềm nở, thân thiện và nhiệt tình của đội ngũ nhân viên:',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_staff_consultation',
    tieu_de: '8. Nhân viên có chủ động tư vấn chương trình ưu đãi, size ly hoặc topping không?',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Nhân viên tư vấn rất tận tình, chu đáo và rõ ràng',
      'Có tư vấn nhưng chưa đầy đủ thông tin',
      'Không giới thiệu ưu đãi / Chỉ ghi nhận món khách gọi',
      'Tôi tự chọn món theo thói quen quen thuộc'
    ]
  },
  {
    id: 'q_serving_speed',
    tieu_de: '9. Thời gian từ lúc hoàn tất thanh toán đến khi nhận đồ uống là bao lâu?',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Dưới 3 phút (Rất nhanh chóng)',
      'Từ 3 đến 5 phút (Hợp lý, đúng hẹn)',
      'Từ 6 đến 10 phút (Hơi lâu)',
      'Trên 10 phút (Chờ đợi quá lâu)'
    ]
  },
  {
    id: 'q_ordering_channel',
    tieu_de: '10. Phương thức gọi món bạn đã sử dụng cho đơn hàng lần này:',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Gọi món trực tiếp tại quầy thu ngân',
      'Tự đặt hàng qua màn hình cảm ứng Kiosk tại cửa hàng',
      'Đặt trước qua Ứng dụng điện thoại / Website mang đi',
      'Đặt giao tận nơi qua ứng dụng giao hàng (Grab, ShopeeFood, Gojek)'
    ]
  },
  {
    id: 'q_kiosk_app_experience',
    tieu_de: '11. Nếu bạn đặt qua Kiosk hoặc App, trải nghiệm thao tác của bạn thế nào?',
    loai: 'choice',
    bat_buoc: false,
    lua_chon: [
      'Rất mượt mà, giao diện trực quan và thanh toán nhanh',
      'Khá tiện lợi, dễ sử dụng',
      'Giao diện tải còn chậm hoặc đôi lúc bị đơ',
      'Gặp khó khăn khi quét mã QR thanh toán hoặc áp mã giảm giá',
      'Tôi không sử dụng hình thức này'
    ]
  },
  {
    id: 'q_payment_convenience',
    tieu_de: '12. Sự tiện lợi của các hình thức thanh toán (Tiền mặt, Thẻ ngân hàng, Ví MoMo, ZaloPay, VNPay):',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_price_worth',
    tieu_de: '13. Bạn đánh giá mức giá của Avengers Coffee so với chất lượng và trải nghiệm nhận được thế nào?',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Rất xứng đáng với giá tiền',
      'Mức giá hợp lý, cạnh tranh trên thị trường',
      'Hơi cao so với mặt bằng chung',
      'Khá đắt đỏ so với chất lượng'
    ]
  },
  {
    id: 'q_promotion_appeal',
    tieu_de: '14. Các chương trình khuyến mãi, ưu đãi thành viên và quà tặng có đủ hấp dẫn bạn không?',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_visit_frequency',
    tieu_de: '15. Tần suất bạn ghé thăm hoặc đặt đồ uống tại Avengers Coffee:',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Gần như mỗi ngày (Khách hàng thân thiết)',
      '2 - 3 lần mỗi tuần',
      'Khoảng 1 lần mỗi tuần',
      'Vài lần trong tháng',
      'Đây là lần đầu tiên tôi trải nghiệm'
    ]
  },
  {
    id: 'q_visit_reasons',
    tieu_de: '16. Mục đích chính trong chuyến ghé thăm Avengers Coffee lần này của bạn:',
    loai: 'checkbox',
    bat_buoc: true,
    lua_chon: [
      'Làm việc / Học tập cần không gian tập trung',
      'Gặp gỡ bạn bè, trò chuyện thư giãn',
      'Bàn bạc công việc / Tiếp đón đối tác',
      'Mua mang đi nhanh trên đường đi làm/học',
      'Thưởng thức đồ uống hoặc món bánh mới ra mắt'
    ]
  },
  {
    id: 'q_nps_rating',
    tieu_de: '17. Trên thang điểm 1-5, bạn có sẵn lòng giới thiệu Avengers Coffee cho bạn bè, người thân không?',
    loai: 'rating',
    bat_buoc: true
  },
  {
    id: 'q_return_intent',
    tieu_de: '18. Khả năng bạn sẽ tiếp tục quay lại ủng hộ Avengers Coffee trong thời gian tới:',
    loai: 'choice',
    bat_buoc: true,
    lua_chon: [
      'Chắc chắn sẽ quay lại thường xuyên',
      'Khả năng cao sẽ ghé lại',
      'Sẽ cân nhắc tùy theo nhu cầu và địa điểm',
      'Chưa có ý định quay lại'
    ]
  },
  {
    id: 'q_menu_suggestion',
    tieu_de: '19. Bạn mong muốn Avengers Coffee bổ sung thêm món đồ uống, món bánh hoặc dịch vụ nào mới?',
    loai: 'text',
    bat_buoc: false
  },
  {
    id: 'q_open_feedback',
    tieu_de: '20. Ý kiến đóng góp chân thành khác giúp Avengers Coffee hoàn thiện chất lượng phục vụ hơn:',
    loai: 'paragraph',
    bat_buoc: false
  }
];

function CustomQuestionTypeDropdown({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const options = [
    { value: 'text', label: 'Văn bản ngắn', Icon: PenLine },
    { value: 'paragraph', label: 'Đoạn văn dài', Icon: FileText },
    { value: 'rating', label: 'Đánh giá sao (1-5)', Icon: Star },
    { value: 'choice', label: 'Trắc nghiệm (Chọn 1)', Icon: Radio },
    { value: 'checkbox', label: 'Hộp kiểm (Chọn nhiều)', Icon: CheckSquare },
    { value: 'dropdown', label: 'Menu thả xuống', Icon: ListFilter },
    { value: 'date', label: 'Chọn Ngày', Icon: Calendar },
    { value: 'time', label: 'Chọn Giờ', Icon: Clock }
  ];

  const selectedOpt = options.find((o) => o.value === value) || options[0];
  const SelectedIcon = selectedOpt.Icon;

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
      <Button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          height: '40px',
          padding: '0 0.85rem',
          borderRadius: '8px',
          border: isOpen ? '1px solid #2563eb' : '1px solid #cbd5e1',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontWeight: '500',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : '0 1px 2px rgba(15, 23, 42, 0.05)',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
          <SelectedIcon size={16} color="#2563eb" style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedOpt.label}</span>
        </div>
        <ChevronDown size={16} color={isOpen ? '#2563eb' : '#64748b'} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }} />
      </Button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
            padding: '0.35rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem'
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const OptIcon = opt.Icon;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                  color: isSelected ? '#2563eb' : '#334155',
                  fontWeight: isSelected ? '600' : '500',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <OptIcon size={16} color={isSelected ? '#2563eb' : '#64748b'} style={{ flexShrink: 0 }} />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check size={16} color="#2563eb" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ManagerSurveyPanel({
  branchCode,
  surveysState = { items: [], loading: false },
  surveyResponsesState = { items: [], loading: false },
  onKichHoatForm,
  onTaoForm,
  onSuaForm,
  onXoaForm,
  onTaiForms,
  onTaiResponses,
}) {
  const [shareForm,setShareForm]=useState(null);
  const [copyStatus,setCopyStatus]=useState('');
  const shareUrl=shareForm ? `${import.meta.env.VITE_TABLE_ORDER_URL || `${window.location.protocol}//${window.location.hostname}:5176`}/survey/${shareForm.id}` : '';
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
  const [selectedAnalyticsFormId, setSelectedAnalyticsFormId] = useState('');

  useEffect(() => {
    if (onTaiForms) onTaiForms();
    if (onTaiResponses) onTaiResponses();
  }, []); // Only fetch when this panel is opened

  const startCreateNew = () => {
    setFormTitle(branchCode ? 'Khảo sát trải nghiệm tại cửa hàng' : 'Khảo sát trải nghiệm khách hàng toàn hệ thống');
    setFormDesc(branchCode ? 'Chia sẻ trải nghiệm của bạn để cửa hàng phục vụ tốt hơn.' : 'Chia sẻ trải nghiệm của bạn với Avengers Coffee.');
    setQuestions(
      DEFAULT_REALISTIC_SURVEY_QUESTIONS.map((q, idx) => ({
        ...q,
        id: 'q_' + (Date.now() + idx) + '_' + Math.random().toString(36).substring(2, 6)
      }))
    );
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
    const newId = 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newQ = {
      id: newId,
      tieu_de: '',
      loai: 'choice',
      bat_buoc: true,
      lua_chon: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3']
    };
    setQuestions((prev) => [...prev, newQ]);
    setTimeout(() => {
      const el = document.getElementById(`question-card-${newId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inputEl = el.querySelector('input[type="text"]');
        inputEl?.focus();
      }
    }, 120);
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
      await onXoaForm(form.id, true);
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
    <section className="panel admin-survey-workbench" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {branchCode && <p className="operation-note">Khảo sát riêng của chi nhánh {branchCode}. Chỉ quản lý chi nhánh này xem được phản hồi. Kích hoạt biểu mẫu trước khi chia sẻ.</p>}
      {shareForm && <WorkspaceDialog title="Chia sẻ khảo sát cửa hàng" onClose={()=>setShareForm(null)}><div data-modal-body="true" className="survey-share"><h3>{shareForm.tieu_de}</h3>{shareForm.trang_thai ? <><img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`} alt="Mã QR mở khảo sát chi nhánh"/><Input readOnly aria-label="Liên kết khảo sát" value={shareUrl}/><div><Button variant="outline" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(shareUrl);setCopyStatus('Đã sao chép liên kết.')}catch{setCopyStatus('Hãy chọn và sao chép liên kết ở trên.')}}}><Copy size={15}/>Sao chép</Button><Button asChild><a href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Mở khảo sát</a></Button></div>{copyStatus&&<p role="status">{copyStatus}</p>}</>:<p>Khảo sát chưa được kích hoạt. Đóng cửa sổ và chọn “Kích hoạt” để nhận phản hồi.</p>}</div></WorkspaceDialog>}
      
      {/* SUBTABS TOOLBAR & ACTION HEADER */}
      <div className="admin-survey-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="survey-nav-tabs" style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', gap: '4px' }}>
          <Button
            type="button"
            className={`survey-nav-tab ${activeSubTab === 'forms' ? 'is-active' : ''}`}
            onClick={() => { setActiveSubTab('forms'); setIsEditing(false); }}
          >
            <FileText size={16} />
            <span>Biểu mẫu khảo sát</span>
            <Badge variant="outline" className="tab-badge">{surveysState.items.length}</Badge>
          </Button>

          <Button
            type="button"
            className={`survey-nav-tab ${activeSubTab === 'responses' ? 'is-active' : ''}`}
            onClick={() => { setActiveSubTab('responses'); setIsEditing(false); }}
          >
            <MessageSquare size={16} />
            <span>Bảng phản hồi</span>
            <Badge variant="outline" className="tab-badge">{totalResponses}</Badge>
          </Button>

          <Button
            type="button"
            className={`survey-nav-tab ${activeSubTab === 'analytics' ? 'is-active' : ''}`}
            onClick={() => { setActiveSubTab('analytics'); setIsEditing(false); }}
          >
            <BarChart3 size={16} />
            <span>Thống kê chi tiết</span>
          </Button>
        </div>

        {activeSubTab === 'forms' && !isEditing && (
          <Button
            type="button"
            className="survey-btn-primary"
            onClick={startCreateNew}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Thiết kế biểu mẫu mới</span>
          </Button>
        )}
      </div>

      {/* SUBTAB 1: FORMS DESIGNER */}
      {activeSubTab === 'forms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* FORMS LIST VIEW */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {surveysState.loading && surveysState.items.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Đang tải biểu mẫu...</div>
            ) : surveysState.items.length === 0 ? (
              <div style={{ padding: '3.5rem 2rem', textAlign: 'center', backgroundColor: '#ffffff', border: '1.5px dashed #cbd5e1', borderRadius: '14px', color: '#64748b' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                  <FileText size={24} />
                </div>
                <p style={{ margin: 0, fontWeight: '700', fontSize: '1.05rem', color: '#0f172a' }}>Chưa có biểu mẫu khảo sát nào</p>
                <p style={{ margin: '0.35rem 0 1rem 0', fontSize: '0.84rem', color: '#64748b' }}>Nhấp nút thiết kế biểu mẫu mới để bắt đầu tạo câu hỏi thu thập ý kiến khách hàng.</p>
                <Button type="button" onClick={startCreateNew} className="survey-btn-primary">
                  <Plus size={16} strokeWidth={2.5} />
                  <span>Thiết kế biểu mẫu mới</span>
                </Button>
              </div>
            ) : (
              <div className="admin-survey-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                {surveysState.items.map((form) => (
                  <div className="admin-survey-form-card"
                    key={form.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '1.25rem 1.5rem',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Form Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                        <Badge variant="outline" data-quiet-label="true" style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', backgroundColor: '#f1f5f9', padding: '0.2rem 0.55rem', borderRadius: '6px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                          #{form.id}
                        </Badge>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#0f172a', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {form.tieu_de}
                        </h4>
                      </div>

                      <StatusBadge status={form.trang_thai}>

                        {form.trang_thai ? 'Đang hoạt động' : 'Tạm dừng'}
                      </StatusBadge>
                    </div>

                    {/* Form Reward / Description box */}
                    {form.mo_ta && (
                      <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.65rem 0.85rem', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Gift size={16} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span style={{ margin: 0, fontSize: '0.8125rem', color: '#334155', fontWeight: '500' }}>
                          {form.mo_ta}
                        </span>
                      </div>
                    )}

                    {/* Metadata Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#f8fafc', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <HelpCircle size={14} color="#2563eb" />
                        <strong style={{ color: '#0f172a' }}>{form.cau_hoi?.length || 0}</strong> câu hỏi
                      </div>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#64748b' }}>
                        <Calendar size={14} color="#94a3b8" />
                        <span>{new Date(form.ngay_tao || Date.now()).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>

                    {/* Action Buttons UXUI */}
                    <div data-modal-actions="true" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                      {!form.trang_thai && (
                        <Button
                          type="button"
                          className="survey-btn-activate"
                          onClick={() => onKichHoatForm(form.id)}
                          title="Kích hoạt biểu mẫu này"
                        >
                          <CheckCircle2 size={15} color="#2563eb" />
                          <span>Kích hoạt</span>
                        </Button>
                      )}

                      {branchCode && <Button variant="outline" type="button" onClick={()=>{setShareForm(form);setCopyStatus('')}}><QrCode size={15}/>Chia sẻ khảo sát</Button>}

                      <Button
                        type="button"
                        className="survey-btn-edit"
                        onClick={() => startEdit(form)}
                        title="Chỉnh sửa biểu mẫu"
                      >
                        <Edit3 size={15} color="#2563eb" />
                        <span>Sửa</span>
                      </Button>

                      <Button data-intent="danger"
                        type="button"
                        className="survey-btn-delete"
                        onClick={() => handleDeleteForm(form)}
                        title="Xóa biểu mẫu khảo sát"
                      >
                        <Trash2 size={15} color="#dc2626" />
                        <span>Xóa</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FORM EDITOR MODAL DIALOG (RULE 8 COMPLIANT) */}
          {isEditing && (
            <WorkspaceDialog
              icon={editingFormId ? Edit3 : Plus}
              title={editingFormId ? 'Chỉnh sửa biểu mẫu khảo sát' : 'Thiết kế biểu mẫu khảo sát mới'}
              subtitle={editingFormId ? `Cập nhật cấu hình và danh sách câu hỏi cho biểu mẫu #${editingFormId}` : 'Tạo mới bộ câu hỏi và cấu hình quà tặng khảo sát cho khách hàng'}
              label={editingFormId ? 'Chỉnh sửa biểu mẫu khảo sát' : 'Thiết kế biểu mẫu mới'}
              onClose={() => setIsEditing(false)}
              className="workspace-dialog--wide"
            >
              <form data-modal-frame="true" className="workspace-form" onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', overflow: 'hidden' }}>
                {/* MODAL SCROLLABLE BODY */}
                <div data-modal-body="true" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* FORM GENERAL INFO CARD */}
                  <div style={{
                    backgroundColor: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '1.35rem 1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.15rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
                  }}>
                    {/* Info Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={19} />
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                            Thông tin cơ bản biểu mẫu
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Cấu hình tên hiển thị và ưu đãi quà tặng thu hút khách hàng tham gia khảo sát
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Inputs Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Label htmlFor="survey-form-title" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Tiêu đề biểu mẫu khảo sát</span>
                          <span style={{ color: '#ef4444' }}>*</span>
                        </Label>
                        <div className="survey-input-wrapper" style={{ position: 'relative', width: '100%' }}>
                          <Tag size={17} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }} />
                          <Input id="survey-form-title" data-input-prefix="true"
                            type="text"
                            className="survey-has-icon-input !pl-11"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            placeholder="VD: Khảo sát trải nghiệm khách hàng & Chất lượng dịch vụ..."
                            required
                            style={{
                              width: '100%',
                              height: '44px',
                              paddingLeft: '44px',
                              paddingRight: '14px',
                              borderRadius: '9px',
                              border: '1.5px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              fontSize: '0.9rem',
                              fontWeight: '500',
                              color: '#0f172a',
                              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                              outline: 'none'
                            }}
                            onFocus={(e) => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.12)'; }}
                            onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Label htmlFor="survey-form-description" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Mô tả ngắn & Quà tặng trải nghiệm</span>
                        </Label>
                        <div className="survey-input-wrapper" style={{ position: 'relative', width: '100%' }}>
                          <Gift size={17} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }} />
                          <Input id="survey-form-description" data-input-prefix="true"
                            type="text"
                            className="survey-has-icon-input !pl-11"
                            value={formDesc}
                            onChange={(e) => setFormDesc(e.target.value)}
                            placeholder="VD: Nhận ngay Voucher giảm giá 15% (tối đa 50.000đ) khi hoàn tất đánh giá..."
                            style={{
                              width: '100%',
                              height: '44px',
                              paddingLeft: '44px',
                              paddingRight: '14px',
                              borderRadius: '9px',
                              border: '1.5px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              fontSize: '0.9rem',
                              fontWeight: '500',
                              color: '#0f172a',
                              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                              outline: 'none'
                            }}
                            onFocus={(e) => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.12)'; }}
                            onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                {/* QUESTIONS LIST DESIGNER */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Layers size={18} color="#2563eb" /> Danh sách câu hỏi ({questions.length})
                    </h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {questions.map((q, qIndex) => (
                      <div
                        key={q.id || qIndex}
                        id={`question-card-${q.id}`}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '1.25rem',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '260px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                minWidth: '32px',
                                minHeight: '32px',
                                borderRadius: '50%',
                                backgroundColor: '#eff6ff',
                                color: '#2563eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '700',
                                fontSize: '0.8125rem',
                                flexShrink: 0,
                                border: '1px solid #bfdbfe'
                              }}
                            >
                              #{qIndex + 1}
                            </div>
                            <Input
                              type="text"
                              value={q.tieu_de}
                              onChange={(e) => handleQuestionChange(q.id, 'tieu_de', e.target.value)}
                              placeholder="Nhập nội dung câu hỏi..."
                              required
                              style={{
                                flex: 1,
                                height: '42px',
                                padding: '0 0.85rem',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                color: '#0f172a',
                                backgroundColor: '#ffffff'
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <CustomQuestionTypeDropdown
                              value={q.loai}
                              onChange={(newType) => handleQuestionChange(q.id, 'loai', newType)}
                            />

                            <Button data-intent="danger"
                              type="button"
                              onClick={() => handleRemoveQuestion(q.id)}
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '8px',
                                border: '1px solid #fecaca',
                                backgroundColor: '#ffffff',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease'
                              }}
                              title="Xóa câu hỏi này"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>

                        {/* Question Options (Choice / Checkbox / Dropdown) */}
                        {['choice', 'checkbox', 'dropdown'].includes(q.loai) && (
                          <div style={{ paddingLeft: '2.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Các lựa chọn trả lời:</span>
                            {(q.lua_chon || []).map((opt, optIdx) => (
                              <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>•</span>
                                <Input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => handleOptionChange(q.id, optIdx, e.target.value)}
                                  placeholder={`Lựa chọn ${optIdx + 1}`}
                                  style={{
                                    flex: 1,
                                    maxWidth: '460px',
                                    height: '36px',
                                    padding: '0 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.8125rem',
                                    color: '#0f172a',
                                    backgroundColor: '#ffffff'
                                  }}
                                />
                                {(q.lua_chon || []).length > 1 && (
                                  <Button data-intent="danger"
                                    type="button"
                                    onClick={() => handleRemoveOption(q.id, optIdx)}
                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                                    title="Xóa lựa chọn"
                                  >
                                    <X size={15} />
                                  </Button>
                                )}
                              </div>
                            ))}

                            <Button
                              type="button"
                              onClick={() => handleAddOption(q.id)}
                              style={{
                                alignSelf: 'flex-start',
                                marginTop: '0.25rem',
                                background: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                padding: '0.35rem 0.85rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: '#2563eb',
                                cursor: 'pointer'
                              }}
                            >
                              + Thêm lựa chọn
                            </Button>
                          </div>
                        )}

                        {/* Mandatory Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
                          <Label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#475569', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(q.bat_buoc)}
                              onChange={(e) => handleQuestionChange(q.id, 'bat_buoc', e.target.checked)}
                              style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
                            />
                            Bắt buộc trả lời
                          </Label>
                        </div>
                      </div>
                    ))}

                    {/* Nút thêm câu hỏi ở cuối danh sách câu hỏi */}
                    <Button
                      type="button"
                      onClick={handleAddQuestion}
                      style={{
                        width: '100%',
                        height: '46px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        backgroundColor: '#f8fafc',
                        border: '1.5px dashed #93c5fd',
                        borderRadius: '10px',
                        color: '#2563eb',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        marginTop: '0.35rem',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#eff6ff'
                        e.currentTarget.style.borderColor = '#3b82f6'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8fafc'
                        e.currentTarget.style.borderColor = '#93c5fd'
                      }}
                    >
                      <Plus size={18} strokeWidth={2.5} />
                      <span>+ Thêm câu hỏi mới</span>
                    </Button>
                  </div>
                </div>
              </div>

                {/* PINNED MODAL ACTIONS FOOTER (RULE 8) */}
                <div data-modal-footer="edge" data-modal-actions="true" style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '0.85rem',
                  padding: '1.15rem 1.75rem',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)',
                  flexShrink: 0
                }}>
                  <Button data-intent="danger"
                    type="button"
                    onClick={() => setIsEditing(false)}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#475569',
                      border: '1.5px solid #cbd5e1',
                      height: '42px',
                      padding: '0 1.5rem',
                      borderRadius: '9px',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#0f172a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#475569'; }}
                  >
                    Hủy bỏ
                  </Button>
                  <Button data-intent="success"
                    type="submit"
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      height: '42px',
                      padding: '0 1.65rem',
                      borderRadius: '9px',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1d4ed8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <CheckCircle2 size={17} color="#ffffff" />
                    <span>Lưu Biểu Mẫu Khảo Sát</span>
                  </Button>
                </div>
              </form>
            </WorkspaceDialog>
          )}
        </div>
      )}

      {/* SUBTAB 2: PAGINATED RESPONSES TABLE WITH CSV EXPORT */}
      {activeSubTab === 'responses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* SEARCH & CSV EXPORT HEADER BAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
            <div className="survey-input-wrapper" style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '520px' }}>
              <Search size={17} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }} />
              <Input data-input-prefix="true"
                type="text"
                className="survey-has-icon-input !pl-11"
                placeholder="Tìm kiếm theo tên khách, SĐT, mã đơn hoặc câu trả lời..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  height: '42px',
                  paddingLeft: '44px',
                  paddingRight: searchText ? '36px' : '14px',
                  borderRadius: '9px',
                  border: '1.5px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '0.875rem',
                  color: '#0f172a',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                }}
              />
              {searchText && (
                <Button
                  type="button"
                  onClick={() => { setSearchText(''); setCurrentPage(1); }}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: '700', fontSize: '1.1rem', padding: '2px' }}
                >
                  &times;
                </Button>
              )}
            </div>

            {/* EXPORT CSV BUTTON */}
            <Button
              type="button"
              className="survey-btn-csv"
              onClick={exportResponsesToCSV}
            >
              <FileSpreadsheet size={18} color="#10b981" />
              <span>Xuất kết quả CSV</span>
            </Button>
          </div>

          {/* RESPONSES DATA TABLE */}
          {surveyResponsesState.loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Đang tải danh sách phản hồi khảo sát...</div>
          ) : filteredResponses.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', color: '#64748b' }}>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '1.05rem', color: '#0f172a' }}>Không tìm thấy bài khảo sát nào</p>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.84rem' }}>Chưa nhận được phản hồi phù hợp với từ khóa tìm kiếm của bạn.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
              <div style={{ overflowX: 'auto' }}>
                <Table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.9rem 1rem', width: '70px', textAlign: 'center', whiteSpace: 'nowrap' }}>STT</th>
                      <th style={{ padding: '0.9rem 1rem', width: '220px' }}>Khách hàng</th>
                      <th style={{ padding: '0.9rem 1rem', width: '180px', whiteSpace: 'nowrap' }}>Mã đơn hàng</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Tên khảo sát</th>
                      <th style={{ padding: '0.9rem 1rem', width: '160px', whiteSpace: 'nowrap' }}>Thời gian nộp</th>
                      <th style={{ padding: '0.9rem 1rem', width: '120px', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResponses.map((resp, idx) => {
                      const absoluteIndex = (currentPage - 1) * pageSize + idx + 1;
                      const formattedDate = resp.ngay_tao ? new Date(resp.ngay_tao) : new Date();

                      return (
                        <tr
                          key={resp.id || idx}
                          style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ padding: '0.9rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                            <Badge variant="outline" data-quiet-label="true" style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '32px',
                              height: '28px',
                              padding: '0 8px',
                              borderRadius: '7px',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              color: '#475569',
                              fontWeight: '700',
                              fontSize: '0.8125rem',
                              whiteSpace: 'nowrap',
                              lineHeight: 1
                            }}>
                              {absoluteIndex < 10 ? `0${absoluteIndex}` : absoluteIndex}
                            </Badge>
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8125rem', flexShrink: 0 }}>
                                {(resp.ten_nguoi_dung || 'K')[0].toUpperCase()}
                              </div>
                              <div>
                                <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.875rem' }}>{resp.ten_nguoi_dung || 'Khách vãng lai'}</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{resp.so_dien_thoai || 'Chưa cung cấp SĐT'}</span>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.9rem 1rem', whiteSpace: 'nowrap' }}>
                            {resp.ma_don_hang ? (
                              <Badge variant="outline" data-quiet-label="true"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace",
                                  fontWeight: '500',
                                  color: '#1e40af',
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  padding: '2.5px 7px',
                                  borderRadius: '5px',
                                  fontSize: '0.72rem',
                                  letterSpacing: '0.01em',
                                  whiteSpace: 'nowrap',
                                  wordBreak: 'keep-all',
                                  lineHeight: 1.4,
                                }}
                              >
                                {resp.ma_don_hang.startsWith('#') ? resp.ma_don_hang : `#${resp.ma_don_hang}`}
                              </Badge>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  color: '#94a3b8',
                                  fontSize: '0.75rem',
                                  fontWeight: '400',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.9rem 1rem', fontWeight: '500', color: '#1e293b' }}>
                            {resp.ten_form || 'Khảo sát chất lượng'}
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#0f172a' }}>
                              {formattedDate.toLocaleTimeString('vi-VN')}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {formattedDate.toLocaleDateString('vi-VN')}
                            </div>
                          </td>
                          <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                            <Button
                              type="button"
                              className="survey-btn-view"
                              onClick={() => setSelectedResponse(resp)}
                              title="Xem chi tiết bài khảo sát"
                            >
                              <Eye size={15} />
                              <span>Xem</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {/* PAGINATION FOOTER */}
              <div style={{ padding: '0.9rem 1.25rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Hiển thị <strong>{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredResponses.length)}</strong> trên tổng <strong>{filteredResponses.length}</strong> bài khảo sát
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ border: '1.5px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0.4rem 0.85rem', borderRadius: '7px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.45 : 1, fontSize: '0.8125rem', fontWeight: '600', color: '#334155', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                  >
                    Trang trước
                  </Button>

                  <PageNumbers page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />

                  <Button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ border: '1.5px solid #cbd5e1', backgroundColor: '#ffffff', padding: '0.4rem 0.85rem', borderRadius: '7px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.45 : 1, fontSize: '0.8125rem', fontWeight: '600', color: '#334155', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                  >
                    Trang sau
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* DETAILED RESPONSE MODAL DIALOG (RULE 8 COMPLIANT) */}
          {selectedResponse && (
            <WorkspaceDialog
              icon={Eye}
              title={`Chi tiết phản hồi bài khảo sát #${selectedResponse.id}`}
              subtitle={`Khách hàng: ${selectedResponse.ten_nguoi_dung || 'Khách vãng lai'} • Mã đơn: ${selectedResponse.ma_don_hang ? (selectedResponse.ma_don_hang.startsWith('#') ? selectedResponse.ma_don_hang : `#${selectedResponse.ma_don_hang}`) : 'Không liên kết'}`}
              label={`Chi tiết phản hồi #${selectedResponse.id}`}
              onClose={() => setSelectedResponse(null)}
              className="workspace-dialog--wide"
            >
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', overflow: 'hidden' }}>
                {/* Scrollable Modal Content */}
                <div data-modal-body="true" style={{ flex: 1, padding: '1.5rem 1.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Customer Meta 3-Card Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '600', display: 'block', textTransform: 'uppercase' }}>Họ tên khách hàng</span>
                      <strong style={{ color: '#0f172a', fontSize: '0.95rem', marginTop: '3px', display: 'block' }}>{selectedResponse.ten_nguoi_dung || 'Khách vãng lai'}</strong>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '600', display: 'block', textTransform: 'uppercase' }}>Số điện thoại</span>
                      <strong style={{ color: '#0f172a', fontSize: '0.95rem', marginTop: '3px', display: 'block' }}>{selectedResponse.so_dien_thoai || 'Chưa cung cấp'}</strong>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                      <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '600', display: 'block', textTransform: 'uppercase' }}>Mã đơn hàng</span>
                      <strong style={{ color: '#1e40af', fontSize: '0.875rem', marginTop: '3px', display: 'block', fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace", fontWeight: '500' }}>
                        {selectedResponse.ma_don_hang ? (selectedResponse.ma_don_hang.startsWith('#') ? selectedResponse.ma_don_hang : `#${selectedResponse.ma_don_hang}`) : 'Không liên kết'}
                      </strong>
                    </div>
                  </div>

                  {/* Answers breakdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                      Nội dung câu trả lời ({selectedResponse.tra_loi?.length || 0} câu):
                    </h4>

                    {(selectedResponse.tra_loi || []).map((ans, idx) => (
                      <div key={idx} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Badge variant="outline" data-quiet-label="true" style={{ fontSize: '0.75rem', fontWeight: '700', color: '#2563eb', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                            Câu {idx + 1}
                          </Badge>
                          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                            {ans.cau_hoi_tieu_de}
                          </span>
                        </div>

                        <div style={{ paddingLeft: '0.5rem', marginTop: '0.2rem' }}>
                          {typeof ans.cau_tra_loi === 'number' ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star key={i} size={16} fill={i < ans.cau_tra_loi ? '#f59e0b' : '#e2e8f0'} color={i < ans.cau_tra_loi ? '#f59e0b' : '#cbd5e1'} />
                              ))}
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.84rem', color: '#b45309', fontWeight: '700' }}>
                                {ans.cau_tra_loi}/5 sao
                              </span>
                            </div>
                          ) : Array.isArray(ans.cau_tra_loi) ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                              {ans.cau_tra_loi.map((item, i) => (
                                <Badge variant="outline" data-quiet-label="true" key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '600' }}>
                                  <Check size={13} color="#2563eb" /> {item}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.95rem', fontSize: '0.85rem', color: '#1e293b', lineHeight: 1.5 }}>
                              {ans.cau_tra_loi || <em style={{ color: '#94a3b8' }}>(Không trả lời)</em>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PINNED MODAL ACTIONS FOOTER (RULE 8) */}
                <div data-modal-footer="edge" data-modal-actions="true" style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  padding: '1.15rem 1.75rem',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.04)',
                  flexShrink: 0
                }}>
                  <Button data-intent="danger"
                    type="button"
                    onClick={() => setSelectedResponse(null)}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#475569',
                      border: '1.5px solid #cbd5e1',
                      height: '42px',
                      padding: '0 1.5rem',
                      borderRadius: '9px',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#0f172a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#475569'; }}
                  >
                    Đóng cửa sổ
                  </Button>
                </div>
              </div>
            </WorkspaceDialog>
          )}

        </div>
      )}

      {/* SUBTAB 3: GOOGLE FORMS STYLE QUESTION ANALYTICS */}
      {activeSubTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* ANALYTICS HEADER & FORM SELECTOR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff', padding: '1.1rem 1.35rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={20} color="#2563eb" /> Thống Kê Tổng Quan Theo Từng Câu Hỏi
              </h3>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Biểu đồ phân bổ tỷ lệ câu trả lời dạng trực quan chuyên sâu
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: '600', color: '#475569', whiteSpace: 'nowrap' }}>Chọn bài khảo sát:</span>
              <div style={{ width: '360px', minWidth: '280px', maxWidth: '480px' }}>
                <SearchableSelect
                  style={{ width: '100%', height: '40px' }}
                  value={selectedForm?.id ? String(selectedForm.id) : String(selectedAnalyticsFormId || '')}
                  onChange={(e) => setSelectedAnalyticsFormId(e.target.value)}
                  placeholder="Chọn bài khảo sát..."
                >
                  {activeForms.map(f => (
                    <option key={f.id} value={String(f.id)}>{f.tieu_de}</option>
                  ))}
                </SearchableSelect>
              </div>
            </div>
          </div>

          {/* OVERVIEW STATS CARDS */}
          <p className="operation-note">{totalResponses} phản hồi đã thu thập · {targetQuestions.length} câu hỏi trong biểu mẫu đang chọn.</p>

          {/* QUESTION ANALYTICS CARDS */}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '240px' }}>
                      <Badge variant="outline" data-quiet-label="true" style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                        Câu {qIdx + 1}
                      </Badge>
                      <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#0f172a' }}>
                        {q.tieu_de}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Badge variant="outline" data-quiet-label="true" style={{ fontSize: '0.75rem', color: '#475569', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontWeight: '600' }}>
                        {q.loai === 'rating' ? 'Đánh giá sao' : q.loai === 'choice' ? 'Trắc nghiệm' : q.loai === 'checkbox' ? 'Hộp kiểm' : q.loai === 'dropdown' ? 'Menu thả xuống' : 'Văn bản'}
                      </Badge>
                      <Badge variant="outline" data-quiet-label="true" style={{ fontSize: '0.75rem', color: '#059669', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontWeight: '700' }}>
                        {qAnswers.length} lượt trả lời
                      </Badge>
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
                              {starVal} <Star size={13} fill="#f59e0b" color="#f59e0b" />
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
                            <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
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
                            <span style={{ width: '180px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {optName}
                            </span>
                            <div style={{ flex: 1, backgroundColor: '#f1f5f9', height: '12px', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)',
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
                        <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>Chưa có ý kiến phản hồi bằng văn bản.</span>
                      ) : (
                        qAnswers.map((txtVal, txtIdx) => (
                          <div key={txtIdx} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.55rem 0.75rem', fontSize: '0.8125rem', color: '#1e293b', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <MessageSquare size={14} color="#69736a" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>"{String(txtVal)}"</span>
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
