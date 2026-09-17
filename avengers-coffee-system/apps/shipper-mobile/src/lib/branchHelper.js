import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiện ích chuẩn hoá tên và địa chỉ chi nhánh cho Shipper Mobile
 * 100% dựa trên logic dữ liệu thực tế từ Database (qua API /users/branches/public)
 * Tuyệt đối không hardcode danh sách chi nhánh thủ công.
 */

const BRANCH_CACHE_STORAGE_KEY = 'shipper_cached_branches_v1';
let inMemoryBranchList = [];
let isCacheLoaded = false;

/**
 * Trích xuất danh sách chi nhánh dạng mảng từ nhiều định dạng payload backend khác nhau
 */
export function extractBranchList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

/**
 * Cập nhật danh sách chi nhánh toàn cục (RAM + AsyncStorage)
 * Gọi hàm này ngay khi có dữ liệu từ query API
 */
export function setGlobalBranchList(payload) {
  const list = extractBranchList(payload);
  if (Array.isArray(list) && list.length > 0) {
    inMemoryBranchList = list;
    AsyncStorage.setItem(BRANCH_CACHE_STORAGE_KEY, JSON.stringify(list)).catch(() => {});
  }
}

/**
 * Lấy danh sách chi nhánh hiện có trong bộ nhớ
 */
export function getGlobalBranchList() {
  return inMemoryBranchList;
}

/**
 * Khởi tạo nạp cache chi nhánh từ bộ nhớ lưu trữ offline
 */
export async function initBranchCache() {
  if (isCacheLoaded && inMemoryBranchList.length > 0) return inMemoryBranchList;
  try {
    const cached = await AsyncStorage.getItem(BRANCH_CACHE_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryBranchList = parsed;
      }
    }
  } catch {}
  isCacheLoaded = true;
  return inMemoryBranchList;
}

// Khởi chạy ngầm nạp cache từ storage khi nạp module
initBranchCache();

/**
 * Chuẩn hoá chuỗi để so khớp không phân biệt dấu tiếng Việt, chữ hoa/thường, ký tự đặc biệt
 */
export function normalizeBranchKey(str) {
  if (!str) return '';
  return String(str)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
    .replace(/^(AVENGERS\s*COFFEE|HIGHLANDS\s*COFFEE|CHI\s*NHANH|CO\s*SO|STORE|BRANCH)[_\-\s:—–]*/gi, '')
    .replace(/^(HCM|HN|DN|SG|BD|BNIN|HP|VT)[_\-\s:]*/gi, '')
    .replace(/[_\-\s,.:—–]/g, '');
}

/**
 * Tìm kiếm chi nhánh trong danh sách dựa trên mã, id, tên hoặc địa chỉ
 */
export function findBranchByCode(rawCode, branchPayload) {
  if (!rawCode) return null;

  const passedList = extractBranchList(branchPayload);
  const list = passedList.length > 0 ? passedList : inMemoryBranchList;

  // Nếu người dùng truyền vào payload mới mà memory chưa có, đồng bộ luôn
  if (passedList.length > 0 && inMemoryBranchList.length === 0) {
    setGlobalBranchList(passedList);
  }

  if (!list || list.length === 0) return null;

  const rawStr = String(rawCode).trim();
  const rawUpper = rawStr.toUpperCase();
  const rawKey = normalizeBranchKey(rawStr);

  // 1. So khớp chính xác tuyệt đối mã chi nhánh hoặc UUID id
  let matched = list.find((b) => {
    const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || '').trim().toUpperCase();
    const bId = String(b.id || '').trim();
    return bCode === rawUpper || bId === rawStr;
  });
  if (matched) return matched;

  // 2. So khớp theo mã chuẩn hoá (bỏ _, -, khoảng trắng, tiền tố khu vực)
  if (rawKey.length >= 2) {
    matched = list.find((b) => {
      const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || '');
      return normalizeBranchKey(bCode) === rawKey;
    });
    if (matched) return matched;

    // 3. So khớp theo tên chi nhánh
    matched = list.find((b) => {
      const bName = String(b.ten_chi_nhanh || b.ten_co_so || b.name || '');
      const bNameKey = normalizeBranchKey(bName);
      return bNameKey.includes(rawKey) || rawKey.includes(bNameKey);
    });
    if (matched) return matched;

    // 4. So khớp theo địa chỉ chi nhánh (dành cho trường hợp mã là tên đường)
    matched = list.find((b) => {
      const bAddr = String(b.dia_chi || b.address || '');
      const bAddrKey = normalizeBranchKey(bAddr);
      return bAddrKey.includes(rawKey);
    });
    if (matched) return matched;
  }

  return null;
}

/**
 * Thuật toán phân giải chuỗi tổng quát:
 * Chuyển bất kỳ mã kỹ thuật nào thành tên tiếng Việt đọc được, viết hoa chuẩn danh từ
 * Tuyệt đối không để lộ ký tự gạch dưới '_' hoặc gạch ngang '-'
 */
