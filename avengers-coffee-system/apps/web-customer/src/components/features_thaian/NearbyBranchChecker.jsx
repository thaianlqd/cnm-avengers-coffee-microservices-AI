import React, { useEffect, useMemo, useState, useRef } from 'react';
import { 
  BuildingStorefrontIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  MapPinIcon, 
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon
} from '@heroicons/react/24/solid';
import { apiClient } from '../../lib/apiClient';
import { evaluateBranchAvailability, inventoryRows, closestCompatibleBranch, inventoryBranchesToCheck } from '../../lib/branchAvailability';
import { 
  calculateDistanceKm, 
  resolveBranchCoordinates, 
  MAX_DELIVERY_RADIUS_KM 
} from '../../lib/geocodingService';

export default function NearbyBranchChecker({
  branches = [],
  userCoordinates = null,
  cart = [],
  products = [],
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

  const inventoryPlan = useMemo(() => inventoryBranchesToCheck(nearbyBranches, showAll, selectedBranch),
    [nearbyBranches, showAll, selectedBranch]);
  const inventoryPlanKey = inventoryPlan.map(b => b.ma_chi_nhanh || b.co_so_ma || b.branch_code).join('|');
  const hasCartItems = cart.length > 0;

  // 2. Fetch tồn kho cho tất cả chi nhánh nằm trong bán kính 5km
  useEffect(() => {
    if (!inventoryPlanKey || !hasCartItems) {
      return;
    }

    let isMounted = true;
    setIsLoadingInventory(true);
    setBranchInventories({});

    const fetchAllInventories = async () => {
      const invMap = {};
      const codes = inventoryPlanKey.split('|');
      // Limit concurrent requests, but verify every branch we display when
      // expanded. The old 15-row cap left the remaining cards unverified forever.
      let cursor = 0;
      const worker = async () => {
        while (isMounted && cursor < codes.length) {
          const code = codes[cursor++];
          try {
            const res = await apiClient.get(`/inventory/items?branch_code=${encodeURIComponent(code)}`);
            invMap[code] = inventoryRows(res?.data);
          } catch {
            invMap[code] = null;
          }
          if (isMounted) setBranchInventories(previous => ({ ...previous, [code]: invMap[code] }));
        }
      };
      await Promise.allSettled(Array.from({ length: Math.min(4, codes.length) }, worker));
      if (isMounted) {
        setBranchInventories(invMap);
        setIsLoadingInventory(false);
      }
    };

    fetchAllInventories();
    return () => { isMounted = false; };
  }, [inventoryPlanKey, hasCartItems]);

  // 3. Phân tích trạng thái còn món của từng chi nhánh
  const evaluatedBranches = useMemo(() => {
    if (inventoryPlan.length === 0) return [];

    return inventoryPlan.map(b => {
      const code = b.ma_chi_nhanh || b.co_so_ma || b.branch_code;
      const availability = evaluateBranchAvailability(cart, products,
        branchInventories[code]);
      const missingItems = availability.unavailable_products.map(item => item.product_name);

      return {
        ...b,
        code,
        ...availability,
        isFullyAvailable: availability.is_fully_available,
        checkingInventory: isLoadingInventory && !Object.hasOwn(branchInventories, code),
        missingItems,
      };
    });
  }, [inventoryPlan, branchInventories, cart, products, isLoadingInventory]);

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
          canOrder: false,
          reason: 'AVAILABILITY_UNVERIFIED',
          message: 'Chưa xác minh được cửa hàng phục vụ địa chỉ này.',
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
      const unverified = evaluatedBranches.some(b => b.unverified_products.length > 0);
      // No nearby branch has a verified, fully compatible cart.
      const allMissing = Array.from(
        new Set(evaluatedBranches.flatMap(b => b.missingItems))
      );
      if (onStockStatusChange) {
        onStockStatusChange({
          hasCoordinates: true,
          hasNearbyBranch: true,
          canOrder: false,
          reason: unverified ? 'AVAILABILITY_UNVERIFIED' : 'OUT_OF_STOCK_NEARBY',
          message: unverified ? 'Chưa xác minh được tình trạng món tại cửa hàng. Vui lòng thử lại.'
            : 'Các cửa hàng gần bạn đang tạm ngưng một số món trong giỏ. Vui lòng đổi món hoặc địa chỉ.',
          missingItems: allMissing,
          nearbyCount: nearbyBranches.length,
        });
      }
      return;
    }

    // Tự động chọn chi nhánh gần nhất còn đủ món:
    // 1. Nếu người dùng chưa bấm chọn thủ công -> Luôn chọn chi nhánh gần nhất (availableBranches[0])
    // 2. Nếu người dùng đã chọn thủ công nhưng chi nhánh đó không còn hợp lệ -> Trả về chi nhánh gần nhất
    const closestBranchCode = closestCompatibleBranch(evaluatedBranches, selectedBranch, userManuallySelectedRef.current);
    if (closestBranchCode) {
      if (selectedBranch !== closestBranchCode) {
        onSelectBranch(closestBranchCode);
      }
    }

    if (onStockStatusChange) {
      onStockStatusChange({
        hasCoordinates: true,
        hasNearbyBranch: true,
        canOrder: availableBranches.some(b => b.code === selectedBranch),
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
      ) : (
        /* Explain every nearby branch, including partial and unverified carts. */
        <div className="space-y-2 bg-[#faf7f5] p-2.5 rounded-2xl border border-gray-200/80">
          {/* KHỐI RIÊNG ĐỘC LẬP ĐỂ CUỘN TỰ DO - KHÔNG LÀM TRANG DÀI RA */}
          <div className="max-h-[240px] overflow-y-auto pr-1 space-y-2 scroll-smooth">
            {displayedBranches.map((branch) => {
              const isSelected = selectedBranch === branch.code && branch.isFullyAvailable;
              const isAvailable = branch.isFullyAvailable;

              return (
                <button
                  key={branch.code}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    if (!isAvailable) return;
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
                          {branch.missingItems.length ? 'Tạm ngưng' : branch.checkingInventory ? 'Đang kiểm tra' : 'Chưa đọc được'}
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
                    {branch.available_products.length > 0 && (
                      <p className="text-[10px] text-emerald-700">
                        {isAvailable ? 'Còn đủ các món trong giỏ' : `Còn: ${branch.available_products.map(item => item.product_name).join(', ')}`}
                      </p>
                    )}
                    {!isAvailable && branch.missingItems.length > 0 && (
                      <p className="text-[10px] font-bold text-red-600 truncate">
                        Tạm ngưng: {branch.missingItems.join(', ')}
                      </p>
                    )}
                    {branch.unverified_products.length > 0 && (
                      <p className="text-[10px] text-amber-700">
                        {branch.checkingInventory ? 'Đang kiểm tra' : 'Chưa đọc được tình trạng bán'}: {branch.unverified_products.map(item => item.product_name).join(', ')}
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
          {nearbyBranches.length > 5 && (
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
                  <span>Xem thêm {nearbyBranches.length - 5} chi nhánh gần bạn</span>
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
