import { uiText as ui, useUiLanguage, uiLocale } from "../../../lib/uiText";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CARD_IMAGE } from '../constants';
import { apiClient } from '../../../lib/apiClient';
import Swal from 'sweetalert2';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GiftIcon,
  SparklesIcon,
  CheckCircleIcon,
  CreditCardIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  ShieldCheckIcon,
} from '../../../components/common/icons';
import GiftCardRedeemModal from '../../../components/modals/GiftCardRedeemModal';

const SUGGESTED_MESSAGES = [
  "☕ Mời bạn ly cà phê thật ngon, chúc bạn một ngày tràn đầy năng lượng!",
  "🎉 Chúc mừng bạn nhé! Luôn vui vẻ, may mắn và gặt hái nhiều thành công!",
  "💖 Món quà nhỏ thay lời cảm ơn chân thành từ mình vì đã luôn đồng hành!",
  "✨ Một chút ngọt ngào cho ngày thêm tươi tắn!",
];

export const GiftCardForm = () => {
  useUiLanguage();
  const purchaseBusy = useRef(false);
  const queryClient = useQueryClient();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);
  const activeUserId = user?.ma_nguoi_dung || user?.maNguoiDung || user?.id;

  const [selectedAmount, setSelectedAmount] = useState('100000');
  const [senderName, setSenderName] = useState(user?.ho_ten || user?.hoTen || '');
  const [senderEmail, setSenderEmail] = useState(user?.email || '');
  const [senderPhone, setSenderPhone] = useState(user?.so_dien_thoai || user?.soDienThoai || '');
  const [giveMyself, setGiveMyself] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState('default');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);

  const amounts = [
    { value: '100000', label: '100.000 VNĐ', tag: 'Phổ biến' },
    { value: '200000', label: '200.000 VNĐ' },
    { value: '300000', label: '300.000 VNĐ' },
    { value: '500000', label: '500.000 VNĐ', tag: 'Tri ân' },
    { value: '1000000', label: '1.000.000 VNĐ', tag: 'Cao cấp' },
  ];

  // Fetch Wallet Balance
  const { data: walletData, refetch: refetchWallet } = useQuery({
    queryKey: ['userWallet', activeUserId],
    queryFn: async () => {
      if (!activeUserId) return null;
      try {
        const res = await apiClient.get(`/customers/${activeUserId}/wallet`);
        return res.data?.data || res.data;
      } catch {
        return null;
      }
    },
    enabled: Boolean(activeUserId),
  });

  const walletBalance = Number(walletData?.wallet?.balance ?? walletData?.balance ?? 0);

  // Fetch Themes from API
  const { data: dbThemes = [] } = useQuery({
    queryKey: ['giftCardThemes'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/gift-cards/themes?t=' + Date.now());
        return res.data || [];
      } catch (err) {
        console.error("LỖI FETCH THEMES:", err);
        return [];
      }
    },
  });

  const themes = dbThemes.length > 0 ? dbThemes : [
    { id: 'default', name: "Mặc định (Đỏ Avengers)", color: '#b22830', collection_name: 'Mặc định' },
    { id: 'thankyou_1', name: 'Thank You Fan', color: '#795548', collection_name: 'Thank You 2026' },
    { id: 'thankyou_2', name: 'Thank You Trắng', color: '#f5f5f5', collection_name: 'Thank You 2026' },
    { id: 'thankyou_3', name: 'Thank You Nâu', color: '#5d4037', collection_name: 'Thank You 2026' },
  ];

  // Collections list for tabs
  const collections = useMemo(() => {
    const list = Array.from(new Set(themes.map(t => t.collection_name).filter(Boolean)));
    return ['all', ...list];
  }, [themes]);

  // Filtered themes
  const filteredThemes = useMemo(() => {
    if (selectedCollection === 'all') return themes;
    return themes.filter(t => t.collection_name === selectedCollection);
  }, [themes, selectedCollection]);

  // Auto-select first theme
  useEffect(() => {
    if (themes.length > 0 && theme === 'default') {
      setTheme(themes[0].id);
    }
  }, [themes]);

  useEffect(() => {
    if (giveMyself) {
      setRecipientName(senderName);
      setRecipientEmail(senderEmail);
      setRecipientPhone(senderPhone);
    } else {
      setRecipientName('');
      setRecipientEmail('');
      setRecipientPhone('');
    }
  }, [giveMyself, senderName, senderEmail, senderPhone]);

  const currentThemeObj = themes.find(t => t.id === theme) || themes[0];

  // Map theme to authentic high-res card artwork
  const getCardArtwork = (th) => {
    if (!th) return '/images/cards/festive_1.png';
    const id = String(th.id || '').trim();
    if (['chill_1', 'chill_2', 'chill_3', 'tet_2025', 'festive_1', 'festive_2', 'thankyou_1', 'thankyou_2', 'thankyou_3'].includes(id)) {
      return `/images/cards/${id}.png`;
    }
    if (th.image_url) return th.image_url;
    return '/images/cards/festive_1.png';
  };


  const handlePurchase = async () => {
    if (purchaseBusy.current) return;
    if (!activeUserId || !localStorage.getItem('token')) {
      await Swal.fire({
        title: ui('Đăng nhập để mua thẻ quà tặng'),
        text: ui('Thẻ quà tặng được thanh toán an toàn trực tiếp từ số dư ví Avengers của bạn.'),
        icon: 'info',
        confirmButtonColor: '#b22830',
        confirmButtonText: ui('Đến trang đăng nhập'),
      });
      window.location.assign('/?tab=login');
      return;
    }

    if (!senderName || !senderEmail || !recipientName || !recipientEmail) {
      Swal.fire({
        title: ui('Thiếu thông tin bắt buộc'),
        text: ui('Vui lòng điền đầy đủ họ tên và email của người gửi cũng như người nhận.'),
        icon: 'warning',
        confirmButtonColor: '#b22830',
      });
      return;
    }

    const cost = Number(selectedAmount);
    if (walletBalance < cost) {
      Swal.fire({
        title: ui('Số dư ví không đủ'),
        text: ui('Số dư ví hiện tại ({{v0}}đ) không đủ để thanh toán thẻ {{v1}}đ. Vui lòng nạp thêm tiền vào ví.', {
          v0: walletBalance.toLocaleString(uiLocale()),
          v1: cost.toLocaleString(uiLocale()),
        }),
        icon: 'warning',
        confirmButtonColor: '#b22830',
        confirmButtonText: ui('Đến Ví của tôi'),
        showCancelButton: true,
        cancelButtonText: ui('Để sau'),
      }).then((res) => {
        if (res.isConfirmed) {
          window.location.assign('/?tab=profile');
        }
      });
      return;
    }

    purchaseBusy.current = true;
    setIsLoading(true);
    try {
      const payload = {
        value: cost,
        sender_id: activeUserId,
        sender_name: senderName,
        receiver_email: recipientEmail,
        receiver_phone: recipientPhone || undefined,
        receiver_name: recipientName,
        message: message,
        theme: theme,
      };

      const res = await apiClient.post('/gift-cards/purchase', payload);

      if (res.data.success) {
        refetchWallet();
        queryClient.invalidateQueries({ queryKey: ['userWallet', activeUserId] });
        queryClient.invalidateQueries({ queryKey: ['myGiftCards', activeUserId] });

        await Swal.fire({
          title: ui('Mua thẻ quà tặng thành công!'),
          html: `
            <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #334155;">
              <p style="margin-bottom: 8px;">Đã thanh toán <strong>${cost.toLocaleString(uiLocale())} đ</strong> từ ví Avengers.</p>
              <div style="background: #f8fafc; border: 1.5px dashed #cbd5e1; padding: 12px; border-radius: 12px; margin: 12px 0; text-align: center;">
                <span style="font-size: 12px; color: #64748b; display: block;">MÃ THẺ QUÀ TẶNG</span>
                <strong style="font-size: 20px; color: #b22830; letter-spacing: 1px;">${res.data.data.code}</strong>
              </div>
              <p style="font-size: 13px; color: #475569;">
                ${res.data.email_status === 'SENT' ? '✉️ Thư chúc mừng và mã nạp thẻ đã được gửi tự động đến email người nhận.' : '⚠️ Email tạm thời chưa gửi được. Bạn có thể sao chép mã thẻ trên gửi trực tiếp cho người nhận.'}
              </p>
            </div>
          `,
          icon: 'success',
          confirmButtonColor: '#b22830',
          confirmButtonText: ui('Tuyệt vời'),
        });

        if (!giveMyself) {
          setRecipientName('');
          setRecipientEmail('');
          setRecipientPhone('');
        }
        setMessage('');
      }
    } catch (err) {
      Swal.fire({
        title: ui('Giao dịch chưa hoàn tất'),
        text: ui(err.response?.data?.message || 'Không thể mua thẻ lúc này. Vui lòng thử lại!'),
        icon: 'error',
        confirmButtonColor: '#b22830',
      });
    } finally {
      purchaseBusy.current = false;
      setIsLoading(false);
    }
  };

  return (
    <section className="bg-[#fcfaf7] py-12 px-4 sm:px-6 font-sans">
      <div className="max-w-[1080px] mx-auto">
        {/* Top Banner: Nạp Thẻ Quà Tặng Shortcut */}
        <div className="mb-8 p-4 sm:p-5 bg-gradient-to-r from-red-50 via-white to-amber-50 rounded-2xl border border-red-100 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#b22830] text-white flex items-center justify-center shadow-xs">
              <GiftIcon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900">{ui("Bạn đã có mã thẻ quà tặng Avengers Coffee?")}</h4>
              <p className="text-xs text-stone-500">{ui("Nạp tiền trực tiếp vào ví để thanh toán đồ uống tại quán hoặc đặt hàng online.")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsRedeemModalOpen(true)}
            className="px-5 py-2.5 bg-white text-[#b22830] hover:bg-[#b22830] hover:text-white border border-[#b22830] rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            {ui("Nạp mã thẻ ngay")}
          </button>
        </div>

        {/* ── KHỐI CHÍNH TẠO THẺ QUÀ TẶNG ── */}
        <div className="bg-white rounded-[28px] shadow-sm border border-stone-200/80 overflow-hidden">
          {/* Header */}
          <div className="p-8 sm:p-10 text-center bg-gradient-to-b from-[#fffaf7] to-white border-b border-stone-100">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100/70 text-[#b22830] text-xs font-bold mb-3">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>{ui("Avengers E-Gift Card")}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-3 tracking-tight">
              {ui("Thiết Kế & Gửi Tặng Thẻ Quà Tặng")}
            </h2>
            <p className="text-stone-500 text-sm max-w-[620px] mx-auto leading-relaxed">
              {ui("Món quà tinh tế trao trọn yêu thương. Thẻ quà tặng điện tử được nạp trực tiếp vào ví người nhận và áp dụng trên toàn bộ hệ thống Avengers Coffee.")}
            </p>

            {/* Collection Filter Tabs */}
            {collections.length > 2 && (
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {collections.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedCollection(col)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      selectedCollection === col
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {col === 'all' ? ui('Tất cả bộ sưu tập') : col}
                  </button>
                ))}
              </div>
            )}

            {/* Theme Pills Selection with guaranteed high-contrast & color swatches */}
            <div className="flex flex-wrap justify-center gap-2.5 mt-5">
              {filteredThemes.map((t) => {
                const isSelected = theme === t.id;
                const isLight = t.color === '#f5f5f5' || t.color === '#ffffff' || t.color === '#ffd600';
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-50 text-[#b22830] border-2 border-[#b22830] shadow-xs'
                        : 'bg-white text-stone-700 border border-stone-200 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    {/* Swatch indicator with border so white/cream is clearly defined */}
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 flex-shrink-0 shadow-2xs"
                      style={{ backgroundColor: t.color || '#b22830' }}
                    />
                    <span>{ui(t.name || t.label)}</span>
                  </button>
                );
              })}
            </div>

            {/* ── CARD PREVIEW SHOWCASE ── */}
            <div className="mt-8 flex justify-center">
              <div className="relative aspect-[1.586/1] w-full max-w-[460px] rounded-2xl overflow-hidden shadow-xl border border-stone-200 transition-transform duration-300 hover:scale-[1.01]">
                <img
                  src={getCardArtwork(currentThemeObj)}
                  alt="Avengers Coffee Card"
                  className="w-full h-full object-cover"
                />

                {/* Live Value Tag */}
                <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-md border border-white/80">
                  <span className="text-xs font-bold text-[#b22830]">
                    {Number(selectedAmount).toLocaleString(uiLocale())} VNĐ
                  </span>
                </div>

                {/* Live Recipient Tag */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs font-medium text-white drop-shadow">
                  <span className="bg-black/45 backdrop-blur-sm px-3 py-1 rounded-lg max-w-[220px] truncate text-white">
                    {recipientName ? `${ui('Gửi tặng:')} ${recipientName}` : ui('Dành tặng người thương')}
                  </span>
                  <span className="bg-black/45 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] tracking-widest uppercase text-white/90">
                    AVENGERS CARD
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8 sm:p-10 space-y-8">
            {/* 1. Mệnh giá quà tặng */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <CreditCardIcon className="w-4 h-4 text-[#b22830]" />
                  <span>{ui("1. Chọn mệnh giá thẻ")} *</span>
                </label>
                {activeUserId && (
                  <span className="text-xs text-stone-500">
                    {ui("Số dư ví của bạn:")}{' '}
                    <strong className="text-stone-900 font-bold">
                      {walletBalance.toLocaleString(uiLocale())} đ
                    </strong>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {amounts.map((a) => {
                  const isSelected = selectedAmount === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setSelectedAmount(a.value)}
                      className={`relative p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? 'border-[#b22830] bg-red-50/70 text-[#b22830] font-bold shadow-xs'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      {a.tag && (
                        <span className="absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-md bg-[#b22830] text-white text-[10px] font-bold">
                          {a.tag}
                        </span>
                      )}
                      <span className="text-sm font-bold">{ui(a.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Thông tin người gửi & người nhận (2 Cột đẹp mắt) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-stone-100">
              {/* Cột người gửi */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-stone-600" />
                  <span>{ui("2. Thông tin người gửi")}</span>
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5">{ui("Họ và tên người gửi")} *</label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder={ui("Nguyễn Văn A")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:border-[#b22830] focus:ring-2 focus:ring-red-100 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5">{ui("Email người gửi")} *</label>
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="nguoigui@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:border-[#b22830] focus:ring-2 focus:ring-red-100 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5">{ui("Số điện thoại")}</label>
                  <input
                    type="tel"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    placeholder="0912 345 678"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:border-[#b22830] focus:ring-2 focus:ring-red-100 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Cột người nhận */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <EnvelopeIcon className="w-4 h-4 text-stone-600" />
                    <span>{ui("3. Thông tin người nhận")}</span>
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-[#b22830]">
                    <input
                      type="checkbox"
                      checked={giveMyself}
                      onChange={(e) => setGiveMyself(e.target.checked)}
                      className="rounded accent-[#b22830] w-4 h-4"
                    />
                    <span>{ui("Tự tặng chính mình")}</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5">{ui("Họ và tên người nhận")} *</label>
                  <input
                    type="text"
                    value={recipientName}
                    disabled={giveMyself}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder={ui("Trần Thị B")}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                      giveMyself ? 'bg-stone-100 text-stone-500 border-stone-200' : 'border-stone-200 focus:border-[#b22830] focus:ring-2 focus:ring-red-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5">{ui("Email nhận mã thẻ")} *</label>
                  <input
                    type="email"
                    value={recipientEmail}
                    disabled={giveMyself}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="nguoinhan@example.com"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                      giveMyself ? 'bg-stone-100 text-stone-500 border-stone-200' : 'border-stone-200 focus:border-[#b22830] focus:ring-2 focus:ring-red-100'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5">{ui("Số điện thoại người nhận")}</label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    disabled={giveMyself}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="0987 654 321"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                      giveMyself ? 'bg-stone-100 text-stone-500 border-stone-200' : 'border-stone-200 focus:border-[#b22830] focus:ring-2 focus:ring-red-100'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* 3. Lời nhắn gửi */}
            <div className="pt-4 border-t border-stone-100">
              <label className="block text-sm font-bold text-stone-900 mb-2">
                {ui("4. Lời nhắn nhủ gửi kèm thiệp")}
              </label>

              {/* Gợi ý câu chúc nhanh */}
              <div className="flex flex-wrap gap-2 mb-3">
                {SUGGESTED_MESSAGES.map((msg, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMessage(msg)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-red-50 hover:text-[#b22830] transition-colors cursor-pointer"
                  >
                    {msg}
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 255))}
                rows={3}
                placeholder={ui("Nhập lời chúc hoặc tâm tư bạn muốn gửi tới người nhận...")}
                className="w-full p-3.5 rounded-xl border border-stone-200 text-sm focus:border-[#b22830] focus:ring-2 focus:ring-red-100 outline-none transition-all resize-vertical"
              />
              <div className="text-right text-xs text-stone-400 mt-1">
                {255 - message.length} {ui("ký tự còn lại")}
              </div>
            </div>

            {/* Thanh toán & Submit button */}
            <div className="pt-6 border-t border-stone-100 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-stone-500 block">{ui("Tổng thanh toán qua Ví:")}</span>
                <strong className="text-2xl font-bold text-[#b22830]">
                  {Number(selectedAmount).toLocaleString(uiLocale())} VNĐ
                </strong>
                {activeUserId && walletBalance < Number(selectedAmount) && (
                  <span className="block text-xs font-semibold text-amber-600 mt-1">
                    ⚠️ {ui("Số dư ví không đủ (hiện có: {{v0}}đ)", { v0: walletBalance.toLocaleString(uiLocale()) })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMessage('');
                    if (!giveMyself) {
                      setRecipientName('');
                      setRecipientEmail('');
                      setRecipientPhone('');
                    }
                  }}
                  className="px-5 py-3 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-sm font-semibold transition-colors cursor-pointer"
                >
                  {ui("Làm lại")}
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handlePurchase}
                  className={`px-8 py-3.5 bg-gradient-to-r from-[#b22830] to-[#8c1f24] text-white font-bold rounded-xl text-sm transition-all shadow-md cursor-pointer ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'
                  }`}
                >
                  {isLoading ? ui("Đang tạo thẻ...") : ui("Xác Nhận Thanh Toán")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nạp Tiền Bằng Thẻ Quà Tặng */}
      <GiftCardRedeemModal
        isOpen={isRedeemModalOpen}
        onClose={() => setIsRedeemModalOpen(false)}
        userId={activeUserId}
        onSuccess={() => {
          refetchWallet();
          queryClient.invalidateQueries({ queryKey: ['userWallet', activeUserId] });
          setIsRedeemModalOpen(false);
        }}
      />
    </section>
  );
};
