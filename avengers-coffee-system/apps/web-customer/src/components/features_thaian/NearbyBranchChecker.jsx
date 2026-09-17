import React, { useEffect, useMemo, useState, useRef } from 'react';
import { 
  BuildingStorefrontIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  MapPinIcon, 
  ClockIcon,
  ArrowPathIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon
} from '@heroicons/react/24/solid';
import { apiClient } from '../../lib/apiClient';
import { 
  calculateDistanceKm, 
  resolveBranchCoordinates, 
  MAX_DELIVERY_RADIUS_KM 
} from '../../lib/geocodingService';

export default function NearbyBranchChecker({
  branches = [],
  userCoordinates = null,
  cart = [],
  selectedBranch = '',
  onSelectBranch,
  onStockStatusChange,
}) {
  const [branchInventories, setBranchInventories] = useState({});
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const userManuallySelectedRef = useRef(false);
  const prevCoordsKeyRef = useRef(null);

  const coordsKey = userCoordinates 
    ? `${Number(userCoordinates.lat).toFixed(4)},${Number(userCoordinates.lng).toFixed(4)}` 
    : null;

  // Khi tọa độ thay đổi (người dùng đổi địa chỉ nhận hàng), reset lựa chọn thủ công để tự động lấy quán gần nhất
  useEffect(() => {
    if (prevCoordsKeyRef.current !== coordsKey) {
      prevCoordsKeyRef.current = coordsKey;
      userManuallySelectedRef.current = false;
    }
  }, [coordsKey]);

  // 1. Tính khoảng cách tới tất cả chi nhánh và lọc chi nhánh <= 5km
  const nearbyBranches = useMemo(() => {
    if (!userCoordinates || !branches || branches.length === 0) {
      return [];
    }

    const calculated = branches
      .filter(b => b.trang_thai !== 'INACTIVE')
      .map(b => {
        const coords = resolveBranchCoordinates(b);
        const distance = coords
          ? calculateDistanceKm(
              userCoordinates.lat,
              userCoordinates.lng,
              coords.lat,
              coords.lng
            )
          : null;
        return {
          ...b,
          coords,
          distance: distance != null ? distance : 999,
        };
      })
      .filter(b => b.coords != null && b.distance <= MAX_DELIVERY_RADIUS_KM)
      .sort((a, b) => a.distance - b.distance);

    return calculated;
  }, [branches, userCoordinates]);

  // 2. Fetch tồn kho cho tất cả chi nhánh nằm trong bán kính 5km
  useEffect(() => {
    if (nearbyBranches.length === 0 || cart.length === 0) {
      return;
    }

    let isMounted = true;
    setIsLoadingInventory(true);

    const fetchAllInventories = async () => {
      const invMap = {};
      const fetchPromises = nearbyBranches.slice(0, 15).map(async b => {
        const code = b.ma_chi_nhanh || b.co_so_ma || b.branch_code;
        try {
          const res = await apiClient.get(`/inventory/items?branch_code=${code}`);
          const items = Array.isArray(res?.data) ? res.data : res?.data?.items || [];
          invMap[code] = items;
        } catch {
          invMap[code] = [];
        }
      });

      await Promise.allSettled(fetchPromises);
      if (isMounted) {
        setBranchInventories(invMap);
        setIsLoadingInventory(false);
      }
    };

    fetchAllInventories();
    return () => { isMounted = false; };
  }, [nearbyBranches, cart]);

  // 3. Phân tích trạng thái còn món của từng chi nhánh
  const evaluatedBranches = useMemo(() => {
    if (nearbyBranches.length === 0) return [];

    return nearbyBranches.map(b => {
      const code = b.ma_chi_nhanh || b.co_so_ma || b.branch_code;
      const invItems = branchInventories[code] || [];

      // Kiểm tra từng món trong giỏ hàng
      const missingItems = [];
      cart.forEach(cartItem => {
        const found = invItems.find(
          inv => String(inv.ma_san_pham) === String(cartItem.ma_san_pham)
        );
        // Nếu có khai báo tồn kho và dang_kinh_doanh = false hoặc so_luong_ton <= 0
        if (found && (found.dang_kinh_doanh === false || found.dang_kinh_doanh === 'false' || (found.so_luong_ton !== undefined && Number(found.so_luong_ton) <= 0))) {
          missingItems.push(cartItem.ten_san_pham || cartItem.name || `Sản phẩm #${cartItem.ma_san_pham}`);
        }
      });

      const isFullyAvailable = missingItems.length === 0;

      return {
        ...b,
        code,
        isFullyAvailable,
        missingItems,
      };
    });
  }, [nearbyBranches, branchInventories, cart]);

  // Chi nhánh khả dụng (còn đủ món)
  const availableBranches = useMemo(() => {
    return evaluatedBranches.filter(b => b.isFullyAvailable);
  }, [evaluatedBranches]);

  // Sắp xếp chi nhánh: Chi nhánh đang được chọn tiếp nhận đơn lên HÀNG ĐẦU TIÊN
  const sortedBranches = useMemo(() => {
    if (evaluatedBranches.length === 0) return [];
    return [...evaluatedBranches].sort((a, b) => {
      // 1. Chi nhánh đang tiếp nhận đơn lên đầu
      if (a.code === selectedBranch) return -1;
      if (b.code === selectedBranch) return 1;

      // 2. Chi nhánh còn món ưu tiên trước chi nhánh hết món
      if (a.isFullyAvailable && !b.isFullyAvailable) return -1;
      if (!a.isFullyAvailable && b.isFullyAvailable) return 1;

      // 3. Sắp xếp theo khoảng cách km
      return a.distance - b.distance;
    });
  }, [evaluatedBranches, selectedBranch]);

  // Chỉ hiển thị 5 chi nhánh gần nhất lúc đầu, bấm xem thêm để mở rộng
  const displayedBranches = useMemo(() => {
    if (showAll) return sortedBranches;
    return sortedBranches.slice(0, 5);
  }, [sortedBranches, showAll]);

  // 4. Báo cáo trạng thái về cho Cart Page
  useEffect(() => {
    if (!userCoordinates) {
      if (onStockStatusChange) {
        onStockStatusChange({
          hasCoordinates: false,
          hasNearbyBranch: true,
          canOrder: true,
          reason: '',
          nearbyCount: 0,
        });
      }
      return;
    }

    if (nearbyBranches.length === 0) {
      if (onStockStatusChange) {
        onStockStatusChange({
          hasCoordinates: true,
          hasNearbyBranch: false,
          canOrder: false,
          reason: 'NO_NEARBY_BRANCH',
          message: 'Không tìm thấy chi nhánh nào trong bán kính 5km gần địa chỉ của bạn.',
          nearbyCount: 0,
        });
      }
      return;
    }

    if (availableBranches.length === 0) {
      // Có chi nhánh trong 5km nhưng tất cả đều hết món
      const allMissing = Array.from(
        new Set(evaluatedBranches.flatMap(b => b.missingItems))
      );
      if (onStockStatusChange) {
        onStockStatusChange({
          hasCoordinates: true,
          hasNearbyBranch: true,
          canOrder: false,
          reason: 'OUT_OF_STOCK_NEARBY',
          message: 'Món đang chọn hiện tại hết hàng ở các chi nhánh gần bạn (bán kính 5km), vui lòng chọn món khác.',
          missingItems: allMissing,
          nearbyCount: nearbyBranches.length,
        });
      }
      return;
    }

    // Tự động chọn chi nhánh gần nhất còn đủ món:
    // 1. Nếu người dùng chưa bấm chọn thủ công -> Luôn chọn chi nhánh gần nhất (availableBranches[0])
    // 2. Nếu người dùng đã chọn thủ công nhưng chi nhánh đó không còn hợp lệ -> Trả về chi nhánh gần nhất
    const isManualValid = userManuallySelectedRef.current && availableBranches.some(b => b.code === selectedBranch);
    if (!isManualValid && availableBranches.length > 0) {
      const closestBranchCode = availableBranches[0].code;
      if (selectedBranch !== closestBranchCode) {
        onSelectBranch(closestBranchCode);
      }
    }

    if (onStockStatusChange) {
      onStockStatusChange({
        hasCoordinates: true,
        hasNearbyBranch: true,
        canOrder: true,
        reason: '',
        availableBranches,
        nearbyCount: nearbyBranches.length,
      });
    }
  }, [userCoordinates, nearbyBranches, availableBranches, evaluatedBranches, selectedBranch, onSelectBranch, onStockStatusChange]);

  if (!userCoordinates) {
    return null;
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase text-[#c41230] tracking-widest flex items-center gap-1.5">
          <BuildingStorefrontIcon className="w-4 h-4 text-[#c41230]" />
          <span>Cửa hàng phục vụ (Bán kính 5km)</span>
        </h4>
        {isLoadingInventory && (
          <span className="text-[11px] text-gray-500 flex items-center gap-1">
            <ArrowPathIcon className="w-3 h-3 animate-spin text-[#c41230]" />
            <span>Đang kiểm tra món...</span>
          </span>
        )}
      </div>

      {/* TRƯỜNG HỢP 1: KHÔNG CÓ CHI NHÁNH NÀO TRONG 5KM */}
      {nearbyBranches.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-amber-900 shadow-2xs space-y-1 animate-fadeIn">
          <div className="flex items-center gap-2 font-bold text-xs text-amber-800">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Địa chỉ vượt quá phạm vi giao hàng 5km</span>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            Rất tiếc, hiện tại không có chi nhánh nào trong bán kính <strong>5.0 km</strong> gần địa chỉ của bạn.
          </p>
          <div className="pt-0.5 text-[11px] text-amber-800 font-semibold">
            👉 Vui lòng đổi địa chỉ nhận hoặc chọn hình thức <strong>Lấy tại quán</strong>.
          </div>
        </div>
      ) : availableBranches.length === 0 ? (
        /* TRƯỜNG HỢP 2: CÓ CHI NHÁNH TRONG 5KM NHƯNG TẤT CẢ ĐỀU HẾT MÓN */
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-900 shadow-xs space-y-2 animate-fadeIn">
          <div className="flex items-center gap-1.5 font-bold text-xs text-red-700">
            <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>Món đang chọn hiện tại hết hàng ở các chi nhánh gần bạn</span>
          </div>
          <p className="text-xs text-red-800 leading-relaxed">
            Các chi nhánh trong bán kính 5km ({nearbyBranches.map(b => b.ten_chi_nhanh).slice(0, 2).join(', ')}) hiện không còn đủ món trong giỏ hàng.
          </p>
          {evaluatedBranches.some(b => b.missingItems.length > 0) && (
            <div className="bg-white p-2 rounded-lg border border-red-100 text-[11px] space-y-0.5">
              <span className="font-bold text-red-800">Món đang tạm hết hàng:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-red-700">
                {Array.from(new Set(evaluatedBranches.flatMap(b => b.missingItems))).map((item, idx) => (
                  <li key={idx}><strong>{item}</strong></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] font-bold text-red-600">
            👉 Vui lòng đổi món khác hoặc đổi địa chỉ giao hàng.
          </p>
        </div>
      ) : (
        /* TRƯỜNG HỢP 3: CÓ CHI NHÁNH TRONG 5KM CÒN ĐỦ MÓN */
        <div className="space-y-2 bg-[#faf7f5] p-2.5 rounded-2xl border border-gray-200/80">
          {/* KHỐI RIÊNG ĐỘC LẬP ĐỂ CUỘN TỰ DO - KHÔNG LÀM TRANG DÀI RA */}
          <div className="max-h-[240px] overflow-y-auto pr-1 space-y-2 scroll-smooth">
            {displayedBranches.map((branch) => {
              const isSelected = selectedBranch === branch.code;
              const isAvailable = branch.isFullyAvailable;

              return (
                <button
                  key={branch.code}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    userManuallySelectedRef.current = true;
                    onSelectBranch(branch.code);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-start justify-between transition-all cursor-pointer ${
                    !isAvailable
                      ? 'border-gray-200 bg-gray-100/60 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-gray-200/80 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="space-y-0.5 flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs truncate ${isSelected ? 'text-emerald-950 font-black' : 'text-gray-800 font-bold'}`}>
                        {branch.ten_chi_nhanh || branch.name}
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100 shrink-0">
                        {branch.distance} km
                      </span>
                      {isAvailable ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 shrink-0">
                          Còn món
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-200 shrink-0">
                          Tạm hết
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      {branch.dia_chi}
                    </p>
                    {isSelected && (
                      <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 pt-0.5">
                        <CheckCircleIcon className="w-3 h-3" />
                        <span>Chi nhánh tiếp nhận đơn</span>
                      </p>
                    )}
                    {!isAvailable && branch.missingItems.length > 0 && (
                      <p className="text-[10px] font-bold text-red-600 truncate">
                        Hết: {branch.missingItems.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0 ml-1 mt-1">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* NÚT XEM THÊM CHI NHÁNH NẰM TRONG 5KM */}
          {sortedBranches.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="w-full py-1.5 text-center text-xs font-bold text-[#c41230] hover:text-[#9a0e26] bg-white rounded-lg transition-all border border-gray-200 cursor-pointer flex items-center justify-center gap-1"
            >
              {showAll ? (
                <>
                  <ChevronUpIcon className="w-3.5 h-3.5" />
                  <span>Thu gọn</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                  <span>Xem thêm {sortedBranches.length - 5} chi nhánh gần bạn</span>
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 px-1 pt-0.5">
            <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
            <span>Giao dự kiến: <strong>15 - 25 phút</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
