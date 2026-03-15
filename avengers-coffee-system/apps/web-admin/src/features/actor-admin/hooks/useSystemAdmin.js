import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const DEFAULT_USER_FORM = {
  ten_dang_nhap: '',
  mat_khau: '',
  ho_ten: '',
  email: '',
  vai_tro: 'STAFF',
  co_so_ma: 'MAC_DINH_CHI',
}

const DEFAULT_BRANCH_FORM = {
  ma_chi_nhanh: '',
  ten_chi_nhanh: '',
  dia_chi_chi_tiet: '',
  thanh_pho: 'HO_CHI_MINH',
  quan_huyen: '',
  phuong_xa: '',
  so_dien_thoai: '',
  trang_thai: 'ACTIVE',
}

const LOCATION_TREE = {
  HO_CHI_MINH: {
    label: 'TP. Ho Chi Minh',
    districts: {
      QUAN_1: {
        label: 'Quan 1',
        wards: ['Ben Nghe', 'Ben Thanh', 'Da Kao', 'Nguyen Thai Binh', 'Pham Ngu Lao', 'Tan Dinh'],
      },
      QUAN_3: {
        label: 'Quan 3',
        wards: ['Vo Thi Sau', 'Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5'],
      },
      BINH_THANH: {
        label: 'Quan Binh Thanh',
        wards: ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 11', 'Ward 13', 'Ward 14', 'Ward 15', 'Ward 24', 'Ward 25', 'Ward 26'],
      },
      PHU_NHUAN: {
        label: 'Quan Phu Nhuan',
        wards: ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5', 'Ward 7', 'Ward 8', 'Ward 9', 'Ward 10', 'Ward 11', 'Ward 13', 'Ward 15', 'Ward 17'],
      },
      THU_DUC: {
        label: 'TP Thu Duc',
        wards: ['An Khanh', 'An Loi Dong', 'An Phu', 'Hiep Binh Chanh', 'Hiep Binh Phuoc', 'Linh Chieu', 'Linh Dong', 'Linh Tay', 'Linh Trung', 'Thao Dien', 'Tam Binh', 'Tam Phu'],
      },
    },
  },
  HA_NOI: {
    label: 'Ha Noi',
    districts: {
      BA_DINH: {
        label: 'Quan Ba Dinh',
        wards: ['Cong Vi', 'Doi Can', 'Giang Vo', 'Kim Ma', 'Lieu Giai', 'Ngoc Ha', 'Ngoc Khanh', 'Phuc Xa', 'Truc Bach', 'Vinh Phuc'],
      },
      HOAN_KIEM: {
        label: 'Quan Hoan Kiem',
        wards: ['Chuong Duong', 'Cua Dong', 'Cua Nam', 'Dong Xuan', 'Hang Bac', 'Hang Bong', 'Hang Buom', 'Hang Dao', 'Hang Gai', 'Hang Ma', 'Ly Thai To', 'Phan Chu Trinh', 'Tran Hung Dao'],
      },
      DONG_DA: {
        label: 'Quan Dong Da',
        wards: ['Cat Linh', 'Hang Bot', 'Kham Thien', 'Kim Lien', 'Lang Thuong', 'Nam Dong', 'O Cho Dua', 'Phuong Lien', 'Quoc Tu Giam', 'Thinh Quang', 'Thinh Liet', 'Van Chuong'],
      },
    },
  },
  DA_NANG: {
    label: 'Da Nang',
    districts: {
      HAI_CHAU: {
        label: 'Quan Hai Chau',
        wards: ['Binh Hien', 'Binh Thuan', 'Hai Chau 1', 'Hai Chau 2', 'Hoa Cuong Bac', 'Hoa Cuong Nam', 'Nam Duong', 'Phuoc Ninh', 'Thanh Binh', 'Thach Thang', 'Thuan Phuoc'],
      },
      THANH_KHE: {
        label: 'Quan Thanh Khe',
        wards: ['An Khe', 'Chinh Gian', 'Hoa Khe', 'Tam Thuan', 'Tan Chinh', 'Thac Gian', 'Thanh Khe Dong', 'Thanh Khe Tay', 'Vinh Trung', 'Xuan Ha'],
      },
      SON_TRA: {
        label: 'Quan Son Tra',
        wards: ['An Hai Bac', 'An Hai Dong', 'An Hai Tay', 'Man Thai', 'Nai Hien Dong', 'Phuoc My', 'Tho Quang'],
      },
    },
  },
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .toLowerCase()
    .trim()
}

