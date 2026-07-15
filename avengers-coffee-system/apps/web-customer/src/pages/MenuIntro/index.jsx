import React, { useMemo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ArrowLongRightIcon, ArrowLongLeftIcon } from '@heroicons/react/24/outline';

const BIG_GROUPS = {
  coffee: {
    id: 'group-cà phê',
    title: 'CÀ PHÊ',
    subtitle: 'Sự hòa quyện hoàn hảo của đất trời Việt Nam',
    description: 'Highlands Coffee tự hào phục vụ những hạt cà phê Robusta & Arabica tốt nhất trồng tại vùng cao nguyên lộng gió Việt Nam. Rang xay theo bí quyết độc đáo truyền thống, mang đến hương vị đậm đà, thơm nồng đầy quyến rũ.',
    banner: '/hc-assets/web_banner_2000x2000.jpg',
    introText: 'Cà phê luôn là niềm tự hào của Highlands Coffee. Mỗi tách cà phê là kết quả của một hành trình tỉ mỉ từ những nông trại Gia Lai, Lâm Đồng đầy nắng gió cho tới khâu rang xay kỹ lưỡng và chiết xuất ly cà phê thơm nồng đậm đà chuẩn vị truyền thống phục vụ bạn.',
  },
  tea: {
    id: 'group-trà',
    title: 'TRÀ HIGHLANDS',
    subtitle: 'Hương vị cao nguyên tươi mát, đậm đà tình thân',
    description: 'Bản hòa tấu độc đáo giữa búp trà tươi cao nguyên hái tay, trái cây tự nhiên ngọt dịu và thạch giòn dai lạ miệng. Sự kết hợp hoàn hảo giữa nét thanh mát hiện đại và phong vị truyền thống ấm cúng.',
    banner: '/hc-assets/slider_1.jpg',
    introText: 'Trà Highlands mang trong mình sự nhẹ nhàng thanh khiết kết hợp hài hòa với xu hướng thưởng thức năng động của giới trẻ. Những búp trà xanh ô long được chắt lọc tinh túy, tô điểm bằng lớp thạch đào, sen vàng hay thạch vải giòn rụm khó quên.',
  },
  freeze: {
    id: 'group-freeze',
    title: 'FREEZE ĐÁ XAY',
    description: 'Freeze là dòng đá xay mát lạnh sảng khoái tức thì cho những ngày hè rực nắng. Vị trà xanh Nhật Bản thơm mát hay chocolate ngọt ngào xay mịn, phủ lớp kem whipping béo ngậy kèm thạch dai ngon hấp dẫn.',
    banner: '/hc-assets/2.png',
    introText: 'Dòng Freeze đá xay độc đáo mang thương hiệu Highlands mang đến làn gió mát lạnh sảng khoái. Được chế biến công phu, đá bào xay mịn hòa quyện hoàn hảo cùng trà xanh Tây Bắc, thạch dai giòn dai lạ miệng sảng khoái.',
  },
  other: {
    id: 'group-khác',
    title: 'KHÁC (THỨC ĂN & QUÀ TẶNG)',
    description: 'Khám phá thực đơn bánh mì giòn tan chuẩn vị Việt, bánh ngọt Pháp thơm ngon khó cưỡng và những dòng sản phẩm đóng gói tiện lợi của Highlands Coffee làm quà tặng sang trọng cho người thương yêu.',
    banner: '/hc-assets/1_1.jpg',
    introText: 'Không chỉ có nước ngon, chúng tôi còn chuẩn bị những chiếc bánh mì que nóng hổi giòn rụm, bánh ngọt mousse phô mai dịu dàng và những gói cà phê đóng hộp tiện lợi giúp bạn thưởng thức hương vị Highlands mọi lúc mọi nơi.',
  }
};

const SUBCATEGORY_DESCRIPTIONS = {
  'phin': 'Cà phê phin truyền thống thơm nồng đậm đà nguyên bản Việt Nam.',
  'phindi': 'Dòng PhinDi thế hệ mới, sự phá cách độc đáo kết hợp cùng thạch cà phê và kem sữa béo ngậy.',
  'espresso': 'Tinh hoa cà phê Ý chiết xuất đậm đà, mịn màng lớp crema quyến rũ.',
  'sen': 'Trà sen vàng ngọt dịu kết hợp cùng hạt sen bùi béo và củ năng giòn sần sật.',
  'thạch': 'Trà thạch đào thơm ngon mát lạnh cùng những lát đào mọng nước dai giòn.',
  'matcha': 'Freeze Trà Xanh mát lạnh với hương vị trà xanh Nhật Bản quyện whipped cream béo ngậy.',
  'bánh mì': 'Bánh mì que giòn tan nóng hổi phết pate thơm lừng đặc trưng.',
  'bánh ngọt': 'Bánh mousse phô mai ngọt dịu béo ngậy tan ngay trong miệng.',
};

