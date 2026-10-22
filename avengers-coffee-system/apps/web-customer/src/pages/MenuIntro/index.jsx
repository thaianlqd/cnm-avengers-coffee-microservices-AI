import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
import { menuCategoryLabel } from '../../lib/categoryLabels';
import { useTranslation } from 'react-i18next';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ArrowLongRightIcon, ArrowLongLeftIcon } from '../../components/common/icons';

/* ────────────────────────────────────────────────────────
   DATA: Nội dung giới thiệu chi tiết, giàu cảm xúc & thiết kế đẳng cấp
   ──────────────────────────────────────────────────────── */
const GROUP_THEMES = {
  coffee: {
    bg: '#65161d',
    textColor: '#fff',
    titleColor: '#d4af37', // Vàng hoàng gia sang trọng
    descColor: '#e2f0d9',
    accentColor: '#d4af37',
    btnBg: 'transparent',
    btnBorder: '#d4af37',
    btnText: '#d4af37',
    btnHoverBg: '#d4af37',
    btnHoverText: '#0f2316',
    title: 'CÀ PHÊ VIỆT NAM',
    banner: '/hc-assets/web_banner_2000x2000.jpg',
  },
  tea: {
    bg: 'linear-gradient(145deg, #f3f7f0 0%, #dbead5 60%, #cbdcbf 100%)',
    textColor: '#2c402e',
    titleColor: '#8a4b16', // Nâu ấm
    descColor: '#3a513c',
    accentColor: '#1a5f20',
    btnBg: 'transparent',
    btnBorder: '#8a4b16',
    btnText: '#8a4b16',
    btnHoverBg: '#8a4b16',
    btnHoverText: '#fff',
    title: 'TRÀ HIGHLANDS',
    banner: '/hc-assets/slider_1.jpg',
  },
  freeze: {
    bg: 'linear-gradient(145deg, #e6f3ee 0%, #cce5da 60%, #b2d7c5 100%)',
    textColor: '#1a4331',
    titleColor: '#105234',
    descColor: '#2b5e46',
    accentColor: '#105234',
    btnBg: 'transparent',
    btnBorder: '#105234',
    btnText: '#105234',
    btnHoverBg: '#105234',
    btnHoverText: '#fff',
    title: 'FREEZE ĐÁ XAY',
    banner: '/hc-assets/2.png',
  },
  other: {
    bg: 'linear-gradient(145deg, #fffbf4 0%, #fdebd0 60%, #fad7a0 100%)',
    textColor: '#4d3319',
    titleColor: '#5e370e',
    descColor: '#664c33',
    accentColor: '#873a14',
    btnBg: 'transparent',
    btnBorder: '#5e370e',
    btnText: '#5e370e',
    btnHoverBg: '#5e370e',
    btnHoverText: '#fff',
    title: 'BÁNH & ĐỒ ĂN',
    banner: '/hc-assets/1_1.jpg',
  }
};

const MENU_COPY = {
  coffee: ['Cà phê phin, espresso và những lựa chọn quen thuộc cho mỗi ngày.', 'Vietnamese coffee, espresso and familiar everyday favourites.'],
  tea: ['Trà thanh nhẹ, trà sữa và vị trái cây cho một khoảng nghỉ mát lành.', 'Refreshing tea, milk tea and fruit flavours for your afternoon break.'],
  freeze: ['Đá xay mát lạnh. Chọn hương vị và tùy chỉnh theo sở thích của bạn.', 'Cool blended drinks. Choose a flavour and make it your own.'],
  other: ['Bánh, món ăn nhẹ và những lựa chọn để thưởng thức cùng đồ uống.', 'Bakery treats, light bites and more to enjoy with your drink.']
};

function getSubcatDesc(name, lang, themeKey) {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('thẻ quà') || normalized.includes('gift')) return lang === 'en' ? 'A gift for someone you care about. Explore available gift cards.' : 'Một món quà cho người bạn yêu quý. Khám phá các lựa chọn thẻ quà tặng.';
  if (normalized === 'khác' || normalized === 'others') return lang === 'en' ? 'Merchandise, toppings and more choices for your coffee break.' : 'Sản phẩm lưu niệm, topping và những lựa chọn cho giờ cà phê.';
  const group = themeKey || getGroupThemeKey(name);
  return MENU_COPY[group][lang === 'en' ? 1 : 0];
}

