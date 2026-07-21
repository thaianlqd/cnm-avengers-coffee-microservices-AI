import React, { useState, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  HeartIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  MinusIcon
} from '@heroicons/react/24/outline';
import QuickViewModal from '../../components/QuickViewModal';

export default function ProductDetailPage({
  product,
  products = [],
  onAddToCart,
  onBack,
  onNavigate,
}) {
  const [quantity, setQuantity] = useState(1);
  const availableSizes = product?.sizes || {};
  const sizeKeys = Object.keys(availableSizes);
  const defaultSize = sizeKeys.length > 0 ? sizeKeys[0] : '';
  const [selectedSize, setSelectedSize] = useState(defaultSize);

  const availableToppings = product?.toppings || {};
  const toppingKeys = Object.keys(availableToppings);
  const [selectedToppings, setSelectedToppings] = useState([]);

  const availableLuongDa = product?.luong_da || {};
  const ldKeys = Object.keys(availableLuongDa);
  const [selectedLuongDa, setSelectedLuongDa] = useState(ldKeys.length > 0 ? ldKeys[0] : '');

  const availableDoNgot = product?.do_ngot || {};
  const dnKeys = Object.keys(availableDoNgot);
  const [selectedDoNgot, setSelectedDoNgot] = useState(dnKeys.length > 0 ? dnKeys[0] : '');

  const availableLoaiSua = product?.loai_sua || {};
  const lsKeys = Object.keys(availableLoaiSua);
  const [selectedLoaiSua, setSelectedLoaiSua] = useState(lsKeys.length > 0 ? lsKeys[0] : '');

  const [toastMessage, setToastMessage] = useState('');
  
  const [showToppingsList, setShowToppingsList] = useState(false);
  const [showDynamicToppings, setShowDynamicToppings] = useState(false);

  // Dynamic variants state
  const hasDynamicVariants = product?.bien_the && typeof product.bien_the === 'object' && Object.keys(product.bien_the).length > 0;
  const [dynamicSelections, setDynamicSelections] = useState(() => {
    const initial = {};
    if (hasDynamicVariants) {
      for (const [attrName, optionsObj] of Object.entries(product.bien_the)) {
        if (!optionsObj || typeof optionsObj !== 'object') continue;
        const keys = Object.keys(optionsObj);
        if (keys.length > 0) {
          const isMulti = attrName.toLowerCase().includes('topping') || attrName.toLowerCase().includes('đồ kèm');
          if (isMulti) {
            initial[attrName] = [];
          } else {
            initial[attrName] = keys[0];
          }
        }
      }
    }
    return initial;
  });

  const [modalProduct, setModalProduct] = useState(null);

  const openModal = (relProduct) => {
    setModalProduct(relProduct);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  if (!product) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center bg-white py-16">
        <p className="text-gray-500 font-medium text-lg mb-4">Không tìm thấy thông tin sản phẩm.</p>
        <button
          onClick={() => onBack ? onBack() : onNavigate?.('order')}
          className="px-6 py-2.5 rounded-full bg-[#b22830] text-white font-bold text-sm hover:bg-[#921e24] transition-colors"
        >
          Quay lại trang Đặt hàng
        </button>
      </div>
    );
  }

  const dynamicPrice = useMemo(() => {
    let extra = 0;
    if (hasDynamicVariants) {
      for (const [attrName, selection] of Object.entries(dynamicSelections)) {
        const optionsObj = product.bien_the[attrName] || {};
        if (Array.isArray(selection)) {
          for (const val of selection) {
            extra += Number(optionsObj[val]) || 0;
          }
        } else {
          extra += Number(optionsObj[selection]) || 0;
        }
      }
    }
    return extra;
  }, [hasDynamicVariants, product?.bien_the, dynamicSelections]);

  const basePrice = (selectedSize && availableSizes[selectedSize] !== undefined) 
    ? Number(availableSizes[selectedSize]) 
    : Number(product?.gia_ban || product?.price || 30000);

  const toppingsPrice = selectedToppings.reduce((acc, t) => acc + Number(availableToppings[t] || 0), 0);
  const loaiSuaPrice = (selectedLoaiSua && availableLoaiSua[selectedLoaiSua] !== undefined) ? Number(availableLoaiSua[selectedLoaiSua]) : 0;
  
  const price = hasDynamicVariants
    ? Number(product?.gia_ban || product?.price || 30000) + dynamicPrice
    : basePrice + toppingsPrice + loaiSuaPrice;

  const sku = product.ma_san_pham ? `0CPG0${String(product.ma_san_pham).slice(-2)}` : '0CPG07';
  const categoryName = product.danhMuc?.ten_danh_muc || product.categoryName || 'Cà Phê Đóng Gói';

  // Lấy danh sách sản phẩm cùng loại
  const relatedProducts = useMemo(() => {
    return products
      .filter(p => (p.ma_san_pham !== product.ma_san_pham) && (
        String(p.ma_danh_muc) === String(product.ma_danh_muc) ||
        String(p?.danhMuc?.ten_danh_muc) === String(categoryName)
      ))
      .slice(0, 6);
  }, [products, product, categoryName]);

  // Danh sách bánh ngon side widget
  const pastryItems = useMemo(() => {
    const pastries = products.filter(p => 
      String(p?.danhMuc?.ten_danh_muc || '').toLowerCase().includes('bánh') ||
      String(p.ten_san_pham || '').toLowerCase().includes('bánh')
    );
    if (pastries.length > 0) return pastries.slice(0, 5);
    return [
      { ma_san_pham: 901, ten_san_pham: 'Bánh Mì Que Gà Phô Mai', gia_ban: 19000, hinh_anh_url: '/hc-assets/banh_mi_que.png' },
      { ma_san_pham: 902, ten_san_pham: 'Bánh Mì Que Pate', gia_ban: 19000, hinh_anh_url: '/hc-assets/banh_mi_que.png' },
      { ma_san_pham: 903, ten_san_pham: 'Bánh Phô Mai Trà Xanh', gia_ban: 35000, hinh_anh_url: '/hc-assets/banh_ngot_1.png' },
      { ma_san_pham: 904, ten_san_pham: 'Bánh Croissant', gia_ban: 29000, hinh_anh_url: '/hc-assets/banh_ngot_1.png' },
    ];
  }, [products]);

  const handleMainAddToCart = (isBuyNow = false) => {
    if (hasDynamicVariants) {
      const getVal = (keywords, isArray = false) => {
        const key = Object.keys(dynamicSelections).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
        if (key) return dynamicSelections[key];
        return isArray ? [] : '';
      };

      const size = getVal(['kích thước', 'kích cỡ', 'size']);
      const toppings = getVal(['topping', 'đồ kèm', 'thêm'], true);
      const luongDa = getVal(['lượng đá', 'đá', 'ice']);
      const doNgot = getVal(['độ ngọt', 'ngọt', 'đường', 'sugar']);
      const loaiSua = getVal(['loại sữa', 'sữa', 'milk']);
      
      onAddToCart?.(product, quantity, size, {
        toppings,
        luongDa,
        doNgot,
        loaiSua,
        custom_attributes: dynamicSelections,
      });
    } else {
      onAddToCart?.(product, quantity, selectedSize, {
        toppings: selectedToppings,
        luongDa: selectedLuongDa,
        doNgot: selectedDoNgot,
        loaiSua: selectedLoaiSua,
      });
    }
    showToast(`Đã thêm ${quantity} x ${product.ten_san_pham} vào giỏ hàng!`);
    if (isBuyNow) {
      setTimeout(() => onNavigate?.('cart'), 500);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-24 right-6 z-50 bg-[#b22830] text-white px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 animate-bounce">
          <CheckIcon className="w-5 h-5 font-bold" />
          {toastMessage}
        </div>
      )}

      {/* Top Banner Navigation bar */}
      <div className="border-b border-gray-100 bg-[#f9f9f9] py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-500">
            <button
              onClick={() => onBack ? onBack() : onNavigate?.('order')}
              className="hover:text-[#b22830] transition-colors"
            >
              Trang chủ
            </button>
            <span>/</span>
            <span className="text-gray-600">{categoryName}</span>
            <span>/</span>
            <span className="text-[#333333] font-bold">{product.ten_san_pham || product.name}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* MAIN PRODUCT HERO SECTION (Ảnh 2) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-14 pb-12 border-b border-gray-200">
          {/* Left Column: Image Gallery */}
          <div className="md:col-span-6 flex flex-col items-center">
            <div className="w-full aspect-square max-w-[480px] bg-[#fafafa] rounded-3xl border border-gray-100 p-8 flex items-center justify-center relative overflow-hidden group">
              <img
                src={product.hinh_anh_url || product.img || '/hc-assets/caphe-1.png'}
                alt={product.ten_san_pham}
                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          </div>

          {/* Right Column: Details & Actions */}
          <div className="md:col-span-6 flex flex-col justify-between py-2">
            <div>
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                Highlands Coffee
              </span>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#222222] mt-1 uppercase">
                {product.ten_san_pham || product.name}
              </h1>

              {/* Status Line */}
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-600">
                <span>Tình trạng:</span>
                <span className="text-[#b22830] font-bold">Còn hàng</span>
                <span className="text-gray-300">|</span>
                <span>Mã SKU: <strong className="text-gray-800">{sku}</strong></span>
              </div>

              {/* Price */}
              <div className="mt-6">
                <span className="text-3xl sm:text-4xl font-black text-[#b22830]">
                  {price.toLocaleString('vi-VN')}đ
                </span>
              </div>

              {/* Dynamic options or static fallbacks */}
              {hasDynamicVariants ? (
                Object.entries(product.bien_the || {}).map(([attrName, optionsObj]) => {
                  const isMulti = attrName.toLowerCase().includes('topping') || attrName.toLowerCase().includes('đồ kèm');
                  const optionKeys = Object.keys(optionsObj || {});
                  if (optionKeys.length === 0) return null;

                  if (isMulti) {
                    return (
                      <div key={attrName} className="relative mt-4">
                        <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">{attrName}:</span>
                        <button 
                          type="button" 
                          onClick={() => setShowDynamicToppings(!showDynamicToppings)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-left font-bold text-sm hover:border-[#b22830] transition-colors"
                        >
                          <span>{dynamicSelections[attrName]?.length > 0 ? `Đã chọn (${dynamicSelections[attrName].length})` : 'Tuỳ chọn Topping'}</span>
                          <span className="text-gray-400 text-xs">▼</span>
                        </button>
                        {showDynamicToppings && (
                          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 max-h-60 overflow-y-auto">
                            <div className="flex flex-col gap-2">
                              {optionKeys.map((opt) => {
                                const isSelected = (dynamicSelections[attrName] || []).includes(opt);
                                return (
                                  <label key={opt} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-gray-50 rounded-md">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={() => {
                                        const currentList = dynamicSelections[attrName] || [];
                                        const nextList = currentList.includes(opt)
                                          ? currentList.filter(o => o !== opt)
                                          : [...currentList, opt];
                                        setDynamicSelections({
                                          ...dynamicSelections,
                                          [attrName]: nextList
                                        });
                                      }}
                                      className="w-4 h-4 text-[#b22830] rounded border-gray-300 focus:ring-[#b22830]"
                                    />
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-[#b22830] transition-colors flex-1">{opt}</span>
                                    <span className="text-sm font-bold text-[#b22830]">+{Number(optionsObj[opt]).toLocaleString('vi-VN')}đ</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={attrName} className="mt-4">
                      <span className="block text-sm font-bold text-gray-700 mb-2">{attrName}:</span>
                      <div className="flex flex-wrap items-center gap-3">
                        {optionKeys.map((opt) => {
                          const isSelected = dynamicSelections[attrName] === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setDynamicSelections({
                                  ...dynamicSelections,
                                  [attrName]: opt
                                });
                              }}
                              className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all flex items-center gap-2 ${
                                isSelected
                                  ? 'border-[#b22830] bg-[#b22830] text-white shadow-sm'
                                  : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                              }`}
                            >
                              {opt} {optionsObj[opt] > 0 ? `(+${Number(optionsObj[opt]).toLocaleString('vi-VN')}đ)` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <>
                  {/* Size options if applicable */}
                  {sizeKeys.length > 0 && (
                    <div className="mt-6">
                      <span className="block text-sm font-bold text-gray-700 mb-2">Kích thước:</span>
                      <div className="flex flex-wrap items-center gap-3">
                        {sizeKeys.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSelectedSize(sz)}
                            className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                              selectedSize === sz
                                ? 'border-[#b22830] bg-[#b22830] text-white shadow-sm'
                                : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                            }`}
                          >
                            {sz} {availableSizes[sz] > 0 ? `(+${availableSizes[sz].toLocaleString('vi-VN')}đ)` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lượng đá */}
                  {ldKeys.length > 0 && (
                    <div className="mt-4">
                      <span className="block text-sm font-bold text-gray-700 mb-2">Lượng đá:</span>
                      <div className="flex flex-wrap items-center gap-3">
                        {ldKeys.map((ld) => (
                          <button
                            key={ld}
                            type="button"
                            onClick={() => setSelectedLuongDa(ld)}
                            className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                              selectedLuongDa === ld
                                ? 'border-[#b22830] bg-[#b22830] text-white shadow-sm'
                                : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                            }`}
                          >
                            {ld}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Độ ngọt */}
                  {dnKeys.length > 0 && (
                    <div className="mt-4">
                      <span className="block text-sm font-bold text-gray-700 mb-2">Độ ngọt:</span>
                      <div className="flex flex-wrap items-center gap-3">
                        {dnKeys.map((dn) => (
                          <button
                            key={dn}
                            type="button"
                            onClick={() => setSelectedDoNgot(dn)}
                            className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                              selectedDoNgot === dn
                                ? 'border-[#b22830] bg-[#b22830] text-white shadow-sm'
                                : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                            }`}
                          >
                            {dn}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Loại sữa */}
                  {lsKeys.length > 0 && (
                    <div className="mt-4">
                      <span className="block text-sm font-bold text-gray-700 mb-2">Loại sữa:</span>
                      <div className="flex flex-wrap items-center gap-3">
                        {lsKeys.map((ls) => (
                          <button
                            key={ls}
                            type="button"
                            onClick={() => setSelectedLoaiSua(ls)}
                            className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                              selectedLoaiSua === ls
                                ? 'border-[#b22830] bg-[#b22830] text-white shadow-sm'
                                : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                            }`}
                          >
                            {ls} {availableLoaiSua[ls] >= 0 ? `(+${Number(availableLoaiSua[ls]).toLocaleString('vi-VN')}đ)` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Toppings (Multi-select) */}
                  {product.toppings && Object.keys(product.toppings || {}).length > 0 && (
                    <div className="relative mt-4">
                      <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">Topping:</span>
                      <button 
                        type="button" 
                        onClick={() => setShowToppingsList(!showToppingsList)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-left font-bold text-sm hover:border-[#b22830] transition-colors"
                      >
                        <span>{selectedToppings.length > 0 ? `Đã chọn (${selectedToppings.length})` : 'Tuỳ chọn Topping'}</span>
                        <span className="text-gray-400 text-xs">▼</span>
                      </button>
                      {showToppingsList && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 max-h-60 overflow-y-auto">
                          <div className="flex flex-col gap-2">
                            {Object.keys(product.toppings).map((tp) => {
                              const isSelected = selectedToppings.includes(tp);
                              return (
                                <label key={tp} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-gray-50 rounded-md">
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) setSelectedToppings(selectedToppings.filter(t => t !== tp));
                                      else setSelectedToppings([...selectedToppings, tp]);
                                    }}
                                    className="w-4 h-4 text-[#b22830] rounded border-gray-300 focus:ring-[#b22830]"
                                  />
                                  <span className="text-sm font-bold text-gray-700 group-hover:text-[#b22830] transition-colors flex-1">{tp}</span>
                                  <span className="text-sm font-bold text-[#b22830]">+{Number(product.toppings[tp]).toLocaleString('vi-VN')}đ</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Quantity Selector */}
              <div className="mt-6 flex items-center gap-4">
                <span className="text-sm font-bold text-gray-700">Số lượng:</span>
                <div className="flex items-center border border-gray-300 rounded-full bg-white px-3 py-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <MinusIcon className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center font-bold text-base text-gray-800">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons (MUA NGAY & THÊM VÀO GIÒ - chuẩn Ảnh 2) */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => handleMainAddToCart(true)}
                className="flex-1 min-w-[160px] py-3.5 px-8 rounded-full bg-[#d0021b] text-white font-bold text-sm uppercase tracking-wider shadow-md hover:bg-[#a80014] transition-all text-center"
              >
                MUA NGAY
              </button>
              <button
                type="button"
                onClick={() => handleMainAddToCart(false)}
                className="flex-1 min-w-[160px] py-3.5 px-8 rounded-full bg-[#ff5a5f] text-white font-bold text-sm uppercase tracking-wider shadow-md hover:bg-[#e0484d] transition-all text-center"
              >
                THÊM VÀO GIÒ
              </button>
            </div>
          </div>
        </div>

        {/* PRODUCT DESCRIPTION & SIDE WIDGET (Ảnh 3) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-12 pb-14 border-b border-gray-200">
          {/* Left Description */}
          <div className="lg:col-span-8">
            <h2 className="text-2xl font-black text-[#222222] border-b-2 border-gray-800 pb-3 mb-6 uppercase">
              Mô tả sản phẩm
            </h2>
            <div className="text-gray-700 leading-relaxed space-y-4 text-[15px]">
              <p>
                {product.mo_ta ||
                  `Sự kết hợp hoàn hảo giữa hạt cà phê Robusta & Arabica đậm đà chất lượng cao của vùng đất cao nguyên Việt Nam cùng dòng sữa thơm béo sánh mịn. ${product.ten_san_pham} mang lại trải nghiệm sảng khoái tràn đầy năng lượng cho ngày mới.`}
              </p>
              <p>
                Được tuyển chọn kỹ lưỡng và rang xay theo công thức độc quyền từ Highlands Coffee, giữ trọn hương vị truyền thống đậm đà khó quên.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-600">
                <li>Thành phần tự nhiên, đảm bảo vệ sinh an toàn thực phẩm.</li>
                <li>Thơm ngon đậm vị cà phê Việt Nam truyền thống.</li>
                <li>Tiện lợi thưởng thức mọi lúc mọi nơi.</li>
              </ul>
            </div>
          </div>

          {/* Right Pastry Add-on Sidebar (Bánh ngon đừng bỏ lỡ - Ảnh 3) */}
          <div className="lg:col-span-4">
            <div className="bg-[#fffcf7] rounded-2xl border border-orange-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-orange-200/60">
                <h3 className="font-black text-base text-[#8B4513] uppercase">
                  Bánh ngon đừng bỏ lỡ 🍰
                </h3>
              </div>
              <div className="space-y-3">
                {pastryItems.map((pastry) => (
                  <div
                    key={pastry.ma_san_pham}
                    className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-gray-100 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={pastry.hinh_anh_url || '/hc-assets/banh_mi_que.png'}
                        alt={pastry.ten_san_pham}
                        className="w-12 h-12 object-contain rounded bg-gray-50 p-1"
                      />
                      <div>
                        <h4 className="font-bold text-xs text-gray-800 line-clamp-1">
                          {pastry.ten_san_pham}
                        </h4>
                        <span className="font-black text-xs text-[#b22830]">
                          {(Number(pastry.gia_ban) || 19000).toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onAddToCart?.(pastry, 1, 'M');
                        showToast(`Đã thêm ${pastry.ten_san_pham} vào giỏ hàng!`);
                      }}
                      className="w-8 h-8 rounded-full bg-[#ff6b6b] text-white flex items-center justify-center hover:bg-[#e31837] transition-colors shadow-sm"
                      title="Thêm nhanh"
                    >
                      <PlusIcon className="w-4 h-4 font-bold" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RELATED PRODUCTS SECTION (Sản phẩm cùng loại - Ảnh 4) */}
        <div className="mt-12">
          <h2 className="text-2xl font-black text-[#222222] mb-6 uppercase">
            Sản phẩm cùng loại
          </h2>

          {relatedProducts.length === 0 ? (
            <p className="text-gray-500 text-sm">Hiện chưa có sản phẩm cùng loại.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {relatedProducts.map((relProduct) => (
                <div
                  key={relProduct.ma_san_pham}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg transition-all group relative flex flex-col"
                >
                  <div
                    className="relative aspect-square bg-[#fcfaf7] overflow-hidden cursor-pointer"
                    onClick={() => openModal(relProduct)}
                  >
                    <img
                      src={relProduct.hinh_anh_url || '/hc-assets/caphe-1.png'}
                      alt={relProduct.ten_san_pham}
                      className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-110"
                    />

                    {/* Quickview Search/Zoom icon top right */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal(relProduct);
                      }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:text-[#b22830] transition-colors"
                      title="Xem nhanh"
                    >
                      <MagnifyingGlassIcon className="w-4 h-4 font-bold" />
                    </button>
                  </div>

                  <div className="p-4 flex flex-col flex-1 justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Highlands Coffee
                      </span>
                      <h3
                        onClick={() => openModal(relProduct)}
                        className="font-bold text-sm text-[#333333] hover:text-[#b22830] line-clamp-2 mt-1 cursor-pointer"
                      >
                        {relProduct.ten_san_pham}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                      <span className="font-black text-base text-[#b22830]">
                        {(Number(relProduct.gia_ban) || 0).toLocaleString('vi-VN')}đ
                      </span>

                      {/* Red circle plus button bottom right */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal(relProduct);
                        }}
                        className="w-8 h-8 rounded-full bg-[#ff5a5f] text-white flex items-center justify-center hover:bg-[#d0021b] transition-colors shadow-sm"
                      >
                        <PlusIcon className="w-4 h-4 font-bold" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* POPUP MODAL SẢN PHẨM CÙNG LOẠI */}
      {modalProduct && (
        <QuickViewModal 
          product={modalProduct} 
          onClose={() => setModalProduct(null)} 
          onAddToCart={onAddToCart} 
        />
      )}
    </div>
  );
}
