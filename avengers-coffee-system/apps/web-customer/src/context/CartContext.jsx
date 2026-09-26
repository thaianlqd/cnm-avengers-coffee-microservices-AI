import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const queryClient = useQueryClient();
  const ANON_PREFIX = 'anon-';

  const layMaNguoiDungKhach = () => {
    const key = 'avengers_anon_user_id';
    const existed = localStorage.getItem(key);
    if (existed) {
      return existed;
    }
    const created = `${ANON_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    localStorage.setItem(key, created);
    return created;
  };

  const layMaNguoiDungDangHoatDong = () => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.ma_nguoi_dung) {
          return parsed.ma_nguoi_dung;
        }
      } catch {
        // Fallback to anonymous id when localStorage user payload is invalid.
      }
    }
    return layMaNguoiDungKhach();
  };

  const [activeUserId, setActiveUserId] = useState(() => layMaNguoiDungDangHoatDong());

  const { data: serverCartData } = useQuery({
    queryKey: queryKeys.cartByUser(activeUserId),
    queryFn: async () => {
      const response = await apiClient.get(`/cart/${activeUserId}`);
      return response.data || [];
    },
    enabled: Boolean(activeUserId),
    staleTime: 15 * 1000,
  });

  useEffect(() => {
    setCart((previousCart) => {
      const mappedFromServer = (serverCartData || []).map((item) => {
        const existed = previousCart.find(
          (localItem) =>
            localItem.id === item.id ||
            (localItem.ma_san_pham === item.ma_san_pham && (localItem.size || 'Nhỏ') === (item.size || 'Nhỏ')),
        );
        return {
          ...item,
          size: item.size || existed?.size || 'Nhỏ',
        };
      });
      return mappedFromServer;
    });
  }, [serverCartData]);

  const themVaoGioMutation = useMutation({
    mutationFn: async (item) => {
      const response = await apiClient.post('/cart', item);
      return response.data;
    },
  });

  const xoaKhoiGioMutation = useMutation({
    mutationFn: async (cartItemId) => {
      await apiClient.delete(`/cart/${cartItemId}`);
    },
  });

  const xoaToanBoGioMutation = useMutation({
    mutationFn: async (userId) => {
      await apiClient.delete(`/cart/clear/${userId}`);
    },
  });

  const clearCart = async () => {
    setCart([]);
    if (activeUserId) {
      await xoaToanBoGioMutation.mutateAsync(activeUserId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
    }
  };

  const reorderItems = async (items) => {
    // Xóa giỏ hàng hiện tại trước
    await clearCart();
    
    // Đẩy tuần tự từng món vào giỏ
    for (const item of items) {
      // Mock product format expected by addToCart
      const productMock = {
        ma_san_pham: item.ma_san_pham,
        ten_san_pham: item.ten_san_pham,
        gia_ban: item.gia_ban,
        hinh_anh_url: item.hinh_anh_url,
      };
      
      const options = {
        loaiSua: '',
        toppings: [],
        luongDa: '',
        doNgot: '',
      };
      
      await addToCart({ ma_nguoi_dung: activeUserId }, productMock, item.so_luong, item.kich_co || 'Nhỏ', options);
    }
  };

  const addToCart = async (user, product, quantity = 1, size = '', options = {}) => {
    const maNguoiDung = user?.ma_nguoi_dung || activeUserId || layMaNguoiDungKhach();
    if (maNguoiDung !== activeUserId) {
      setActiveUserId(maNguoiDung);
    }

    const availableSizes = product.sizes || {};
    const availableToppings = product.toppings || {};
    const sizeKeys = Object.keys(availableSizes);
    const defaultSize = sizeKeys.length > 0 ? sizeKeys[0] : (product.size || 'Nhỏ');
    const appliedSize = size || defaultSize;

    // Tính toán giá dựa trên size & biến thể động
    let finalPrice = 0;
    if (product.bien_the && typeof product.bien_the === 'object' && Object.keys(product.bien_the).length > 0) {
      const base = Number(product.gia_ban || product.price || 30000);
      let surcharge = 0;
      const customAttrs = options.custom_attributes || {};
      for (const [attrName, selection] of Object.entries(customAttrs)) {
        const optionsObj = product.bien_the[attrName] || {};
        if (Array.isArray(selection)) {
          for (const val of selection) {
            surcharge += Number(optionsObj[val]) || 0;
          }
        } else {
          surcharge += Number(optionsObj[selection]) || 0;
        }
      }
      finalPrice = base + surcharge;
    } else {
      const basePrice = (appliedSize && availableSizes[appliedSize] !== undefined) 
        ? Number(availableSizes[appliedSize]) 
        : Number(product.gia_ban || product.price || 30000);

      const toppingsPrice = (options.toppings || []).reduce((acc, t) => acc + Number(availableToppings[t] || 0), 0);

      const availableLoaiSua = product.loai_sua || {};
      const loaiSuaPrice = (options.loaiSua && availableLoaiSua[options.loaiSua] !== undefined) ? Number(availableLoaiSua[options.loaiSua]) : 0;

      finalPrice = basePrice + toppingsPrice + loaiSuaPrice;
    }

    const item = {
      ma_nguoi_dung: maNguoiDung,
      ma_san_pham: product.ma_san_pham,
      ten_san_pham: product.ten_san_pham,
      gia_ban: finalPrice,
      hinh_anh_url: product.hinh_anh_url,
      so_luong: quantity,
      size: appliedSize,
      toppings: options.toppings || [],
      topping_prices: (options.toppings || []).map(t => Number(availableToppings[t] || 5000)),
      luong_da: options.luongDa || '',
      do_ngot: options.doNgot || '',
      loai_sua: options.loaiSua || '',
      custom_attributes: options.custom_attributes || {}
    };

    setCart((prev) => {
      const isSameOptions = (a, b) => {
        if ((a.size || 'Nhỏ') !== (b.size || 'Nhỏ')) return false;
        if (a.luong_da !== b.luong_da) return false;
        if (a.do_ngot !== b.do_ngot) return false;
        if (a.loai_sua !== b.loai_sua) return false;
        const aToppings = [...(a.toppings || [])].sort().join(',');
        const bToppings = [...(b.toppings || [])].sort().join(',');
        if (aToppings !== bToppings) return false;
        
        // Compare custom_attributes
        const aAttrs = a.custom_attributes || {};
        const bAttrs = b.custom_attributes || {};
        const aKeys = Object.keys(aAttrs);
        const bKeys = Object.keys(bAttrs);
        if (aKeys.length !== bKeys.length) return false;
        for (const key of aKeys) {
          const valA = aAttrs[key];
          const valB = bAttrs[key];
          if (Array.isArray(valA) && Array.isArray(valB)) {
            if ([...valA].sort().join(',') !== [...valB].sort().join(',')) return false;
          } else if (valA !== valB) {
            return false;
          }
        }
        return true;
      };

      const existedIdx = prev.findIndex(
        (localItem) => localItem.ma_san_pham === item.ma_san_pham && isSameOptions(localItem, item),
      );
      if (existedIdx === -1) {
        return [...prev, item];
      }

      const next = [...prev];
      next[existedIdx] = {
        ...next[existedIdx],
        so_luong: next[existedIdx].so_luong + quantity,
      };
      return next;
    });

    if (maNguoiDung) {
      await themVaoGioMutation.mutateAsync(item);
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(maNguoiDung) });
    }
  };

  const patchCartItem = async (item, patch) => {
    if (!item?.id) throw new Error('Không tìm thấy mã dòng giỏ hàng. Vui lòng tải lại giỏ.');
    await apiClient.patch(`/cart/${item.id}`, patch);
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
    window.dispatchEvent(new CustomEvent('refresh-cart'));
  };

  const changeCartItemSize = async (itemOrProductId, currentSize, nextSize) => {
    const item = typeof itemOrProductId === 'object'
      ? itemOrProductId
      : cart.find((row) => row.ma_san_pham === itemOrProductId && (row.size || 'Nhỏ') === (currentSize || 'Nhỏ'));
    if (!item || (item.size || 'Nhỏ') === (nextSize || 'Nhỏ')) return;
    await patchCartItem(item, { size: nextSize || 'Nhỏ' });
  };

  const removeFromCart = async (itemOrProductId, size) => {
    const item = typeof itemOrProductId === 'object'
      ? itemOrProductId
      : cart.find((row) => row.ma_san_pham === itemOrProductId && (!size || row.size === size));
    if (!item) return;
    if (item.id) {
      await xoaKhoiGioMutation.mutateAsync(item.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
      window.dispatchEvent(new CustomEvent('refresh-cart'));
      return;
    }
    setCart((previous) => previous.filter((row) => row !== item));
  };

  const updateCartItemOptions = async (oldItem, newOptions) => {
    if (!oldItem) return;
    try {
      await patchCartItem(oldItem, {
        product_id: newOptions.ma_san_pham || oldItem.ma_san_pham,
        quantity: Number(oldItem.so_luong) || 1,
        size: newOptions.size || oldItem.size || 'Nhỏ',
        toppings: newOptions.toppings || [],
        luong_da: newOptions.luongDa ?? oldItem.luong_da ?? '',
        do_ngot: newOptions.doNgot ?? oldItem.do_ngot ?? '',
        loai_sua: newOptions.loaiSua ?? oldItem.loai_sua ?? '',
        custom_attributes: newOptions.custom_attributes || {},
      });
    } catch (e) {
      console.error('Lỗi khi cập nhật món:', e);
      alert('Không thể cập nhật món. ' + (e.message || 'Vui lòng thử lại.'));
    }
  };

  const updateCartQuantity = async (itemOrProductId, sizeOrDelta, legacyDelta) => {
    const directItem = typeof itemOrProductId === 'object';
    const item = directItem
      ? itemOrProductId
      : cart.find((row) => row.ma_san_pham === itemOrProductId && (!sizeOrDelta || row.size === sizeOrDelta));
    const delta = directItem ? sizeOrDelta : legacyDelta;
    if (!item) return;
    const quantity = Number(item.so_luong) + Number(delta);
    if (quantity <= 0) return removeFromCart(item);
    try {
      await patchCartItem(item, { quantity });
    } catch (e) {
      console.error('Không thể đồng bộ số lượng giỏ hàng với máy chủ:', e);
    }
  };

  const syncCartWithUser = async (user) => {
    const nextUserId = user?.ma_nguoi_dung || layMaNguoiDungKhach();
    setActiveUserId(nextUserId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(nextUserId) });
  };

  const refreshCart = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
  };

  useEffect(() => {
    const handler = () => refreshCart();
    window.addEventListener('refresh-cart', handler);
    return () => window.removeEventListener('refresh-cart', handler);
  }, [activeUserId]);

  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.so_luong, 0), [cart]);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        changeCartItemSize,
        updateCartItemOptions,
        cartCount,
        activeUserId,
        syncCartWithUser,
        refreshCart,
        clearCart,
        reorderItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
