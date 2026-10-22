import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { XMarkIcon, PlusIcon, MinusIcon } from '../common/icons';
import ProductSalesSummary from '../product/ProductSalesSummary';
import { productUnitPrice, isSizeAttribute } from '../../lib/productPrice';

export default function QuickViewModal({ product, onClose, onAddToCart }) {
  useUiLanguage();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const sending = useRef(false), dialog = useRef(null), close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape' && !sending.current) { event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);

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

  const price = useMemo(() => productUnitPrice(product, hasDynamic ? '' : selectedSize, hasDynamic
    ? { custom_attributes: dynamicSelections }
    : { toppings: selectedToppings, loaiSua: selectedLoaiSua, luongDa: selectedLuongDa, doNgot: selectedDoNgot }),
    [product, selectedSize, hasDynamic, dynamicSelections, selectedToppings, selectedLoaiSua, selectedLuongDa, selectedDoNgot]);

  const handleAdd = async () => {
    if (sending.current || !onAddToCart) return;
    sending.current = true; setPending(true); setError('');
    try {
      if (hasDynamic) {
        const getVal = (keywords, isArray = false) => {
          const key = Object.keys(dynamicSelections).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
          if (key) return dynamicSelections[key];
          return isArray ? [] : '';
        };
        await onAddToCart(product, quantity, getVal(['kích thước', 'size']), {
          toppings: getVal(['topping', 'đồ kèm', 'thêm'], true),
          luongDa: getVal(['lượng đá', 'đá', 'ice']),
          doNgot: getVal(['độ ngọt', 'ngọt', 'đường', 'sugar']),
          loaiSua: getVal(['loại sữa', 'sữa', 'milk']),
          custom_attributes: dynamicSelections,
        });
      } else {
        await onAddToCart(product, quantity, selectedSize, {
          toppings: selectedToppings,
          luongDa: selectedLuongDa,
          doNgot: selectedDoNgot,
          loaiSua: selectedLoaiSua,
        });
      }
      onClose();
    } catch (error) {
      setError(error?.response?.data?.message || 'Chưa thêm được vào giỏ. Các tùy chọn vẫn được giữ để bạn thử lại.');
    } finally { sending.current = false; setPending(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={ui("Tùy chọn {{v0}}", {v0:product.ten_san_pham})} className="quick-view-dialog relative w-full max-w-4xl bg-white rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-12 max-h-[90dvh]">
        <button
          type="button"
          onClick={onClose}
          aria-label={ui("Đóng tùy chọn sản phẩm")} disabled={pending}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors"
        >
          <XMarkIcon className="w-5 h-5 font-bold" />
        </button>

        <div className="md:col-span-6 bg-white p-5 flex flex-col items-center justify-center relative border-r border-gray-100">
          <div className="w-full h-44 md:h-72 flex items-center justify-center">
            <img src={product.hinh_anh_url || '/hc-assets/caphe-1.png'} alt={product.ten_san_pham} className="w-full h-full object-contain" />
          </div>

        </div>

        <div className="md:col-span-6 p-5 md:p-6 flex flex-col min-w-0 max-h-[calc(90dvh-216px)] md:max-h-[90dvh] overflow-y-auto custom-scrollbar">
          <div>
            <h2 className="text-xl font-semibold text-[#222222] pr-8">{product.ten_san_pham}</h2>
            <ProductSalesSummary product={product} className="mt-2" />
            <p className="text-xs text-gray-500 mt-1">{ui("Thương hiệu: ")}<span className="text-[#b22830] font-bold">Avengers Coffee</span></p>
            <div className="mt-4">
              <span className="text-2xl font-semibold text-[#b22830]">{price.toLocaleString(uiLocale())}{ui("đ")}</span>
            </div>

            <div className="mt-6 space-y-4">
              {hasDynamic ? (
                Object.entries(product.bien_the || {}).map(([attrName, optionsObj]) => {
                  const isMulti = attrName.toLowerCase().includes('topping') || attrName.toLowerCase().includes('đồ kèm');
                  const optionKeys = Object.keys(optionsObj || {});
                  if (optionKeys.length === 0) return null;

                  if (isMulti) {
                    return (
                      <div key={ui(attrName)} className="relative">
                        <span className="block text-xs font-bold text-gray-500  mb-2.5">{ui(attrName)}:</span>
                        <button
                          type="button"
                          onClick={() => setShowDynamicToppings(!showDynamicToppings)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-left font-bold text-sm hover:border-[#b22830] transition-colors"
                        >
                          <span>{dynamicSelections[attrName]?.length > 0 ? ui("Đã chọn ({{v0}})", {v0:dynamicSelections[attrName].length}) : ui("Tuỳ chọn Topping")}</span>
                          <span className="text-gray-400 text-xs">▼</span>
                        </button>
                        {showDynamicToppings && (
                          <div className="w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 max-h-60 overflow-y-auto">
                            <div className="flex flex-col gap-2">
                              {optionKeys.map((opt) => {
                                const isSelected = (dynamicSelections[attrName] || []).includes(opt);
                                return (
                                  <label key={ui(opt)} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-gray-50 rounded-md">
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
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-[#b22830] transition-colors flex-1">{ui(opt)}</span>
                                    <span className="text-sm font-bold text-[#b22830]">+{Number(optionsObj[opt]).toLocaleString(uiLocale())}{ui("đ")}</span>
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
                    <div key={ui(attrName)}>
                      <span className="block text-xs font-bold text-gray-500  mb-2.5">{ui(attrName)}:</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {optionKeys.map((opt) => (
                          <button
                            key={ui(opt)}
                            type="button"
                            onClick={() => setDynamicSelections({...dynamicSelections, [attrName]: opt})}
                            className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
                              dynamicSelections[attrName] === opt ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {ui(opt)} {optionsObj[opt] > 0 ? ui("({{v0}}{{v1}}đ)", {v0:isSizeAttribute(attrName) ? '' : '+',v1:Number(optionsObj[opt]).toLocaleString(uiLocale())}) : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <>
                  <div>
                    <span className="block text-xs font-bold text-gray-500  mb-2.5">{ui("Kích thước:")}</span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {Object.keys(product.sizes || {}).length > 0 ? (
                        Object.keys(product.sizes).map((sz) => (
                          <button key={ui(sz)} type="button" onClick={() => setSelectedSize(sz)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedSize === sz ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                            {ui(sz)} {product.sizes[sz] > 0 ? ui("({{v0}}đ)", {v0:Number(product.sizes[sz]).toLocaleString(uiLocale())}) : ''}
                          </button>
                        ))
                      ) : (
                        <button type="button" className="px-4 py-2 rounded-full border border-[#b22830] text-[#b22830] bg-red-50/60 text-xs font-bold">{ui("Mặc định")}</button>
                      )}
                    </div>
                  </div>

                  {Object.keys(product.luong_da || {}).length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-gray-500  mb-2.5">{ui("Lượng đá:")}</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {Object.keys(product.luong_da).map((ld) => (
                          <button key={ld} type="button" onClick={() => setSelectedLuongDa(ld)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedLuongDa === ld ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{ld}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(product.do_ngot || {}).length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-gray-500  mb-2.5">{ui("Độ ngọt:")}</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {Object.keys(product.do_ngot).map((dn) => (
                          <button key={dn} type="button" onClick={() => setSelectedDoNgot(dn)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedDoNgot === dn ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{dn}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(product.loai_sua || {}).length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-gray-500  mb-2.5">{ui("Loại sữa:")}</span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {Object.keys(product.loai_sua).map((ls) => (
                          <button key={ls} type="button" onClick={() => setSelectedLoaiSua(ls)} className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedLoaiSua === ls ? 'border-[#b22830] text-[#b22830] bg-red-50/60' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{ls} {product.loai_sua[ls] >= 0 ? ui("(+{{v0}}đ)", {v0:Number(product.loai_sua[ls]).toLocaleString(uiLocale())}) : ''}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(product.toppings || {}).length > 0 && (
                    <div className="relative">
                      <span className="block text-xs font-bold text-gray-500  mb-2.5">Topping:</span>
                      <button
                        type="button"
                        onClick={() => setShowToppingsList(!showToppingsList)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-left font-bold text-sm hover:border-[#b22830] transition-colors"
                      >
                        <span>{selectedToppings.length > 0 ? ui("Đã chọn ({{v0}})", {v0:selectedToppings.length}) : ui("Tuỳ chọn Topping")}</span>
                        <span className="text-gray-400 text-xs">▼</span>
                      </button>
                      {showToppingsList && (
                        <div className="w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 max-h-60 overflow-y-auto">
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
                                  <span className="text-sm font-bold text-[#b22830]">+{Number(product.toppings[tp]).toLocaleString(uiLocale())}{ui("đ")}</span>
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
                <button type="button" aria-label={ui("Giảm số lượng")} disabled={pending} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100"><MinusIcon className="w-4 h-4" /></button>
                <span className="w-10 text-center font-bold text-sm text-gray-800">{quantity}</span>
                <button type="button" aria-label={ui("Tăng số lượng")} disabled={pending} onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100"><PlusIcon className="w-4 h-4" /></button>
              </div>
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-red-700">{ui(error)}</p>}
            <div className="mt-6">
              <button type="button" disabled={pending || product.trang_thai === false} onClick={handleAdd} className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#b22830] hover:bg-[#941d28] disabled:opacity-50 text-white font-bold text-sm  tracking-wider shadow-md transition-all">{pending ? ui("Đang thêm…") : product.trang_thai === false ? ui("Tạm hết hàng") : ui("Thêm vào giỏ hàng")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