export function parseGenericBranchTitle(rawCode) {
  if (!rawCode) return 'Avengers Coffee';

  let clean = String(rawCode).trim();

  // Bỏ tiền tố thương hiệu nếu có
  clean = clean.replace(/^(AVENGERS\s*COFFEE|HIGHLANDS\s*COFFEE)[_\-\s:—–]*/gi, '');

  // Bỏ tiền tố khu vực địa lý nếu là dạng mã
  clean = clean.replace(/^(HCM|HN|DN|SG|BD|BNIN|HP|VT)[_\-\s:]+/gi, '');

  // Bỏ tiền tố mã loại điểm bán (CN, KVT, STORE, BRANCH)
  clean = clean.replace(/^(CN|KVT|STORE|BRANCH)[_\-\s:]+/gi, '');

  // Chuyển gạch dưới và gạch nối thành khoảng trắng
  clean = clean.replace(/[_\-]+/g, ' ').trim();

  if (!clean) return 'Avengers Coffee';

  // Chuyển thành dạng Title Case (Viết hoa chữ cái đầu mỗi từ)
  const titleCase = clean
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  return titleCase;
}

/**
 * Lấy tên hiển thị thân thiện của chi nhánh (Ví dụ: "Chi nhánh Điện Biên Phủ", "Chi nhánh Quận 1")
 */
export function formatBranchName(rawCode, branchPayload) {
  const branch = findBranchByCode(rawCode, branchPayload);
  if (branch) {
    const rawName = branch.ten_chi_nhanh || branch.ten_co_so || branch.name;
    if (rawName) {
      const clean = String(rawName)
        .replace(/^(AVENGERS\s*COFFEE|HIGHLANDS\s*COFFEE)[_\-\s—–:]*/gi, '')
        .replace(/[_\-]+/g, ' ')
        .trim();
      return clean.toLowerCase().startsWith('chi nhánh') ? clean : `Chi nhánh ${clean}`;
    }
  }

  const genericTitle = parseGenericBranchTitle(rawCode);
  if (genericTitle.toLowerCase().startsWith('chi nhánh')) {
    return genericTitle;
  }
  return `Chi nhánh ${genericTitle}`;
}

/**
 * Lấy tên đầy đủ gồm thương hiệu (Ví dụ: "Avengers Coffee - Chi nhánh Điện Biên Phủ")
 */
export function formatBranchFullTitle(rawCode, branchPayload) {
  const branch = findBranchByCode(rawCode, branchPayload);
  if (branch) {
    const rawName = branch.ten_chi_nhanh || branch.ten_co_so || branch.name;
    if (rawName) {
      let clean = String(rawName).replace(/[_\-]+/g, ' ').trim();
      if (/^avengers\s*coffee/i.test(clean)) {
        return clean;
      }
      return `Avengers Coffee - ${clean}`;
    }
  }

  const branchName = formatBranchName(rawCode, branchPayload);
  if (/^avengers\s*coffee/i.test(branchName)) {
    return branchName;
  }
  return `Avengers Coffee - ${branchName}`;
}

/**
 * Lấy địa chỉ của chi nhánh (Ưu tiên địa chỉ thật từ database)
 * Không bao giờ để lộ ký tự kỹ thuật gạch dưới '_'
 */
export function formatBranchAddress(rawCode, branchPayload, fallbackAddress = '') {
  const branch = findBranchByCode(rawCode, branchPayload);
  if (branch) {
    const addr = branch.dia_chi || branch.address;
    if (addr && !addr.includes('_')) {
      const city = branch.thanh_pho ? `, ${branch.thanh_pho}` : '';
      const fullAddr = String(addr).trim();
      return fullAddr.includes('Hồ Chí Minh') || fullAddr.includes('TP.') || !city
        ? fullAddr
        : `${fullAddr}${city}`;
    }
  }

  // Nếu có địa chỉ fallback từ đơn hàng và đó là địa chỉ thực tế hợp lệ
  if (
    fallbackAddress &&
    !fallbackAddress.includes('_') &&
    !fallbackAddress.toLowerCase().includes('avengers coffee -')
  ) {
    return String(fallbackAddress).trim();
  }

  const name = formatBranchName(rawCode, branchPayload);
  return `Cửa hàng ${name}`;
}

/**
 * Kiểm tra xem 2 chuỗi mã/tên/id chi nhánh có cùng thuộc 1 cơ sở hay không
 */
export function isBranchMatch(rawA, rawB, branchPayload) {
  if (!rawA || !rawB) return false;
  const strA = String(rawA).trim().toUpperCase();
  const strB = String(rawB).trim().toUpperCase();
  if (strA === strB) return true;

  const repA = strA.replace(/[-_\s]/g, '_');
  const repB = strB.replace(/[-_\s]/g, '_');
  if (repA === repB) return true;

  const keyA = normalizeBranchKey(strA);
  const keyB = normalizeBranchKey(strB);
  if (keyA && keyB && (keyA === keyB || keyA.includes(keyB) || keyB.includes(keyA))) {
    return true;
  }

  const bA = findBranchByCode(rawA, branchPayload);
  const bB = findBranchByCode(rawB, branchPayload);
  if (bA && bB) {
    const codeA = String(bA.ma_chi_nhanh || bA.co_so_ma || bA.id || '').toUpperCase();
    const codeB = String(bB.ma_chi_nhanh || bB.co_so_ma || bB.id || '').toUpperCase();
    return codeA === codeB;
  }

  return false;
}

