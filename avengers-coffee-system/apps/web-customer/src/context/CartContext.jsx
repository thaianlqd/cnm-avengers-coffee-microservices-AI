import { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import { productUnitPrice } from '../lib/productPrice';
import { accountId, getGuestSessionId, isGuestSessionId, cartRequestConfig, mergeGuestCartOnLogin, GUEST_MERGE_KEY } from '../lib/guestSession';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const queryClient = useQueryClient();
  const [guestMergeError, setGuestMergeError] = useState('');
  const mergingRef = useRef(null);
  const pendingCartWrites = useRef(new Set());
  const ownerRevision = useRef(0);
  const trackCartWrite = async (promise) => {
    pendingCartWrites.current.add(promise);
    try { return await promise; } finally { pendingCartWrites.current.delete(promise); }
  };

  const layMaNguoiDungKhach = () => {
    return getGuestSessionId();
  };

  const layMaNguoiDungDangHoatDong = () => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && localStorage.getItem('token')) {
      try {
        const parsed = JSON.parse(savedUser);
        if (accountId(parsed)) {
          return accountId(parsed);
        }
      } catch {
        // Fallback to anonymous id when localStorage user payload is invalid.
      }
    }
    return layMaNguoiDungKhach();
  };

  const [activeUserId, setActiveUserId] = useState(() => layMaNguoiDungDangHoatDong());

  const displayedCartOwner = useRef(activeUserId);

  const { data: serverCartData } = useQuery({
    queryKey: queryKeys.cartByUser(activeUserId),
    queryFn: async () => {
      const response = await apiClient.get(`/cart/${activeUserId}`, cartRequestConfig(activeUserId));
      // V5 cart endpoint returns an envelope. Keep accepting arrays while an
      // older deployment is rolling out so existing sessions do not break.
      return response.data || { items: [] };
    },
    enabled: Boolean(activeUserId),
    staleTime: 15 * 1000,
  });

  useEffect(() => {
    if (displayedCartOwner.current !== activeUserId) {
      displayedCartOwner.current = activeUserId;
      setCart([]);
    }
    if (!serverCartData) return;
    setCart((previousCart) => {
      const serverItems = Array.isArray(serverCartData)
        ? serverCartData
        : (serverCartData?.items || []);
      const mappedFromServer = serverItems.map((item) => {
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
  }, [serverCartData, activeUserId]);

  const themVaoGioMutation = useMutation({
    mutationFn: async (item) => {
      const response = await apiClient.post('/cart', item, cartRequestConfig(item.ma_nguoi_dung));
      return response.data;
    },
  });

  const xoaKhoiGioMutation = useMutation({
    mutationFn: async (cartItemId) => {
      await apiClient.delete(`/cart/${cartItemId}`, cartRequestConfig(activeUserId));
    },
  });

  const xoaToanBoGioMutation = useMutation({
    mutationFn: async (userId) => {
      await apiClient.delete(`/cart/clear/${userId}`, cartRequestConfig(userId));
    },
  });

  const clearCart = async () => {
    if (activeUserId) {
      await trackCartWrite(xoaToanBoGioMutation.mutateAsync(activeUserId));
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(activeUserId) });
    }
    setCart([]);
  };

  const reorderItems = async (orderId, operationId) => {
    if (!orderId || isGuestSessionId(activeUserId)) throw new Error('Bạn đăng nhập để đặt lại đơn nhé.');
    const response = await trackCartWrite(apiClient.post(`/cart/${activeUserId}/reorder`, { order_id: orderId }, {
      ...cartRequestConfig(activeUserId), headers: { ...cartRequestConfig(activeUserId)?.headers,
        'x-idempotency-key': operationId },
    }));
    await refreshCart();
    return response.data;
  };

  const addToCart = async (user, product, quantity = 1, size = '', options = {}) => {
    const maNguoiDung = accountId(user) || activeUserId || layMaNguoiDungKhach();
    if (maNguoiDung !== activeUserId) {
      setActiveUserId(maNguoiDung);
    }

    const availableSizes = product.sizes || {};
    const availableToppings = Object.assign({}, product.toppings || {}, ...Object.entries(product.bien_the || {})
      .filter(([name]) => /topping|đồ kèm/i.test(name)).map(([, choices]) => choices || {}));
    const sizeKeys = Object.keys(availableSizes);
    const defaultSize = sizeKeys.length > 0 ? sizeKeys[0] : (product.size || 'Nhỏ');
    const appliedSize = size || defaultSize;

    const finalPrice = productUnitPrice(product, appliedSize, options);

    const item = {
      ma_nguoi_dung: maNguoiDung,
      ma_san_pham: product.ma_san_pham,
      ten_san_pham: product.ten_san_pham,
      gia_ban: finalPrice,
      hinh_anh_url: product.hinh_anh_url,
      so_luong: quantity,
      size: appliedSize,
      toppings: options.toppings || [],
      topping_prices: (options.toppings || []).map(t => Number(availableToppings[t] || 0)),
      luong_da: options.luongDa || '',
      do_ngot: options.doNgot || '',
      loai_sua: options.loaiSua || '',
      custom_attributes: options.custom_attributes || {}
    };

    if (maNguoiDung) {
      await trackCartWrite(themVaoGioMutation.mutateAsync(item));
      await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(maNguoiDung) });
    }
  };

  const patchCartItem = async (item, patch) => {
    if (!item?.id) throw new Error('Không tìm thấy mã dòng giỏ hàng. Vui lòng tải lại giỏ.');
    await trackCartWrite(apiClient.patch(`/cart/${item.id}`, patch, cartRequestConfig(activeUserId)));
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
      await trackCartWrite(xoaKhoiGioMutation.mutateAsync(item.id));
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
    const revision = ++ownerRevision.current;
    const nextUserId = accountId(user) || layMaNguoiDungKhach();
    if (accountId(user)) {
      let handoff;
      try {
        await Promise.allSettled([...pendingCartWrites.current]);
        if (mergingRef.current && mergingRef.current.userId !== nextUserId) await mergingRef.current.promise.catch(() => undefined);
        if (!mergingRef.current) {
          mergingRef.current = { userId: nextUserId, promise: mergeGuestCartOnLogin({ guestId: getGuestSessionId(), userId: nextUserId,
            storage: localStorage, post: (...args) => apiClient.post(...args) }) };
        }
        handoff = mergingRef.current;
        const merged = await handoff.promise;
        if (merged) {
          queryClient.setQueryData(queryKeys.cartByUser(nextUserId), merged);
          const guestKey = queryKeys.cartByUser(getGuestSessionId());
          queryClient.setQueryData(guestKey, { items: [], user_id: getGuestSessionId() });
          await queryClient.invalidateQueries({ queryKey: guestKey, refetchType: 'none' });
        }
        setGuestMergeError('');
      } catch (error) {
        setGuestMergeError(error?.response?.data?.message || error.message || 'Chưa chuyển được giỏ khách. Các món vẫn được giữ để thử lại.');
      } finally {
        if (handoff && mergingRef.current === handoff) mergingRef.current = null;
      }
    } else {
      setGuestMergeError('');
    }
    if (revision !== ownerRevision.current) return;
    setActiveUserId(nextUserId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.cartByUser(nextUserId) });
  };

  // Recover a pending handoff after a reload, using the same operation id.
  useEffect(() => {
    if (!isGuestSessionId(activeUserId) && localStorage.getItem(GUEST_MERGE_KEY)) {
      syncCartWithUser({ ma_nguoi_dung: activeUserId });
    }
  }, [activeUserId]);

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
        guestMergeError,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
