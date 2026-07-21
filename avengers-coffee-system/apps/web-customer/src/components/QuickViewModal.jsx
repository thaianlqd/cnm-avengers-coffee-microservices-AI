import React, { useState, useMemo } from 'react';
import { XMarkIcon, CheckIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

export default function QuickViewModal({ product, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [toastMessage, setToastMessage] = useState('');

  const hasDynamic = product?.bien_the && typeof product.bien_the === 'object' && Object.keys(product.bien_the).length > 0;
  
  const [dynamicSelections, setDynamicSelections] = useState(() => {
    const initial = {};
    if (hasDynamic) {
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

  const [selectedSize, setSelectedSize] = useState(() => {
    const keys = Object.keys(product?.sizes || {});
    return keys.length > 0 ? keys[0] : '';
  });
  const [selectedLuongDa, setSelectedLuongDa] = useState(() => {
    const keys = Object.keys(product?.luong_da || {});
    return keys.length > 0 ? keys[0] : '';
  });
  const [selectedDoNgot, setSelectedDoNgot] = useState(() => {
    const keys = Object.keys(product?.do_ngot || {});
    return keys.length > 0 ? keys[0] : '';
  });
  const [selectedLoaiSua, setSelectedLoaiSua] = useState(() => {
    const keys = Object.keys(product?.loai_sua || {});
    return keys.length > 0 ? keys[0] : '';
  });
  const [selectedToppings, setSelectedToppings] = useState([]);

  // States for toggleable toppings popup
  const [showToppingsList, setShowToppingsList] = useState(false);
  const [showDynamicToppings, setShowDynamicToppings] = useState(false);

  const price = useMemo(() => {
    if (hasDynamic) {
      let extra = 0;
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
      return Number(product.gia_ban || product.price || 30000) + extra;
    } else {
      const base = (selectedSize && product.sizes?.[selectedSize] !== undefined)
        ? Number(product.sizes[selectedSize])
        : Number(product.gia_ban || product.price || 30000);
      const tps = selectedToppings.reduce((acc, t) => acc + Number(product.toppings?.[t] || 0), 0);
      const ls = (selectedLoaiSua && product.loai_sua?.[selectedLoaiSua] !== undefined) ? Number(product.loai_sua[selectedLoaiSua]) : 0;
      return base + tps + ls;
    }
  }, [product, hasDynamic, dynamicSelections, selectedSize, selectedToppings, selectedLoaiSua]);

  const handleAdd = () => {
    if (hasDynamic) {
      const getVal = (keywords, isArray = false) => {
        const key = Object.keys(dynamicSelections).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
        if (key) return dynamicSelections[key];
        return isArray ? [] : '';
      };
      onAddToCart?.(product, quantity, getVal(['kích thước', 'size']), {
        toppings: getVal(['topping', 'đồ kèm', 'thêm'], true),
        luongDa: getVal(['lượng đá', 'đá', 'ice']),
        doNgot: getVal(['độ ngọt', 'ngọt', 'đường', 'sugar']),
        loaiSua: getVal(['loại sữa', 'sữa', 'milk']),
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
    setToastMessage(`Đã thêm ${quantity} x ${product.ten_san_pham} vào giỏ hàng!`);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
      {toastMessage && (
        <div className="fixed top-24 right-6 z-[110] bg-[#b22830] text-white px-5 py-3 rounded-xl shadow-xl font-bold text-sm flex items-center gap-2 animate-bounce">
          <CheckIcon className="w-5 h-5 font-bold" />
          {toastMessage}
        </div>
      )}
      <div className="relative w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-12 max-h-[90vh]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors"
        >
          <XMarkIcon className="w-5 h-5 font-bold" />
        </button>

        <div className="md:col-span-6 bg-white p-8 flex flex-col items-center justify-center relative border-r border-gray-100">
          <div className="w-full h-72 flex items-center justify-center">
            <img src={product.hinh_anh_url || '/hc-assets/caphe-1.png'} alt={product.ten_san_pham} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex items-center gap-3 mt-6">
            <div className="w-14 h-16 rounded-md bg-white border border-[#b22830] overflow-hidden p-1 cursor-pointer">
              <img src={product.hinh_anh_url || '/hc-assets/caphe-1.png'} alt="" className="w-full h-full object-contain" />
            </div>
            <div className="w-14 h-16 rounded-md bg-white border border-gray-200 overflow-hidden p-1 cursor-pointer hover:border-gray-300">
              <img src={product.hinh_anh_url || '/hc-assets/caphe-1.png'} alt="" className="w-full h-full object-contain opacity-80" />
            </div>
          </div>
        </div>

        <div className="md:col-span-6 p-8 flex flex-col h-full max-h-[90vh] overflow-y-auto custom-scrollbar">
          <div>
            <h2 className="text-2xl font-black text-[#222222] pr-8">{product.ten_san_pham}</h2>
            <p className="text-xs text-gray-500 mt-1">Thương hiệu: <span className="text-[#b22830] font-bold">Highlands Coffee</span></p>
            <div className="mt-4">
              <span className="text-3xl font-black text-[#b22830]">{price.toLocaleString('vi-VN')}đ</span>
            </div>

            <div className="mt-6 space-y-4">
              {hasDynamic ? (
                Object.entries(product.bien_the || {}).map(([attrName, optionsObj]) => {
                  const isMulti = attrName.toLowerCase().includes('topping') || attrName.toLowerCase().includes('đồ kèm');
                  const optionKeys = Object.keys(optionsObj || {});
                  if (optionKeys.length === 0) return null;

                  if (isMulti) {
                    return (
                      <div key={attrName} className="relative">
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
                                        const nextList = currentList.includes(opt) ? currentList.filter(o => o !== opt) : [...currentList, opt];
                                        setDynamicSelections({...dynamicSelections, [attrName]: nextList});
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
                    <div key={attrName}>
                      <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">{attrName}:</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {optionKeys.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDynamicSelections({...dynamicSelections, [attrName]: opt})}
                            className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
                              dynamicSelections[attrName] === opt ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {opt} {optionsObj[opt] > 0 ? `(+${Number(optionsObj[opt]).toLocaleString('vi-VN')}đ)` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <>
                  <div>
                    <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">Kích thước:</span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {Object.keys(product.sizes || {}).length > 0 ? (
                        Object.keys(product.sizes).map((sz) => (
                          <button key={sz} type="button" onClick={() => setSelectedSize(sz)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedSize === sz ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                            {sz} {product.sizes[sz] > 0 ? `(+${Number(product.sizes[sz]).toLocaleString('vi-VN')}đ)` : ''}
                          </button>
                        ))
                      ) : (
                        <button type="button" className="px-4 py-2 rounded-full border border-[#b22830] text-[#b22830] bg-red-50/60 text-xs font-bold">Mặc định</button>
                      )}
                    </div>
                  </div>
                  
                  {Object.keys(product.luong_da || {}).length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">Lượng đá:</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {Object.keys(product.luong_da).map((ld) => (
                          <button key={ld} type="button" onClick={() => setSelectedLuongDa(ld)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedLuongDa === ld ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{ld}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(product.do_ngot || {}).length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">Độ ngọt:</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {Object.keys(product.do_ngot).map((dn) => (
                          <button key={dn} type="button" onClick={() => setSelectedDoNgot(dn)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedDoNgot === dn ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{dn}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(product.loai_sua || {}).length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-gray-500 uppercase mb-2.5">Loại sữa:</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {Object.keys(product.loai_sua).map((ls) => (
                          <button key={ls} type="button" onClick={() => setSelectedLoaiSua(ls)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedLoaiSua === ls ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{ls} {product.loai_sua[ls] >= 0 ? `(+${Number(product.loai_sua[ls]).toLocaleString('vi-VN')}đ)` : ''}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(product.toppings || {}).length > 0 && (
                    <div className="relative">
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
                        <div className="absolute bottom-full mb-2 left-0 w-full bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 max-h-60 overflow-y-auto">
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
            </div>

            <div className="mt-8 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100"><MinusIcon className="w-4 h-4" /></button>
                <span className="w-10 text-center font-bold text-sm text-gray-800">{quantity}</span>
                <button type="button" onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100"><PlusIcon className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="mt-6">
              <button type="button" onClick={handleAdd} className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#ff6b6b] hover:bg-[#e31837] text-white font-bold text-sm uppercase tracking-wider shadow-md transition-all">THÊM VÀO GIỎ HÀNG</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
