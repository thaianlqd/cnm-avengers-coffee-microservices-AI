import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useCart } from '../context/CartContext';

export default function CartEditModal({ cartItem, product, isOpen, onClose }) {
  const { updateCartItemOptions } = useCart();
  
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedLuongDa, setSelectedLuongDa] = useState('');
  const [selectedDoNgot, setSelectedDoNgot] = useState('');
  const [selectedLoaiSua, setSelectedLoaiSua] = useState('');
  const [selectedToppings, setSelectedToppings] = useState([]);

  useEffect(() => {
    if (cartItem) {
      setSelectedSize(cartItem.size || '');
      setSelectedLuongDa(cartItem.luong_da || '');
      setSelectedDoNgot(cartItem.do_ngot || '');
      setSelectedLoaiSua(cartItem.loai_sua || '');
      setSelectedToppings(cartItem.toppings || []);
    }
  }, [cartItem]);

  if (!isOpen || !product || !cartItem) return null;

  const availableSizes = product?.sizes || {};
  const sizeKeys = Object.keys(availableSizes);

  const availableToppings = product?.toppings || {};
  const toppingKeys = Object.keys(availableToppings);

  const availableLuongDa = product?.luong_da || {};
  const ldKeys = Object.keys(availableLuongDa);

  const availableDoNgot = product?.do_ngot || {};
  const dnKeys = Object.keys(availableDoNgot);

  const availableLoaiSua = product?.loai_sua || {};
  const lsKeys = Object.keys(availableLoaiSua);

  const basePrice = (selectedSize && availableSizes[selectedSize] !== undefined) 
    ? Number(availableSizes[selectedSize]) 
    : Number(product?.gia_ban || product?.price || 30000);

  const toppingsPrice = selectedToppings.reduce((acc, t) => acc + Number(availableToppings[t] || 0), 0);
  const loaiSuaPrice = (selectedLoaiSua && availableLoaiSua[selectedLoaiSua] !== undefined) ? Number(availableLoaiSua[selectedLoaiSua]) : 0;
  
  const finalPrice = basePrice + toppingsPrice + loaiSuaPrice;

  const handleUpdate = () => {
    updateCartItemOptions(cartItem, {
      size: selectedSize,
      luongDa: selectedLuongDa,
      doNgot: selectedDoNgot,
      loaiSua: selectedLoaiSua,
      toppings: selectedToppings,
      gia_ban: finalPrice
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[24px] overflow-hidden shadow-2xl relative flex flex-col animate-in zoom-in duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">Chỉnh sửa món</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 bg-[#f4f0eb] rounded-xl flex-shrink-0 flex items-center justify-center">
              <img src={product.hinh_anh_url} alt={product.ten_san_pham} className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-800">{product.ten_san_pham}</h3>
              <p className="text-[#b22830] font-bold text-xl">{finalPrice.toLocaleString('vi-VN')}đ</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Kích thước */}
            {sizeKeys.length > 0 && (
              <div>
                <span className="block text-sm font-bold text-gray-700 mb-2">Kích thước:</span>
                <div className="flex flex-wrap gap-2">
                  {sizeKeys.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                        selectedSize === sz
                          ? 'border-[#b22830] bg-[#b22830] text-white'
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
              <div>
                <span className="block text-sm font-bold text-gray-700 mb-2">Lượng đá:</span>
                <div className="flex flex-wrap gap-2">
                  {ldKeys.map((ld) => (
                    <button
                      key={ld}
                      type="button"
                      onClick={() => setSelectedLuongDa(ld)}
                      className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                        selectedLuongDa === ld
                          ? 'border-[#b22830] bg-[#b22830] text-white'
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
              <div>
                <span className="block text-sm font-bold text-gray-700 mb-2">Độ ngọt:</span>
                <div className="flex flex-wrap gap-2">
                  {dnKeys.map((dn) => (
                    <button
                      key={dn}
                      type="button"
                      onClick={() => setSelectedDoNgot(dn)}
                      className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                        selectedDoNgot === dn
                          ? 'border-[#b22830] bg-[#b22830] text-white'
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
              <div>
                <span className="block text-sm font-bold text-gray-700 mb-2">Loại sữa:</span>
                <div className="flex flex-wrap gap-2">
                  {lsKeys.map((ls) => (
                    <button
                      key={ls}
                      type="button"
                      onClick={() => setSelectedLoaiSua(ls)}
                      className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                        selectedLoaiSua === ls
                          ? 'border-[#b22830] bg-[#b22830] text-white'
                          : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                      }`}
                    >
                      {ls} {availableLoaiSua[ls] >= 0 ? `(+${Number(availableLoaiSua[ls]).toLocaleString('vi-VN')}đ)` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toppings */}
            {toppingKeys.length > 0 && (
              <div>
                <span className="block text-sm font-bold text-gray-700 mb-2">Thêm Topping:</span>
                <div className="flex flex-wrap gap-2">
                  {toppingKeys.map((tp) => {
                    const isSelected = selectedToppings.includes(tp);
                    return (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedToppings(selectedToppings.filter(t => t !== tp));
                          } else {
                            setSelectedToppings([...selectedToppings, tp]);
                          }
                        }}
                        className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'border-[#b22830] bg-[#b22830] text-white'
                            : 'border-gray-300 text-gray-700 hover:border-[#b22830]'
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-4 h-4" />}
                        {tp} (+{Number(availableToppings[tp]).toLocaleString('vi-VN')}đ)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            className="px-6 py-2.5 rounded-xl bg-[#b22830] text-white font-bold shadow-md hover:bg-[#911e25] transition-colors"
          >
            Cập nhật giỏ hàng
          </button>
        </div>
      </div>
    </div>
  );
}
