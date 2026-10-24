import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../admin-dashboard/constants';

/** Branch inventory owns selling availability; catalog flags still apply system-wide. */
export function useKioskAvailability(branchCode, token) {
  const [state, setState] = useState({
    branchCode: '',
    items: [],
    loading: false,
    error: ''
  });
  const [savingId, setSavingId] = useState(null);
  const currentBranch = useRef(branchCode);
  currentBranch.current = branchCode;
  const reload = useCallback(async () => {
    const branch = branchCode;
    if (!branch) return;
    setState(previous => ({
      branchCode: branch,
      items: previous.branchCode === branch ? previous.items : [],
      loading: true,
      error: ''
    }));
    try {
      const response = await fetch(`${API_BASE_URL}/inventory/items?branch_code=${encodeURIComponent(branch)}`, {
        headers: token ? {
          Authorization: `Bearer ${token}`
        } : {}
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Không tải được trạng thái bán của kiosk.');
      if (currentBranch.current === branch) setState({
        branchCode: branch,
        items: Array.isArray(payload) ? payload : payload.items || [],
        loading: false,
        error: ''
      });
    } catch (error) {
      if (currentBranch.current === branch) setState({
        branchCode: branch,
        items: [],
        loading: false,
        error: error.message || 'Không tải được trạng thái bán của kiosk.'
      });
    }
  }, [branchCode, token]);
  useEffect(() => {
    reload();
  }, [reload]);
  const ready = Boolean(branchCode && state.branchCode === branchCode && !state.loading && !state.error);
  const isSelling = product => {
    const globalStatus = product.trang_thai ?? product.dang_ban ?? true;
    const item = state.branchCode === branchCode && state.items.find(row => Number(row.ma_san_pham) === Number(product.ma_san_pham || product.id));
    return Boolean(globalStatus) && item?.dang_kinh_doanh !== false;
  };
  const toggle = async (product, nextSelling) => {
    if (!ready || savingId !== null) return;
    const branch = branchCode,
      id = Number(product.ma_san_pham || product.id);
    const stock = state.items.find(item => Number(item.ma_san_pham) === id);
    setSavingId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/inventory/items/${id}/selling`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {
            Authorization: `Bearer ${token}`
          } : {})
        },
        body: JSON.stringify({
          branch_code: branch,
          dang_kinh_doanh: Boolean(nextSelling)
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Không cập nhật được trạng thái bán.');
      if (currentBranch.current === branch) setState(previous => ({
        ...previous,
        error: '',
        items: [...previous.items.filter(item => Number(item.ma_san_pham) !== id), {
          ...stock,
          ...payload,
          ma_san_pham: id,
          dang_kinh_doanh: Boolean(nextSelling)
        }]
      }));
    } catch (error) {
      if (currentBranch.current === branch) setState(previous => ({
        ...previous,
        error: error.message || 'Không cập nhật được trạng thái bán.'
      }));
    } finally {
      setSavingId(null);
    }
  };
  return {
    isSelling,
    toggle,
    reload,
    savingId,
    ready,
    loading: state.loading,
    error: state.error
  };
}