function getSubcatDesc(name) {
  const lowercase = String(name || '').toLowerCase();
  for (const [key, desc] of Object.entries(SUBCATEGORY_DESCRIPTIONS)) {
    if (lowercase.includes(key)) return desc;
  }
  return 'Sản phẩm chất lượng cao chuẩn vị được Highlands Coffee tuyển chọn tinh tế phục vụ quý khách.';
}

export default function MenuIntroPage({
  categories = [],
  products = [],
  activeCategoryId = 'all',
  onCategoryChange,
  onOrderProduct
}) {

  // Dựa vào DB schema: cap_bac = 1 hoặc không có ma_danh_muc_cha là parent
  const parentCategories = useMemo(() => {
    return categories.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha);
  }, [categories]);

  // Các nhóm danh mục sẽ được map tự động từ DB parent
  const dynamicBigGroups = useMemo(() => {
    return parentCategories.map(parent => {
      const name = String(parent.ten_danh_muc).toLowerCase();
      let baseGroup = BIG_GROUPS.other;
      if (name.includes('cà phê')) baseGroup = BIG_GROUPS.coffee;
      else if (name.includes('trà')) baseGroup = BIG_GROUPS.tea;
      else if (name.includes('đá xay') || name.includes('freeze')) baseGroup = BIG_GROUPS.freeze;
      
      return {
        ...baseGroup,
        id: `group-${parent.ma_danh_muc}`,
        title: parent.ten_danh_muc,
        parentCat: parent
      };
    });
  }, [parentCategories]);

  // Phân tích trạng thái view hiện tại dựa trên activeCategoryId
  const viewState = useMemo(() => {
    if (activeCategoryId === 'all') return 'overview'; // Cấp 1
    if (String(activeCategoryId).startsWith('group-')) return 'category'; // Cấp 2
    return 'subcategory'; // Cấp 3
  }, [activeCategoryId]);

  // Nhóm danh mục lớn đang hoạt động (cho Cấp 2 và Cấp 3)
  const currentBigGroup = useMemo(() => {
    if (viewState === 'overview') return null;
    
    // Nếu ở Cấp 2
    if (viewState === 'category') {
      return dynamicBigGroups.find(g => g.id === String(activeCategoryId)) || dynamicBigGroups[0];
    }

    // Nếu ở Cấp 3 (danh mục con cụ thể)
    const subcat = categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId));
    if (!subcat) return dynamicBigGroups[0];
    
    // Tìm parent của subcat này
    const parentGroup = dynamicBigGroups.find(g => String(g.parentCat.ma_danh_muc) === String(subcat.ma_danh_muc_cha));
    return parentGroup || dynamicBigGroups[0];
  }, [viewState, activeCategoryId, categories, dynamicBigGroups]);

  // Các danh mục con thuộc Nhóm danh mục lớn hiện tại (cho Cấp 2)
  const currentSubcategories = useMemo(() => {
    if (!currentBigGroup) return [];
    return categories.filter(c => String(c.ma_danh_muc_cha) === String(currentBigGroup.parentCat.ma_danh_muc));
  }, [currentBigGroup, categories]);

  // Lọc sản phẩm cho danh mục con hiện tại (cho Cấp 3)
  const subcategoryProducts = useMemo(() => {
    if (viewState !== 'subcategory') return [];
    return products.filter(p => String(p.ma_danh_muc) === String(activeCategoryId));
  }, [viewState, activeCategoryId, products]);

  const leftProducts = useMemo(() => subcategoryProducts.slice(0, 3), [subcategoryProducts]);
  const rightProducts = useMemo(() => subcategoryProducts.slice(3, 8), [subcategoryProducts]);

  return (
    <div className="w-full bg-[#faf7f4] min-h-screen py-10 px-4 md:px-8 lg:px-12 text-[#4a3728]">
      <div className="max-w-[1240px] mx-auto">
        
        {/* ========================================================
            CẤP 1: TỔNG QUAN THỰC ĐƠN (OVERVIEW - /san-pham.html)
            ======================================================== */}
        {viewState === 'overview' && (
          <div className="space-y-12 animate-in fade-in duration-300">
            {/* Breadcrumb */}
            <nav className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-6">
              <span className="text-[#333333]">Trang chủ / Thực đơn giới thiệu</span>
            </nav>

            <div className="text-center max-w-[800px] mx-auto space-y-4 mb-14">
              <h1 className="text-[42px] font-black uppercase tracking-wide font-serif leading-none">
                Thực đơn của chúng tôi
              </h1>
              <p className="text-sm font-semibold text-[#6d5746] leading-relaxed">
                Hãy cùng khám phá thế giới trà và cà phê tinh tế mang phong vị cao nguyên Việt Nam của Highlands Coffee. Mỗi dòng thức uống đều mang trong mình những giá trị nguyên bản đặc sắc nhất.
              </p>
            </div>

            {/* Grid banner giới thiệu các dòng sản phẩm chính */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {dynamicBigGroups.map((group) => {
                // Lấy một sản phẩm tiêu biểu của nhóm để hiển thị
                const sampleProduct = products.find(p => {
                  const subcats = categories.filter(c => String(c.ma_danh_muc_cha) === String(group.parentCat.ma_danh_muc));
                  const subcatIds = new Set(subcats.map(s => String(s.ma_danh_muc)));
                  return subcatIds.has(String(p.ma_danh_muc));
                });

                return (
                  <div 
                    key={group.id}
                    className="bg-white border border-[#e8e2da] rounded-[28px] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-gray-50 border-b border-gray-100 flex items-center justify-center">
                      <img 
                        src={sampleProduct?.hinh_anh_url || group.banner} 
                        alt={group.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        onError={(e) => { e.currentTarget.src = group.banner; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60"></div>
                      <span className="absolute bottom-4 left-6 text-white text-xs font-black uppercase tracking-widest bg-[#c41230] px-3 py-1 rounded-full">
                        Highlands Coffee
                      </span>
                    </div>

                    <div className="p-6 md:p-8 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        <h2 className="text-2xl font-black uppercase font-serif tracking-wide text-[#4a3728]">
                          {group.title}
                        </h2>
                        <p className="text-[13px] leading-relaxed text-[#6d5746] font-medium line-clamp-3">
                          {group.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onCategoryChange?.(group.id)}
                        className="mt-4 py-3 bg-black hover:bg-[#c41230] text-white rounded-full text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors self-start px-6 shadow-sm"
                      >
                        <span>Khám phá ngay</span>
                        <ArrowLongRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================
            CẤP 2: GIỚI THIỆU NHÓM DANH MỤC LỚN (CATEGORY STORY - /ca-phe.html)
            ======================================================== */}
        {viewState === 'category' && currentBigGroup && (
          <div className="space-y-12 animate-in fade-in duration-300">
            {/* Breadcrumb */}
            <nav className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-6 flex items-center gap-2">
              <button 
                onClick={() => onCategoryChange?.('all')} 
                className="hover:text-[#c41230] transition-colors"
              >
                Trang chủ
              </button>
              <span>/</span>
              <span className="text-[#333333]">{currentBigGroup.title}</span>
            </nav>

            {/* Back Button */}
            <button
              onClick={() => onCategoryChange?.('all')}
              className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#c41230] transition-colors"
            >
              <ArrowLongLeftIcon className="h-4 w-4" />
              <span>Quay lại Thực đơn chính</span>
            </button>

            {/* Banner & Story Description */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7 space-y-6">
                <h1 className="text-[44px] font-black uppercase text-[#4a3728] leading-none font-serif tracking-wide border-l-4 border-[#c41230] pl-5">
                  {currentBigGroup.title}
                </h1>
                <p className="text-[14px] sm:text-[15px] leading-relaxed text-[#6d5746] font-medium text-justify">
                  {currentBigGroup.introText}
                </p>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#e8e2da] rounded-[28px] overflow-hidden aspect-[4/3] flex items-center justify-center p-3 shadow-sm">
                <div className="w-full h-full bg-[#f4f0eb] rounded-[20px] overflow-hidden flex items-center justify-center border border-gray-100">
                  <img 
                    src={currentBigGroup.banner} 
                    alt={currentBigGroup.title} 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Danh sách các danh mục con thực tế */}
            <div className="space-y-6 pt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#c41230]">
                Các dòng sản phẩm thuộc danh mục
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentSubcategories.length === 0 ? (
                  <p className="text-gray-400 text-sm font-bold py-6">Không tìm thấy phân loại sản phẩm con nào.</p>
                ) : (
                  currentSubcategories.map((subcat) => {
                    // Lấy 1 sản phẩm đại diện để hiển thị
                    const representativeProduct = products.find(p => String(p.ma_danh_muc) === String(subcat.ma_danh_muc));

                    return (
                      <div 
                        key={subcat.ma_danh_muc}
                        className="bg-white border border-[#e8e2da] rounded-[24px] p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-full group"
                      >
                        <div>
                          {/* Box ảnh đại diện sản phẩm con */}
                          <div className="w-full aspect-square bg-[#f4f0eb] rounded-[18px] overflow-hidden flex items-center justify-center border border-gray-100 mb-4 flex-shrink-0 group-hover:scale-[1.02] transition-transform duration-300">
                            {representativeProduct ? (
                              <img 
                                src={representativeProduct.hinh_anh_url} 
                                alt={subcat.ten_danh_muc} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-3xl text-gray-300 font-bold">🥤</div>
                            )}
                          </div>

                          <h4 className="font-extrabold text-[15px] uppercase text-gray-800 tracking-tight leading-tight mb-2">
                            {subcat.ten_danh_muc}
                          </h4>
                          <p className="text-[12px] leading-relaxed text-[#6d5746] font-medium line-clamp-3 mb-4">
                            {getSubcatDesc(subcat.ten_danh_muc)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onCategoryChange?.(subcat.ma_danh_muc)}
                          className="w-full py-2.5 bg-black hover:bg-[#c41230] text-white rounded-full text-[11px] font-black uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2"
                        >
                          <span>Xem sản phẩm</span>
                          <ArrowLongRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            CẤP 3: GIỚI THIỆU DANH MỤC CON CHI TIẾT (SUBCATEGORY - /ca-phe-truyen-thong.html)
            ======================================================== */}
        {viewState === 'subcategory' && currentBigGroup && (
          <div className="space-y-12 animate-in fade-in duration-300">
            {/* Breadcrumb */}
            <nav className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-6 flex items-center gap-2">
              <button 
                onClick={() => onCategoryChange?.('all')} 
                className="hover:text-[#c41230] transition-colors"
              >
                Trang chủ
              </button>
              <span>/</span>
              <button
                onClick={() => onCategoryChange?.(currentBigGroup.id)}
                className="hover:text-[#c41230] transition-colors"
              >
                {currentBigGroup.title}
              </button>
              <span>/</span>
              <span className="text-[#333333]">
                {categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId))?.ten_danh_muc || 'Danh mục con'}
              </span>
            </nav>

            {/* Back Button to Big Group page (Level 2) */}
            <button
              onClick={() => onCategoryChange?.(currentBigGroup.id)}
              className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#c41230] transition-colors"
            >
              <ArrowLongLeftIcon className="h-4 w-4" />
              <span>Quay lại mục {currentBigGroup.title}</span>
            </button>

            {/* Main Content Layout matching Mockup */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              {/* Cột trái: Tiêu đề danh mục con, mô tả, và danh sách sản phẩm to */}
              <div className="lg:col-span-8 space-y-10">
                <div className="space-y-4">
                  <h1 className="text-[38px] sm:text-[44px] font-black uppercase text-[#4a3728] leading-none font-serif tracking-wide border-l-4 border-[#c41230] pl-5">
                    {categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId))?.ten_danh_muc || 'DANH MỤC CON'}
                  </h1>
                  <p className="text-[14px] leading-relaxed text-[#6d5746] font-medium text-justify">
                    {getSubcatDesc(categories.find(c => String(c.ma_danh_muc) === String(activeCategoryId))?.ten_danh_muc)} Thưởng thức hương vị đậm đà được điều chế thủ công từ những nghệ nhân có nhiều năm kinh nghiệm, đảm bảo mang lại cho bạn những phút giây thư giãn tuyệt vời.
                  </p>
                </div>

                <div className="space-y-6 pt-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#c41230]">
                    Danh sách sản phẩm nổi bật
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {leftProducts.length === 0 ? (
                      <p className="text-gray-400 text-sm font-bold col-span-3 py-6">Chưa có sản phẩm nào thuộc phân loại này.</p>
                    ) : (
                      leftProducts.map((prod) => (
                        <div 
                          key={prod.ma_san_pham}
                          className="bg-white border border-[#e8e2da] rounded-[24px] p-5 shadow-sm flex flex-col justify-between h-full group"
                        >
                          <div>
                            <div className="w-full aspect-square bg-[#f4f0eb] rounded-[18px] overflow-hidden flex items-center justify-center border border-gray-100 mb-4 group-hover:scale-[1.02] transition-transform duration-300">
                              <img 
                                src={prod.hinh_anh_url} 
                                alt={prod.ten_san_pham} 
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <h4 className="font-extrabold text-[14px] uppercase text-gray-800 leading-tight line-clamp-2 mb-1">
                              {prod.ten_san_pham}
                            </h4>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                              Highlands Coffee
                            </p>
                          </div>

                          <div className="space-y-2 pt-2">
                            <p className="text-[15px] font-black text-[#c41230]">
                              {Number(prod.gia_ban).toLocaleString('vi-VN')}đ
                            </p>
                            <button
                              type="button"
                              onClick={() => onOrderProduct?.(prod)}
                              className="w-full py-2 bg-[#c41230] hover:bg-[#a30f28] text-white rounded-full text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm"
                            >
                              Đặt mua ngay
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Cột phải: Danh sách các sản phẩm gợi ý kèm mô tả chi tiết dọc */}
              <div className="lg:col-span-4 bg-white border border-[#e8e2da] rounded-[28px] p-6 shadow-sm space-y-6">
                <h2 className="text-base font-black uppercase tracking-wider text-[#4a3728] pb-3 border-b border-gray-100 font-serif">
                  Sản phẩm đề xuất
                </h2>

                <div className="space-y-6">
                  {rightProducts.length === 0 ? (
                    subcategoryProducts.length === 0 ? (
                      <p className="text-gray-400 text-xs font-bold text-center py-6">Không có sản phẩm gợi ý nào.</p>
                    ) : (
                      // Dự phòng nếu rightProducts rỗng thì lấy lại các món ở leftProducts
                      leftProducts.map((prod) => (
                        <div 
                          key={`right-${prod.ma_san_pham}`}
                          className="flex gap-4 items-center cursor-pointer hover:opacity-90 group"
                          onClick={() => onOrderProduct?.(prod)}
                        >
                          <img 
                            src={prod.hinh_anh_url} 
                            className="w-16 h-16 object-cover rounded-2xl bg-[#f4f0eb] border border-gray-100 flex-shrink-0" 
                            alt={prod.ten_san_pham} 
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-extrabold text-[13px] text-gray-800 group-hover:text-[#c41230] transition-colors truncate uppercase">
                              {prod.ten_san_pham}
                            </h4>
                            <p className="text-[11px] text-gray-400 line-clamp-2 mt-0.5 leading-snug font-semibold">
                              {prod.mo_ta || 'Sản phẩm truyền thống nổi bật được chuẩn bị tỉ mỉ.'}
                            </p>
                            <p className="text-xs font-black text-[#c41230] mt-1">
                              {Number(prod.gia_ban).toLocaleString('vi-VN')}đ
                            </p>
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    rightProducts.map((prod) => (
                      <div 
                        key={prod.ma_san_pham}
                        className="flex gap-4 items-start cursor-pointer hover:opacity-90 group"
                        onClick={() => onOrderProduct?.(prod)}
                      >
                        <img 
                          src={prod.hinh_anh_url} 
                          className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-2xl bg-[#f4f0eb] border border-gray-100 flex-shrink-0" 
                          alt={prod.ten_san_pham} 
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-extrabold text-[13px] text-gray-800 group-hover:text-[#c41230] transition-colors leading-tight uppercase truncate">
                            {prod.ten_san_pham}
                          </h4>
                          <p className="text-[11px] text-gray-400 line-clamp-2 mt-1 leading-snug font-semibold">
                            {prod.mo_ta || 'Hương vị thơm ngon bùng nổ, đánh thức mọi giác quan của bạn.'}
                          </p>
                          <p className="text-xs font-black text-[#c41230] mt-1.5">
                            {Number(prod.gia_ban).toLocaleString('vi-VN')}đ
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => onCategoryChange?.(currentBigGroup.id)}
                    className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#c41230] hover:text-[#c41230] text-gray-400 rounded-2xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    Xem tất cả {currentBigGroup.title}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
