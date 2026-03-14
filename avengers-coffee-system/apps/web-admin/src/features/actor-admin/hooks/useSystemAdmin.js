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

const DEFAULT_MENU_FORM = {
  name: '',
  category_code: '',
  price: 0,
  image: '',
  description: '',
  dang_ban: true,
}

export const BRANCH_OPTIONS = [
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

  useEffect(() => {
    loadStats()
    loadUsers()
    loadCategories()
    loadMenu()
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
    setUserForm(DEFAULT_USER_FORM)
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

  return {
    activeTab,
    setActiveTab,
    statsState,
    roleChartRows,
    loadStats,
    userFilters,
    setUserFilters,
    usersState,
    loadUsers,
    userForm,
    setUserForm,
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
  }
}