function getGroupThemeKey(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('cà phê') || n.includes('coffee') || n.includes('ca phe')) return 'coffee';
  if (n.includes('trà') || n.includes('tea') || n.includes('tra')) return 'tea';
  if (n.includes('đá xay') || n.includes('freeze') || n.includes('da xay')) return 'freeze';
  return 'other';
}

function getProductCategoryId(p) {
  return String(p?.danhMuc?.ma_danh_muc || p?.ma_danh_muc || '');
}

/* ────────────────────────────────────────────────────────
   CAROUSEL TỰ ĐỘNG CHẠY (Auto-playing Slide) Cho Cấp 3
   ──────────────────────────────────────────────────────── */
function AutoPlayProductCarousel({ items, onSelect }) {
  useUiLanguage();
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(4);
  const timerRef = useRef(null);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 520) setPerPage(1);
      else if (window.innerWidth <= 768) setPerPage(2);
      else if (window.innerWidth <= 1024) setPerPage(3);
      else setPerPage(4);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  const startAutoPlay = () => {
    stopAutoPlay();
    if (totalPages > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') setPage(prev => (prev + 1) % totalPages);
      }, 5000); // 5 giây tự động lật trang
    }
  };

  const stopAutoPlay = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages - 1));
    startAutoPlay();
    return () => stopAutoPlay();
  }, [totalPages, perPage]);

  const visible = items.slice(page * perPage, page * perPage + perPage);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={stopAutoPlay}
      onMouseLeave={startAutoPlay}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perPage}, 1fr)`, gap: '20px' }}>
        {visible.map(p => (
          <div
            key={p.ma_san_pham}
            onClick={() => onSelect?.(p)}
            style={{
              background: '#ffffff',
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px solid #efeae2',
              cursor: 'pointer',
              textAlign: 'center',
              padding: '0 0 16px',
              boxShadow: '0 4px 15px rgba(74, 55, 40, 0.04)',
              transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-6px)';
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(74, 55, 40, 0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(74, 55, 40, 0.04)';
            }}
          >
            <div style={{ aspectRatio: '1.05', overflow: 'hidden', background: '#fcfbf9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
              <img loading="lazy" decoding="async"
                src={p.hinh_anh_url}
                alt={p.ten_san_pham}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transition: 'transform 0.3s ease' }}
                className="carousel-img"
              />
            </div>
            <div style={{ padding: '0 16px' }}>
              <p style={{ fontWeight: 700, fontSize: '14px', textTransform: '', color: '#4a3728', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '38px' }}>
                {p.ten_san_pham}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <span style={{ fontSize: '11px', color: '#8c7b6b', fontWeight: 700 }}>Avengers Coffee</span>
                <div className="menu-intro-page" style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#b22830' }}></div>
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#b22830', whiteSpace: 'nowrap' }}>
                  {Number(p.gia_ban).toLocaleString(uiLocale())}{ui(" đ")}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
          <button
            type="button"
            onClick={() => {
              setPage(prev => (prev - 1 + totalPages) % totalPages);
              stopAutoPlay();
            }}
            style={{
              width: '42px', height: '42px', borderRadius: '50%', border: '1px solid #d1c7b7',
              background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a3728',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#b22830'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#d1c7b7'}
          >
            <ChevronLeftIcon style={{ width: '18px', height: '18px' }} />
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPage(idx);
                  stopAutoPlay();
                }}
                style={{
                  width: idx === page ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: idx === page ? '#b22830' : '#d1c7b7',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setPage(prev => (prev + 1) % totalPages);
              stopAutoPlay();
            }}
            style={{
              width: '42px', height: '42px', borderRadius: '50%', border: '1px solid #d1c7b7',
              background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a3728',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#b22830'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#d1c7b7'}
          >
            <ChevronRightIcon style={{ width: '18px', height: '18px' }} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export default function MenuIntroPage({
  categories = [],
  products = [],
  activeCategoryId = 'all',
  onCategoryChange,
  onOrderProduct
}) {
  useUiLanguage();
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const copy = (vi, en) => lang === 'en' ? en : vi;
  const categoryLabel = name => menuCategoryLabel(name, lang);

  const parentCategories = useMemo(() => {
    return categories.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha);
  }, [categories]);

  const dynamicBigGroups = useMemo(() => {
    return parentCategories.map(parent => {
      const themeKey = getGroupThemeKey(parent.ten_danh_muc);
      const theme = GROUP_THEMES[themeKey] || GROUP_THEMES.other;
      return {
        id: `group-${parent.ma_danh_muc}`,
        themeKey,
        theme,
        parentCat: parent,
      };
    });
  }, [parentCategories]);

  const viewState = useMemo(() => {
    if (activeCategoryId === 'all') return 'overview';
    if (String(activeCategoryId).startsWith('group-')) return 'category';
    return 'subcategory';
  }, [activeCategoryId]);

  const currentBigGroup = useMemo(() => {
    if (viewState === 'overview') return null;
    if (viewState === 'category') {
      return dynamicBigGroups.find(g => g.id === String(activeCategoryId)) || dynamicBigGroups[0];
    }
    const subcat = categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId));
    if (!subcat) return dynamicBigGroups[0];
    return dynamicBigGroups.find(g => String(g.parentCat.ma_danh_muc) === String(subcat.ma_danh_muc_cha)) || dynamicBigGroups[0];
  }, [viewState, activeCategoryId, categories, dynamicBigGroups]);

  const currentSubcategories = useMemo(() => {
    if (!currentBigGroup) return [];
    return categories.filter(c => String(c.ma_danh_muc_cha) === String(currentBigGroup.parentCat.ma_danh_muc));
  }, [currentBigGroup, categories]);

  const subcategoryProducts = useMemo(() => {
    if (viewState !== 'subcategory') return [];
    return products.filter(p => getProductCategoryId(p) === String(activeCategoryId));
  }, [viewState, activeCategoryId, products]);

  const currentSubcat = useMemo(() => {
    if (viewState !== 'subcategory') return null;
    return categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId));
  }, [viewState, activeCategoryId, categories]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeCategoryId]);

  /* ════════════════════════════════════════════════════
     CẤP 1: TỔNG QUAN THỰC ĐƠN (Giao diện premium)
     ════════════════════════════════════════════════════ */
  if (viewState === 'overview') {
    return (
      <div className="menu-intro-page" style={{ width: '100%', minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
        {dynamicBigGroups.map((group, idx) => {
          const theme = group.theme;
          const isReversed = idx % 2 !== 0;

          const subcats = categories.filter(c => String(c.ma_danh_muc_cha) === String(group.parentCat.ma_danh_muc));
          const subcatIds = new Set(subcats.map(s => String(s.ma_danh_muc)));
          const sampleProduct = products.find(p => subcatIds.has(getProductCategoryId(p)));

          return (
            <section
              key={group.id}
              style={{
                background: theme.bg,
                padding: '64px 0',
                position: 'relative',
                overflow: 'hidden',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {/* Decorative Glow Elements */}
              <div style={{
                position: 'absolute',
                top: '10%',
                left: isReversed ? '10%' : '60%',
                width: '350px',
                height: '350px',
                borderRadius: '50%',
                background: theme.themeKey === 'coffee' ? 'rgba(212, 175, 55, 0.08)' : 'rgba(26, 95, 32, 0.08)',
                filter: 'blur(80px)',
                pointerEvents: 'none',
              }} />

              <div style={{
                maxWidth: '1240px',
                margin: '0 auto',
                padding: '0 40px',
                display: 'flex',
                flexDirection: isReversed ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: '48px',
                flexWrap: 'wrap',
              }}>
                {/* Text content */}
                <div style={{ flex: '1 1 500px', minWidth: 0, zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>

                    <span style={{ fontSize: '13px', fontWeight: 700, textTransform: '', letterSpacing: '1px', color: theme.accentColor }}>
                      {copy('Thực đơn Avengers', 'Avengers menu')}
                    </span>
                  </div>

                  <h2 style={{
                    fontSize: 'clamp(32px, 4vw, 48px)',
                    fontWeight: 700,
                    textTransform: '',
                    color: theme.titleColor,
                    margin: '0 0 28px',
                    lineHeight: 1.15,
                    fontFamily: "var(--font-sans)",
                    letterSpacing: '1px',
                  }}>
                    {categoryLabel(group.parentCat.ten_danh_muc)}
                  </h2>

                  <p style={{
                    fontSize: '15.5px',
                    lineHeight: 1.9,
                    color: theme.descColor,
                    margin: '0 0 36px',
                    fontWeight: 500,
                    textAlign: 'left',
                  }}>
                    {getSubcatDesc(group.parentCat.ten_danh_muc, lang, group.themeKey)}
                  </p>

                  <button
                    type="button"
                    onClick={() => onCategoryChange?.(group.id)}
                    style={{
                      padding: '16px 42px',
                      background: theme.btnBg,
                      border: `2px solid ${theme.btnBorder}`,
                      color: theme.btnText,
                      fontSize: '13px',
                      fontWeight: 700,
                      borderRadius: '4px',
                      textTransform: '',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = theme.btnHoverBg;
                      e.currentTarget.style.color = theme.btnHoverText;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = theme.btnBg;
                      e.currentTarget.style.color = theme.btnText;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <span>{copy('KHÁM PHÁ NGAY', 'EXPLORE')}</span>
                    <ArrowLongRightIcon style={{ width: '18px', height: '18px' }} />
                  </button>
                </div>

                {/* Image Showcase */}
                <div style={{
                  flex: '1 1 400px',
                  minWidth: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  zIndex: 2,
                }}>
                  <div style={{
                    width: '100%',
                    maxWidth: '460px',
                    aspectRatio: '1',
                    borderRadius: '6px',
                    background: theme.themeKey === 'coffee' ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '20px',
                  }}>
                    <img loading="lazy" decoding="async"
                      src={sampleProduct?.hinh_anh_url || theme.banner}
                      alt={categoryLabel(group.parentCat.ten_danh_muc)}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.35))',
                        transform: 'scale(1.05)',
                        transition: 'transform 0.5s ease',
                      }}
                      onError={e => { e.currentTarget.src = theme.banner; }}
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     CẤP 2: CÁC DANH MỤC CON CỦA 1 NHÓM CHA
     ════════════════════════════════════════════════════ */
  if (viewState === 'category' && currentBigGroup) {

    return (
      <div className="menu-intro-page" style={{ width: '100%', minHeight: '100vh', background: '#fdfbfa', fontFamily: "var(--font-sans)" }}>
        {/* Breadcrumb */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 40px 0' }}>
          <nav style={{ fontSize: '11px', fontWeight: 700, color: '#a09080', textTransform: '', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => onCategoryChange?.('all')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a09080', fontSize: '11px', fontWeight: 700, textTransform: '', letterSpacing: '2px', padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = '#b22830'}
              onMouseLeave={e => e.currentTarget.style.color = '#a09080'}
            >
              {copy('Thực đơn', 'Menu')}
            </button>
            <span>/</span>
            <span style={{ color: '#4a3728' }}>{categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}</span>
          </nav>
        </div>

        {/* Header Hero Intro */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 40px 60px' }}>
          <div style={{ borderLeft: '4px solid #b22830', paddingLeft: '24px' }}>
            <h1 style={{
              fontSize: '48px', fontWeight: 700, textTransform: '',
              color: '#4a3728', margin: '0 0 16px', lineHeight: 1.1,
              fontFamily: "var(--font-sans)",
            }}>
              {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}
            </h1>
            <p style={{
              fontSize: '16px', lineHeight: 1.9, color: '#6d5746',
              margin: 0, fontWeight: 500, maxWidth: '800px',
              textAlign: 'left',
            }}>
              {getSubcatDesc(currentBigGroup.parentCat.ten_danh_muc, lang, currentBigGroup.themeKey)}
            </p>
          </div>
        </div>

        {/* Danh sách các danh mục con */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px 80px' }}>
          {currentSubcategories.map((subcat, idx) => {
            const subcatProds = products.filter(p => getProductCategoryId(p) === String(subcat.ma_danh_muc));
            const featuredProducts = subcatProds.slice(0, 2);
            const isReversed = idx % 2 !== 0;

            return (
              <div key={subcat.ma_danh_muc} style={{
                marginBottom: '60px',
                padding: '40px',
                background: '#ffffff',
                borderRadius: '6px',
                boxShadow: '0 10px 30px rgba(74, 55, 40, 0.03)',
                border: '1px solid #efeae2',
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: isReversed ? 'row-reverse' : 'row',
                  gap: '60px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}>
                  {/* Cột chữ bên trái */}
                  <div style={{ flex: '1 1 450px', minWidth: '280px' }}>
                    <h2 style={{
                      fontSize: '34px',
                      fontWeight: 700,
                      textTransform: '',
                      color: '#4a3728',
                      margin: '0 0 20px',
                      lineHeight: 1.2,
                      fontFamily: "var(--font-sans)",
                    }}>
                      {categoryLabel(subcat.ten_danh_muc)}
                    </h2>
                    <p style={{
                      fontSize: '14.5px',
                      lineHeight: 1.85,
                      color: '#6d5746',
                      margin: '0 0 32px',
                      fontWeight: 500,
                      textAlign: 'left',
                    }}>
                      {getSubcatDesc(subcat.ten_danh_muc, lang, currentBigGroup.themeKey)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onCategoryChange?.(subcat.ma_danh_muc)}
                      style={{
                        padding: '14px 36px',
                        background: '#b22830',
                        border: 'none',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '4px',
                        textTransform: '',
                        letterSpacing: '2px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 15px rgba(178, 40, 48, 0.2)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#8c1f25';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#b22830';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span>{copy('KHÁM PHÁ SẢN PHẨM', 'VIEW PRODUCTS')}</span>
                      <ArrowLongRightIcon style={{ width: '16px', height: '16px' }} />
                    </button>
                  </div>

                  {/* Cột sản phẩm featured bên phải */}
                  {featuredProducts.length > 0 && (
                    <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {featuredProducts.map(prod => (
                        <div key={prod.ma_san_pham} style={{
                          display: 'flex', gap: '16px', alignItems: 'center',
                          background: '#fdfbfa', borderRadius: '16px', padding: '16px',
                          border: '1px solid #efeae2',
                        }}>
                          <img loading="lazy" decoding="async"
                            src={prod.hinh_anh_url}
                            alt={prod.ten_san_pham}
                            style={{ width: '76px', height: '76px', objectFit: 'contain', borderRadius: '10px', flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#4a3728', margin: '0 0 4px', textTransform: '', letterSpacing: '0.5px' }}>
                              {prod.ten_san_pham}
                            </h4>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#b22830', margin: 0 }}>
                              {Number(prod.gia_ban).toLocaleString(uiLocale())}{ui(" đ")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {currentSubcategories.length === 0 && (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#a09080', fontSize: '15px', fontWeight: 600 }}>
              {copy('Chưa có danh mục con nào được cập nhật trong chuyên mục này.', 'No categories are available yet.')}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     CẤP 3: CHI TIẾT 1 DANH MỤC CON DUY NHẤT
     ════════════════════════════════════════════════════ */
  if (viewState === 'subcategory' && currentBigGroup) {
    const carouselProducts = subcategoryProducts.slice(0, 15);
    const sidebarProducts = subcategoryProducts.slice(0, 5);

    return (
      <div className="menu-intro-page" style={{ width: '100%', minHeight: '100vh', background: '#fdfbfa', fontFamily: "var(--font-sans)" }}>
        {/* Breadcrumb */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 40px 0' }}>
          <nav style={{ fontSize: '11px', fontWeight: 700, color: '#a09080', textTransform: '', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onCategoryChange?.('all')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a09080', fontSize: '11px', fontWeight: 700, textTransform: '', letterSpacing: '2px', padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = '#b22830'}
              onMouseLeave={e => e.currentTarget.style.color = '#a09080'}
            >
              {copy('Thực đơn', 'Menu')}
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => onCategoryChange?.(currentBigGroup.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a09080', fontSize: '11px', fontWeight: 700, textTransform: '', letterSpacing: '2px', padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = '#b22830'}
              onMouseLeave={e => e.currentTarget.style.color = '#a09080'}
            >
              {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}
            </button>
            <span>/</span>
            <span style={{ color: '#4a3728' }}>{categoryLabel(currentSubcat?.ten_danh_muc) || copy('Danh mục', 'Category')}</span>
          </nav>
        </div>

        {/* Back navigation button */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 40px 0' }}>
          <button
            type="button"
            onClick={() => onCategoryChange?.(currentBigGroup.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#b22830', fontSize: '13px', fontWeight: 700,
              textTransform: '', letterSpacing: '1px',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: 0
            }}
          >
            <ArrowLongLeftIcon style={{ width: '18px', height: '18px' }} />
            <span>{copy('Quay lại', 'Back to')} {categoryLabel(currentBigGroup.parentCat.ten_danh_muc)}</span>
          </button>
        </div>

        {/* Layout chính: 2 cột */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 40px 80px' }}>
          <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Cột trái: tiêu đề + mô tả + Carousel sản phẩm (Tự chạy) */}
            <div style={{ flex: '1 1 700px', minWidth: 0 }}>
              <div style={{ marginBottom: '40px' }}>
                <h1 style={{
                  fontSize: '44px', fontWeight: 700, textTransform: '',
                  color: '#4a3728', margin: '0 0 20px', lineHeight: 1.1,
                  fontFamily: "var(--font-sans)",
                }}>
                  {categoryLabel(currentSubcat?.ten_danh_muc) || copy('Danh mục', 'Category')}
                </h1>
                <p style={{
                  fontSize: '15px', lineHeight: 1.9, color: '#6d5746',
                  margin: 0, fontWeight: 500, maxWidth: '720px',
                  textAlign: 'left',
                }}>
                  {getSubcatDesc(currentSubcat?.ten_danh_muc, lang, currentBigGroup?.themeKey)}
                </p>
              </div>

              {/* Slider tự động lướt */}
              {carouselProducts.length > 0 && (
                <div style={{
                  background: '#ffffff',
                  borderRadius: '6px',
                  padding: '30px',
                  boxShadow: '0 10px 40px rgba(74, 55, 40, 0.04)',
                  border: '1px solid #efeae2',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, textTransform: '', letterSpacing: '2px', color: '#b22830', margin: 0, fontFamily: "var(--font-sans)" }}>
                      {copy('Khám phá danh sách sản phẩm', 'Explore the products')}
                    </h3>
                  </div>
                  <AutoPlayProductCarousel items={carouselProducts} onSelect={onOrderProduct} />
                </div>
              )}

              {subcategoryProducts.length === 0 && (
                <div style={{
                  padding: '60px 40px', textAlign: 'center', background: '#fff',
                  borderRadius: '6px', border: '1px solid #efeae2', color: '#a09080',
                  fontSize: '15px', fontWeight: 600,
                }}>
                  {copy('Hiện chưa có sản phẩm nào được hiển thị trong danh mục này.', 'No products are available in this category yet.')}
                </div>
              )}
            </div>

            {/* Cột phải: Sidebar sản phẩm nổi bật */}
            {sidebarProducts.length > 0 && (
              <div style={{
                flex: '1 1 300px', minWidth: 0, maxWidth: '400px',
                background: '#ffffff', borderRadius: '6px',
                border: '1px solid #efeae2', padding: '30px',
                boxShadow: '0 10px 30px rgba(74, 55, 40, 0.03)',
                position: 'sticky', top: '100px',
              }}>
                <h3 style={{
                  fontSize: '13px', fontWeight: 700, textTransform: '',
                  color: '#4a3728', margin: '0 0 24px', letterSpacing: '2px',
                  paddingBottom: '16px', borderBottom: '2px solid #efeae2',
                }}>
                  {copy('Sản phẩm nổi bật', 'Featured products')}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {sidebarProducts.map(prod => (
                    <div
                      key={prod.ma_san_pham}
                      style={{
                        display: 'flex', gap: '16px', alignItems: 'center',
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                      onClick={() => onOrderProduct?.(prod)}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      <div className="menu-intro-page" style={{ width: '68px', height: '68px', borderRadius: '14px', overflow: 'hidden', background: '#fdfbfa', border: '1px solid #efeae2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', flexShrink: 0 }}>
                        <img loading="lazy" decoding="async"
                          src={prod.hinh_anh_url}
                          alt={prod.ten_san_pham}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h4 style={{
                          fontSize: '13px', fontWeight: 700, color: '#4a3728',
                          margin: '0 0 4px', textTransform: '', lineHeight: 1.35,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {prod.ten_san_pham}
                        </h4>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#b22830', margin: 0 }}>
                          {Number(prod.gia_ban).toLocaleString(uiLocale())}{ui(" đ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
