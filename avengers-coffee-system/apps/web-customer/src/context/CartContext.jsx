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

  const layMaNguoiDungKhach = () => {
    const key = 'avengers_guest_user_id';
    const existed = localStorage.getItem(key);
    if (existed) {
      return existed;
    }
    const created = `guest-${Date.now()}`;
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
        // Fallback to guest id when localStorage user payload is invalid.
      }
    }
    return layMaNguoiDungKhach();
  };

  const [activeUserId, setActiveUserId] = useState(() => layMaNguoiDungDangHoatDong());

  const { data: serverCart = [] } = useQuery({
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
      const mappedFromServer = (serverCart || []).map((item) => {
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
  }, [serverCart]);

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

  const addToCart = async (user, product, quantity = 1, size = 'Nhỏ') => {
    const maNguoiDung = user?.ma_nguoi_dung || activeUserId || layMaNguoiDungKhach();
    if (maNguoiDung !== activeUserId) {
      setActiveUserId(maNguoiDung);
    }

    const appliedSize = size || 'Nhỏ';

    // Tính toán giá dựa trên size
    const additionalPrice = getAdditionalPriceBySize(appliedSize);
    const finalPrice = Number(product.gia_ban) + additionalPrice;

    const item = {
      ma_nguoi_dung: maNguoiDung,
      ma_san_pham: product.ma_san_pham,
      ten_san_pham: product.ten_san_pham,
      gia_ban: finalPrice,
      hinh_anh_url: product.hinh_anh_url,
      so_luong: quantity,
      size: appliedSize,
    };

    setCart((prev) => {
      const existedIdx = prev.findIndex(
        (localItem) => localItem.ma_san_pham === item.ma_san_pham && (localItem.size || 'Nhỏ') === item.size,
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
      ma_nguoi_dung: itemCanSua.ma_nguoi_dung,
      ma_san_pham: itemCanSua.ma_san_pham,
      ten_san_pham: itemCanSua.ten_san_pham,
      gia_ban: itemCanSua.gia_ban,
      hinh_anh_url: itemCanSua.hinh_anh_url,
      so_luong: delta,
      size: itemCanSua.size || 'Nhỏ',
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
        cartCount,
        activeUserId,
        syncCartWithUser,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);