function parseBranchAddress(address) {
  const parts = String(address || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (!parts.length) {
    return { ...DEFAULT_BRANCH_FORM }
  }

  let cityCode = ''
  let districtCode = ''
  let wardName = ''

  const allCityCodes = Object.keys(LOCATION_TREE)
  const normalizedParts = parts.map((item) => normalizeText(item))

  cityCode = allCityCodes.find((code) => {
    const cityLabel = LOCATION_TREE[code].label
    const normalizedCityLabel = normalizeText(cityLabel)
    return normalizedParts.some((part) => part.includes(normalizedCityLabel) || normalizedCityLabel.includes(part))
  }) || ''

  if (!cityCode) {
    if (normalizedParts.some((part) => part.includes('tp hcm') || part.includes('ho chi minh') || part.includes('tphcm'))) {
      cityCode = 'HO_CHI_MINH'
    }
    if (normalizedParts.some((part) => part.includes('ha noi'))) {
      cityCode = 'HA_NOI'
    }
    if (normalizedParts.some((part) => part.includes('da nang'))) {
      cityCode = 'DA_NANG'
    }
  }

  if (cityCode) {
    const districtEntries = Object.entries(LOCATION_TREE[cityCode].districts)
    districtCode = districtEntries.find(([, district]) => {
      const normalizedDistrictLabel = normalizeText(district.label)
      return normalizedParts.some((part) => part.includes(normalizedDistrictLabel) || normalizedDistrictLabel.includes(part))
    })?.[0] || ''

    if (districtCode) {
      const wardList = LOCATION_TREE[cityCode].districts[districtCode].wards
      wardName = wardList.find((ward) => {
        const normalizedWard = normalizeText(ward)
        return normalizedParts.some((part) => part.includes(normalizedWard) || normalizedWard.includes(part))
      }) || ''
    }
  }

  const knownTokens = [
    cityCode ? normalizeText(LOCATION_TREE[cityCode]?.label) : '',
    districtCode ? normalizeText(LOCATION_TREE[cityCode]?.districts[districtCode]?.label) : '',
    wardName ? normalizeText(wardName) : '',
    'tp hcm',
    'tphcm',
    'ho chi minh',
  ].filter(Boolean)

  const detailParts = parts.filter((part) => {
    const normalized = normalizeText(part)
    return !knownTokens.some((token) => normalized.includes(token) || token.includes(normalized))
  })

  return {
    ...DEFAULT_BRANCH_FORM,
    dia_chi_chi_tiet: detailParts.join(', '),
    thanh_pho: cityCode || DEFAULT_BRANCH_FORM.thanh_pho,
    quan_huyen: districtCode,
    phuong_xa: wardName,
  }
}

function composeBranchAddress(form) {
  const cityLabel = LOCATION_TREE[form.thanh_pho]?.label || ''
  const districtLabel = LOCATION_TREE[form.thanh_pho]?.districts?.[form.quan_huyen]?.label || ''
  const parts = [form.dia_chi_chi_tiet, form.phuong_xa, districtLabel, cityLabel]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return parts.join(', ')
}

const DEFAULT_MENU_FORM = {
  name: '',
  category_code: '',
  price: 0,
  image: '',
  description: '',
  dang_ban: true,
}

const PROMOTION_TYPES = [
  { code: 'PERCENT', label: 'Giảm theo %' },
  { code: 'FIXED', label: 'Giảm số tiền cố định' },
  { code: 'FREE_ITEM', label: 'Tặng kèm sản phẩm' },
]

const DEFAULT_PROMOTION_FORM = {
  ma_khuyen_mai: '',
  ten_khuyen_mai: '',
  mo_ta: '',
  loai_khuyen_mai: 'PERCENT',
  gia_tri: 0,
  gia_tri_don_toi_thieu: 0,
  giam_toi_da: '',
  so_luong_toi_da: 0,
  gioi_han_moi_nguoi: 1,
  ngay_bat_dau: '',
  ngay_ket_thuc: '',
  trang_thai: 'ACTIVE',
  hien_thi_cho_khach: true,
  ten_san_pham_tang: '',
  hinh_anh: '',
}

const FALLBACK_BRANCH_OPTIONS = [
  { code: 'MAC_DINH_CHI', name: 'Mạc Đĩnh Chi' },
  { code: 'THE_GRACE_TOWER', name: 'The Grace Tower' },
]

export function useSystemAdmin() {
  const [activeTab, setActiveTab] = useState('overview')

  const [statsState, setStatsState] = useState({ loading: true, error: '', data: null })

  const [userFilters, setUserFilters] = useState({ role: '', branch_code: '', q: '' })
  const [usersState, setUsersState] = useState({ loading: true, error: '', items: [] })
  const [savingUser, setSavingUser] = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [userForm, setUserForm] = useState(DEFAULT_USER_FORM)

  const [categoriesState, setCategoriesState] = useState({ loading: true, error: '', items: [] })
  const [menuState, setMenuState] = useState({ loading: true, error: '', items: [] })
  const [savingMenu, setSavingMenu] = useState(false)
  const [editingMenuId, setEditingMenuId] = useState('')
  const [menuForm, setMenuForm] = useState(DEFAULT_MENU_FORM)
  const [uploadState, setUploadState] = useState({ loading: false, error: '', success: '' })

  const [branchesState, setBranchesState] = useState({ loading: true, error: '', items: [] })
  const [savingBranch, setSavingBranch] = useState(false)
  const [editingBranchCode, setEditingBranchCode] = useState('')
  const [branchForm, setBranchForm] = useState(DEFAULT_BRANCH_FORM)
  const [locationSearch, setLocationSearch] = useState({ city: '', district: '', ward: '' })

  const [promotionsState, setPromotionsState] = useState({ loading: true, error: '', items: [] })
  const [savingPromotion, setSavingPromotion] = useState(false)
  const [editingPromotionCode, setEditingPromotionCode] = useState('')
  const [promotionForm, setPromotionForm] = useState(DEFAULT_PROMOTION_FORM)
  const [promotionFilter, setPromotionFilter] = useState({ status: '', type: '', q: '' })

  const cityOptions = useMemo(() => {
    const all = Object.entries(LOCATION_TREE).map(([code, city]) => ({ code, label: city.label }))
    const keyword = normalizeText(locationSearch.city)
    if (!keyword) return all
    return all.filter((city) => normalizeText(city.label).includes(keyword))
  }, [locationSearch.city])

  const districtOptions = useMemo(() => {
    const city = LOCATION_TREE[branchForm.thanh_pho]
    if (!city) return []
    const all = Object.entries(city.districts).map(([code, district]) => ({ code, label: district.label }))
    const keyword = normalizeText(locationSearch.district)
    if (!keyword) return all
    return all.filter((district) => normalizeText(district.label).includes(keyword))
  }, [branchForm.thanh_pho, locationSearch.district])

  const wardOptions = useMemo(() => {
    const district = LOCATION_TREE[branchForm.thanh_pho]?.districts?.[branchForm.quan_huyen]
    if (!district) return []
    const all = district.wards.map((ward) => ({ code: ward, label: ward }))
    const keyword = normalizeText(locationSearch.ward)
    if (!keyword) return all
    return all.filter((ward) => normalizeText(ward.label).includes(keyword))
  }, [branchForm.thanh_pho, branchForm.quan_huyen, locationSearch.ward])

  const branchAddressPreview = useMemo(() => composeBranchAddress(branchForm), [branchForm])

  const branchOptions = useMemo(() => {
    const rows = (branchesState.items || []).filter((item) => item.trang_thai === 'ACTIVE')
    const normalizedRows = rows.map((item) => ({ code: item.ma_chi_nhanh, name: item.ten_chi_nhanh }))
    return normalizedRows.length ? normalizedRows : FALLBACK_BRANCH_OPTIONS
  }, [branchesState.items])

  const branchNameMap = useMemo(() => {
    const dynamicMap = (branchesState.items || []).reduce((acc, item) => {
      acc[item.ma_chi_nhanh] = item.ten_chi_nhanh
      return acc
    }, {})
    return {
      MAC_DINH_CHI: 'Mạc Đĩnh Chi',
      THE_GRACE_TOWER: 'The Grace Tower',
      ...dynamicMap,
    }
  }, [branchesState.items])

  const loadBranches = async () => {
    setBranchesState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/admin/branches`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc danh sach chi nhanh')
      const items = payload?.items || []
      setBranchesState({ loading: false, error: '', items })

      const activeBranch = items.find((item) => item.trang_thai === 'ACTIVE')
      if (activeBranch) {
        setUserForm((prev) => ({
          ...prev,
          co_so_ma: prev.co_so_ma || activeBranch.ma_chi_nhanh,
        }))
      }
    } catch (error) {
      setBranchesState({ loading: false, error: error.message || 'Khong tai duoc danh sach chi nhanh', items: [] })
    }
  }

  const loadStats = async () => {
    setStatsState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/admin/stats`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc thong ke he thong')
      setStatsState({ loading: false, error: '', data: payload })
    } catch (error) {
      setStatsState({ loading: false, error: error.message || 'Khong tai duoc thong ke he thong', data: null })
    }
  }

  const loadUsers = async (filters = userFilters) => {
    setUsersState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const params = new URLSearchParams()
      if (filters.role) params.set('role', filters.role)
      if (filters.branch_code) params.set('branch_code', filters.branch_code)
      if (filters.q) params.set('q', filters.q)

      const query = params.toString()
      const response = await fetch(`${API_BASE_URL}/users/admin/accounts${query ? `?${query}` : ''}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc danh sach tai khoan')
      setUsersState({ loading: false, error: '', items: payload?.items || [] })
    } catch (error) {
      setUsersState({ loading: false, error: error.message || 'Khong tai duoc danh sach tai khoan', items: [] })
    }
  }

  const loadCategories = async () => {
    setCategoriesState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/menu/categories`)
      const payload = await response.json().catch(() => ([]))
      if (!response.ok) throw new Error('Khong tai duoc danh muc menu')
      const items = Array.isArray(payload) ? payload : []
      setCategoriesState({ loading: false, error: '', items })
      if (items.length) {
        setMenuForm((prev) => ({ ...prev, category_code: prev.category_code || String(items[0].code) }))
      }
    } catch (error) {
      setCategoriesState({ loading: false, error: error.message || 'Khong tai duoc danh muc menu', items: [] })
    }
  }

  const loadMenu = async () => {
    setMenuState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/menu/items?sort=price_desc`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc menu tong')
      setMenuState({ loading: false, error: '', items: payload?.items || [] })
    } catch (error) {
      setMenuState({ loading: false, error: error.message || 'Khong tai duoc menu tong', items: [] })
    }
  }

  const loadPromotions = async () => {
    setPromotionsState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/promotions/admin`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Khong tai duoc danh sach khuyen mai')
      setPromotionsState({ loading: false, error: '', items: payload?.items || [] })
    } catch (error) {
      setPromotionsState({ loading: false, error: error.message || 'Khong tai duoc danh sach khuyen mai', items: [] })
    }
  }

  const startEditPromotion = (item) => {
    setEditingPromotionCode(item.ma_khuyen_mai)
    const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 16) : '')
    setPromotionForm({
      ma_khuyen_mai: item.ma_khuyen_mai || '',
      ten_khuyen_mai: item.ten_khuyen_mai || '',
      mo_ta: item.mo_ta || '',
      loai_khuyen_mai: item.loai_khuyen_mai || 'PERCENT',
      gia_tri: item.gia_tri ?? 0,
      gia_tri_don_toi_thieu: item.gia_tri_don_toi_thieu ?? 0,
      giam_toi_da: item.giam_toi_da !== null && item.giam_toi_da !== undefined ? String(item.giam_toi_da) : '',
      so_luong_toi_da: item.so_luong_toi_da ?? 0,
      gioi_han_moi_nguoi: item.gioi_han_moi_nguoi ?? 1,
      ngay_bat_dau: fmt(item.ngay_bat_dau),
      ngay_ket_thuc: fmt(item.ngay_ket_thuc),
      trang_thai: item.trang_thai || 'ACTIVE',
      hien_thi_cho_khach: item.hien_thi_cho_khach !== false,
      ten_san_pham_tang: item.ten_san_pham_tang || '',
      hinh_anh: item.hinh_anh || '',
    })
  }

  const cancelEditPromotion = () => {
    setEditingPromotionCode('')
    setPromotionForm(DEFAULT_PROMOTION_FORM)
  }

  const savePromotion = async () => {
    setSavingPromotion(true)
    try {
      const payload = {
        ...promotionForm,
        gia_tri: Number(promotionForm.gia_tri || 0),
        gia_tri_don_toi_thieu: Number(promotionForm.gia_tri_don_toi_thieu || 0),
        giam_toi_da: promotionForm.giam_toi_da !== '' && promotionForm.giam_toi_da !== null
          ? Number(promotionForm.giam_toi_da)
          : null,
        so_luong_toi_da: Number(promotionForm.so_luong_toi_da || 0),
        gioi_han_moi_nguoi: Number(promotionForm.gioi_han_moi_nguoi || 1),
        ngay_bat_dau: promotionForm.ngay_bat_dau || null,
        ngay_ket_thuc: promotionForm.ngay_ket_thuc || null,
        hien_thi_cho_khach: Boolean(promotionForm.hien_thi_cho_khach),
        ten_san_pham_tang: promotionForm.ten_san_pham_tang || null,
        hinh_anh: promotionForm.hinh_anh || null,
      }

      const method = editingPromotionCode ? 'PATCH' : 'POST'
      const endpoint = editingPromotionCode
        ? `${API_BASE_URL}/promotions/admin/${editingPromotionCode}`
        : `${API_BASE_URL}/promotions/admin`

      const sendPayload = editingPromotionCode
        ? (({ ma_khuyen_mai: _unused, loai_khuyen_mai: _unused2, ...rest }) => rest)(payload)
        : payload

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendPayload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong luu duoc khuyen mai')

      cancelEditPromotion()
      await loadPromotions()
    } catch (error) {
      window.alert(error.message || 'Khong luu duoc khuyen mai')
    } finally {
      setSavingPromotion(false)
    }
  }

  const deletePromotion = async (code) => {
    if (!window.confirm('Xoa khuyen mai nay? Hanh dong nay khong the hoan tac.')) return
    try {
      const response = await fetch(`${API_BASE_URL}/promotions/admin/${code}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong xoa duoc khuyen mai')
      if (editingPromotionCode === code) cancelEditPromotion()
      await loadPromotions()
    } catch (error) {
      window.alert(error.message || 'Khong xoa duoc khuyen mai')
    }
  }

  const promotionFilteredItems = useMemo(() => {
    let list = promotionsState.items || []
    if (promotionFilter.status) {
      list = list.filter((item) => item.trang_thai === promotionFilter.status)
    }
    if (promotionFilter.type) {
      list = list.filter((item) => item.loai_khuyen_mai === promotionFilter.type)
    }
    if (promotionFilter.q.trim()) {
      const kw = promotionFilter.q.trim().toLowerCase()
      list = list.filter(
        (item) =>
          String(item.ma_khuyen_mai).toLowerCase().includes(kw) ||
          String(item.ten_khuyen_mai).toLowerCase().includes(kw) ||
          String(item.mo_ta || '').toLowerCase().includes(kw),
      )
    }
    return list
  }, [promotionsState.items, promotionFilter])

  useEffect(() => {
    loadStats()
    loadUsers()
    loadBranches()
    loadCategories()
    loadMenu()
    loadPromotions()
  }, [])

  const startEditUser = (item) => {
    setEditingUserId(item.ma_nguoi_dung)
    setUserForm({
      ten_dang_nhap: item.ten_dang_nhap || '',
      mat_khau: '',
      ho_ten: item.ho_ten || '',
      email: item.email || '',
      vai_tro: item.vai_tro || 'STAFF',
      co_so_ma: item.co_so_ma || 'MAC_DINH_CHI',
      trang_thai: item.trang_thai || 'ACTIVE',
    })
  }

  const cancelEditUser = () => {
    setEditingUserId('')
    setUserForm({
      ...DEFAULT_USER_FORM,
      co_so_ma: branchOptions[0]?.code || DEFAULT_USER_FORM.co_so_ma,
    })
  }

  const startEditBranch = (item) => {
    const parsedAddress = parseBranchAddress(item.dia_chi)
    setEditingBranchCode(item.ma_chi_nhanh)
    setLocationSearch({ city: '', district: '', ward: '' })
    setBranchForm({
      ...parsedAddress,
      ma_chi_nhanh: item.ma_chi_nhanh,
      ten_chi_nhanh: item.ten_chi_nhanh || '',
      so_dien_thoai: item.so_dien_thoai || '',
      trang_thai: item.trang_thai || 'ACTIVE',
    })
  }

  const cancelEditBranch = () => {
    setEditingBranchCode('')
    setLocationSearch({ city: '', district: '', ward: '' })
    setBranchForm(DEFAULT_BRANCH_FORM)
  }

  const saveBranch = async () => {
    setSavingBranch(true)
    try {
      const fullAddress = composeBranchAddress(branchForm)
      const payload = {
        ma_chi_nhanh: branchForm.ma_chi_nhanh,
        ten_chi_nhanh: branchForm.ten_chi_nhanh,
        dia_chi: fullAddress || undefined,
        so_dien_thoai: branchForm.so_dien_thoai || undefined,
        trang_thai: branchForm.trang_thai,
      }

      const method = editingBranchCode ? 'PATCH' : 'POST'
      const endpoint = editingBranchCode
        ? `${API_BASE_URL}/users/admin/branches/${editingBranchCode}`
        : `${API_BASE_URL}/users/admin/branches`

      const requestPayload = editingBranchCode
        ? {
            ten_chi_nhanh: payload.ten_chi_nhanh,
            dia_chi: payload.dia_chi,
            so_dien_thoai: payload.so_dien_thoai,
            trang_thai: payload.trang_thai,
          }
        : payload

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong luu duoc chi nhanh')

      cancelEditBranch()
      await Promise.all([loadBranches(), loadUsers(), loadStats()])
    } catch (error) {
      window.alert(error.message || 'Khong luu duoc chi nhanh')
    } finally {
      setSavingBranch(false)
    }
  }

  const deleteBranch = async (branchCode) => {
    if (!window.confirm('Xoa chi nhanh nay?')) return
    try {
      const response = await fetch(`${API_BASE_URL}/users/admin/branches/${branchCode}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong xoa duoc chi nhanh')
      if (editingBranchCode === branchCode) cancelEditBranch()
      await Promise.all([loadBranches(), loadUsers(), loadStats()])
    } catch (error) {
      window.alert(error.message || 'Khong xoa duoc chi nhanh')
    }
  }

  const saveUser = async () => {
    setSavingUser(true)
    try {
      if (!editingUserId && !userForm.mat_khau) {
        throw new Error('Vui long nhap mat khau cho tai khoan moi')
      }

      const payload = {
        ten_dang_nhap: userForm.ten_dang_nhap,
        mat_khau: userForm.mat_khau || undefined,
        ho_ten: userForm.ho_ten,
        email: userForm.email || undefined,
        vai_tro: userForm.vai_tro,
        co_so_ma: userForm.co_so_ma,
        trang_thai: userForm.trang_thai || 'ACTIVE',
      }

      const method = editingUserId ? 'PATCH' : 'POST'
      const endpoint = editingUserId
        ? `${API_BASE_URL}/users/admin/accounts/${editingUserId}`
        : `${API_BASE_URL}/users/admin/accounts`

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong luu duoc tai khoan')

      cancelEditUser()
      await Promise.all([loadUsers(), loadStats()])
    } catch (error) {
      window.alert(error.message || 'Khong luu duoc tai khoan')
    } finally {
      setSavingUser(false)
    }
  }

  const deleteUser = async (userId) => {
    if (!window.confirm('Xoa tai khoan nay? Hanh dong nay khong the hoan tac.')) return
    try {
      const response = await fetch(`${API_BASE_URL}/users/admin/accounts/${userId}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong xoa duoc tai khoan')
      if (editingUserId === userId) cancelEditUser()
      await Promise.all([loadUsers(), loadStats()])
    } catch (error) {
      window.alert(error.message || 'Khong xoa duoc tai khoan')
    }
  }

  const normalizeImagePath = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/images/products/')) return raw
    const filename = raw.split('/').pop()
    return filename ? `/images/products/${filename}` : raw
  }

  const uploadMenuImage = async (file) => {
    if (!file) return

    setUploadState({ loading: true, error: '', success: '' })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('productName', menuForm.name || file.name)

      const response = await fetch(`${API_BASE_URL}/menu/upload-image`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong tai anh len duoc')

      setMenuForm((prev) => ({ ...prev, image: result.file_url || '' }))
      setUploadState({ loading: false, error: '', success: `Da tai anh: ${result.file_name || file.name}` })
      return result
    } catch (error) {
      setUploadState({ loading: false, error: error.message || 'Khong tai anh len duoc', success: '' })
      throw error
    }
  }

  const clearMenuImage = () => {
    setMenuForm((prev) => ({ ...prev, image: '' }))
    setUploadState({ loading: false, error: '', success: '' })
  }

  const startEditMenu = (item) => {
    setEditingMenuId(item.id)
    setMenuForm({
      name: item.name || '',
      category_code: String(item.category_code || ''),
      price: Number(item.price || 0),
      image: item.image || '',
      description: item.description || '',
      dang_ban: Boolean(item.dang_ban),
    })
  }

  const cancelEditMenu = () => {
    setEditingMenuId('')
    setMenuForm((prev) => ({ ...DEFAULT_MENU_FORM, category_code: prev.category_code || '' }))
    setUploadState({ loading: false, error: '', success: '' })
  }

  const saveMenu = async () => {
    setSavingMenu(true)
    try {
      const payload = {
        name: menuForm.name,
        category_code: menuForm.category_code,
        price: Number(menuForm.price || 0),
        image: normalizeImagePath(menuForm.image),
        description: menuForm.description,
        dang_ban: Boolean(menuForm.dang_ban),
      }

      const method = editingMenuId ? 'PATCH' : 'POST'
      const endpoint = editingMenuId
        ? `${API_BASE_URL}/menu/items/${editingMenuId}`
        : `${API_BASE_URL}/menu/items`

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong luu duoc mon')

      cancelEditMenu()
      await loadMenu()
    } catch (error) {
      window.alert(error.message || 'Khong luu duoc mon')
    } finally {
      setSavingMenu(false)
    }
  }

  const deleteMenu = async (itemId) => {
    if (!window.confirm('Xoa mon nay khoi menu tong?')) return
    try {
      const response = await fetch(`${API_BASE_URL}/menu/items/${itemId}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Khong xoa duoc mon')
      if (editingMenuId === itemId) cancelEditMenu()
      await loadMenu()
    } catch (error) {
      window.alert(error.message || 'Khong xoa duoc mon')
    }
  }

  const roleChartRows = useMemo(() => {
    const byRole = statsState.data?.by_role || {}
    const total = Math.max(Number(statsState.data?.total_users || 0), 1)
    return ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'].map((role) => {
      const count = Number(byRole[role] || 0)
      return {
        role,
        count,
        percent: Math.round((count / total) * 100),
      }
    })
  }, [statsState.data])

  const branchChartRows = useMemo(() => {
    const byBranch = statsState.data?.by_branch || {}
    const rows = Object.entries(byBranch).map(([code, count]) => ({
      code,
      label: branchNameMap[code] || code,
      count: Number(count || 0),
    }))

    const maxCount = Math.max(1, ...rows.map((row) => row.count))
    return rows
      .sort((a, b) => b.count - a.count)
      .map((row) => ({
        ...row,
        percentOfMax: Math.round((row.count / maxCount) * 100),
      }))
  }, [statsState.data, branchNameMap])

  const dashboardSummary = useMemo(() => {
    const totalUsers = Number(statsState.data?.total_users || 0)
    const activeUsers = Number(statsState.data?.active_users || 0)
    const inactiveUsers = Number(statsState.data?.inactive_users || 0)
    const byRole = statsState.data?.by_role || {}

    const managerCount = Number(byRole.MANAGER || 0)
    const staffCount = Number(byRole.STAFF || 0)
    const customerCount = Number(byRole.CUSTOMER || 0)
    const adminCount = Number(byRole.ADMIN || 0)

    const activeRate = totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0
    const workforceCount = managerCount + staffCount
    const workforceRate = totalUsers ? Math.round((workforceCount / totalUsers) * 100) : 0
    const customerRate = totalUsers ? Math.round((customerCount / totalUsers) * 100) : 0
    const branchCount = branchChartRows.length

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      managerCount,
      staffCount,
      customerCount,
      adminCount,
      workforceCount,
      activeRate,
      workforceRate,
      customerRate,
      branchCount,
    }
  }, [statsState.data, branchChartRows.length])

  return {
    activeTab,
    setActiveTab,
    statsState,
    roleChartRows,
    branchChartRows,
    dashboardSummary,
    loadStats,
    userFilters,
    setUserFilters,
    branchesState,
    branchOptions,
    cityOptions,
    districtOptions,
    wardOptions,
    locationSearch,
    setLocationSearch,
    branchAddressPreview,
    usersState,
    loadUsers,
    loadBranches,
    userForm,
    setUserForm,
    branchForm,
    setBranchForm,
    editingBranchCode,
    startEditBranch,
    cancelEditBranch,
    saveBranch,
    deleteBranch,
    savingBranch,
    editingUserId,
    startEditUser,
    cancelEditUser,
    saveUser,
    deleteUser,
    savingUser,
    categoriesState,
    menuState,
    loadMenu,
    menuForm,
    setMenuForm,
    uploadState,
    uploadMenuImage,
    clearMenuImage,
    editingMenuId,
    startEditMenu,
    cancelEditMenu,
    saveMenu,
    deleteMenu,
    savingMenu,
    PROMOTION_TYPES,
    promotionsState,
    loadPromotions,
    promotionFilter,
    setPromotionFilter,
    promotionFilteredItems,
    promotionForm,
    setPromotionForm,
    editingPromotionCode,
    startEditPromotion,
    cancelEditPromotion,
    savePromotion,
    deletePromotion,
    savingPromotion,
  }
}
