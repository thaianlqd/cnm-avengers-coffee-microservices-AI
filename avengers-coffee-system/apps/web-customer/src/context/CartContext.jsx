import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';

const CartContext = createContext();

const SIZE_PRICE_MAP = {
  'Nhỏ': 0,
  'Vừa': 6000,
};

const getAdditionalPriceBySize = (size) => SIZE_PRICE_MAP[size || 'Nhỏ'] || 0;

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

  const changeCartItemSize = async (maSanPham, currentSize, nextSize) => {
    const normalizedCurrentSize = currentSize || 'Nhỏ';
    const normalizedNextSize = nextSize || 'Nhỏ';

    if (normalizedCurrentSize === normalizedNextSize) {
      return;
    }

    const itemCanSua = cart.find(
      (item) => item.ma_san_pham === maSanPham && (item.size || 'Nhỏ') === normalizedCurrentSize,
    );

    if (!itemCanSua) {
      return;
    }

    const basePrice = Number(itemCanSua.gia_ban) - getAdditionalPriceBySize(normalizedCurrentSize);

    await themVaoGioMutation.mutateAsync({
      ma_nguoi_dung: itemCanSua.ma_nguoi_dung,
      ma_san_pham: itemCanSua.ma_san_pham,
      ten_san_pham: itemCanSua.ten_san_pham,
      gia_ban: basePrice + getAdditionalPriceBySize(normalizedNextSize),
      hinh_anh_url: itemCanSua.hinh_anh_url,
      so_luong: itemCanSua.so_luong,
      size: normalizedNextSize,
      toppings: itemCanSua.toppings || [],
      luong_da: itemCanSua.luong_da || '',
      do_ngot: itemCanSua.do_ngot || '',
      loai_sua: itemCanSua.loai_sua || '',
      custom_attributes: itemCanSua.custom_attributes || {}
    });

    if (itemCanSua.id) {
      await xoaKhoiGioMutation.mutateAsync(itemCanSua.id);
    } else {
      setCart((prev) =>
        prev.filter(
          (item) => !(item.ma_san_pham === maSanPham && (item.size || 'Nhỏ') === normalizedCurrentSize),
        ),
      );
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
  };

  const removeFromCart = async (maSanPham, size) => {
    const itemCanXoa = cart.find((i) => i.ma_san_pham === maSanPham && (!size || i.size === size));
    if (!itemCanXoa) {
      return;
    }

    if (itemCanXoa.id) {
      await xoaKhoiGioMutation.mutateAsync(itemCanXoa.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
      return;
    }

    setCart((prev) => prev.filter((i) => !(i.ma_san_pham === maSanPham && i.size === size)));
  };

  const updateCartItemOptions = async (oldItem, newOptions) => {
    if (!oldItem) return;

    const newItem = {
      ma_nguoi_dung: activeUserId || oldItem.ma_nguoi_dung,
      ma_san_pham: oldItem.ma_san_pham,
      ten_san_pham: oldItem.ten_san_pham,
      gia_ban: Number(newOptions.gia_ban) || Number(oldItem.gia_ban) || 0,
      hinh_anh_url: oldItem.hinh_anh_url,
      so_luong: Number(oldItem.so_luong) || 1,
      size: newOptions.size || 'Nhỏ',
      toppings: newOptions.toppings || [],
      luong_da: newOptions.luongDa || '',
      do_ngot: newOptions.doNgot || '',
      loai_sua: newOptions.loaiSua || '',
      custom_attributes: newOptions.custom_attributes || {}
    };

    try {
      if (oldItem.id) {
        await xoaKhoiGioMutation.mutateAsync(oldItem.id);
        await new Promise(resolve => setTimeout(resolve, 200)); // Tránh race condition ở database
        await themVaoGioMutation.mutateAsync(newItem);
      } else {
        setCart((prev) => {
          const next = prev.filter(i => i !== oldItem);
          return [...next, newItem];
        });
      }
    } catch (e) {
      console.error('Lỗi khi cập nhật món:', e);
      alert('Không thể cập nhật món. Lỗi: ' + e.message);
    } finally {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
    }
  };

  const updateCartQuantity = async (maSanPham, size, delta) => {
    const itemCanSua = cart.find((item) => item.ma_san_pham === maSanPham && (!size || item.size === size));
    if (!itemCanSua) {
      return;
    }

    const soLuongMoi = itemCanSua.so_luong + delta;
    if (soLuongMoi <= 0) {
      await removeFromCart(maSanPham, size);
      return;
    }

    await themVaoGioMutation.mutateAsync({
      ma_nguoi_dung: activeUserId || itemCanSua.ma_nguoi_dung,
      ma_san_pham: itemCanSua.ma_san_pham,
      ten_san_pham: itemCanSua.ten_san_pham,
      gia_ban: itemCanSua.gia_ban,
      hinh_anh_url: itemCanSua.hinh_anh_url,
      so_luong: delta,
      size: itemCanSua.size || 'Nhỏ',
      toppings: itemCanSua.toppings || [],
      luong_da: itemCanSua.luong_da || '',
      do_ngot: itemCanSua.do_ngot || '',
      loai_sua: itemCanSua.loai_sua || '',
      custom_attributes: itemCanSua.custom_attributes || {}
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
  };

  const syncCartWithUser = async (user) => {
    const nextUserId = user?.ma_nguoi_dung || layMaNguoiDungKhach();
    setActiveUserId(nextUserId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(nextUserId) });
  };

  const refreshCart = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
  };

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