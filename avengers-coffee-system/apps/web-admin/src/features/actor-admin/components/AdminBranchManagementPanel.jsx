import React, { useState, useMemo, useEffect } from 'react'
import {
  Store,
  Plus,
  Edit3,
  Trash2,
  Search,
  Check,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  Phone,
  Clock,
  ExternalLink,
  Users,
  Star,
  MoreVertical
} from 'lucide-react'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function BranchPagination({ pageData, onPageChange }) {
  if (!pageData || pageData.total <= 10) return null
  return (
    <div className="branch-pagination-bar">
      <span className="branch-pagination-info">
        Hiển thị {pageData.from} - {pageData.to} trên tổng số {pageData.total} chi nhánh
      </span>
      <div className="branch-pagination-actions">
        <button
          type="button"
          className="branch-pg-btn"
          onClick={() => onPageChange(1)}
          disabled={pageData.page <= 1}
          title="Trang đầu"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          type="button"
          className="branch-pg-btn"
          onClick={() => onPageChange(pageData.page - 1)}
          disabled={pageData.page <= 1}
          title="Trang trước"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="branch-pg-current">
          Trang {pageData.page} / {pageData.totalPages}
        </span>
        <button
          type="button"
          className="branch-pg-btn"
          onClick={() => onPageChange(pageData.page + 1)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang sau"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="branch-pg-btn"
          onClick={() => onPageChange(pageData.totalPages)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang cuối"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  )
}

export function AdminBranchManagementPanel({
  branchesState = { loading: false, error: '', items: [] },
  loadBranches,
  branchForm = {},
  setBranchForm = () => {},
  editingBranchCode = null,
  startEditBranch = () => {},
  cancelEditBranch = () => {},
  saveBranch = () => {},
  deleteBranch = () => {},
  savingBranch = false,
  locationSearch = { city: '', district: '', ward: '' },
  setLocationSearch = () => {},
  cityOptions = [],
  districtOptions = [],
  wardOptions = [],
  branchAddressPreview = '',
  setSelectedBranchForReview = () => {}
}) {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [imgErrors, setImgErrors] = useState({})
  const [openBranchActionId, setOpenBranchActionId] = useState(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = () => setOpenBranchActionId(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Auto show form when editing a branch
  useEffect(() => {
    if (editingBranchCode) {
      setShowForm(true)
    }
  }, [editingBranchCode])

  const safeBranchItems = useMemo(() => branchesState?.items || [], [branchesState])
  const safeCityOptions = useMemo(() => cityOptions || [], [cityOptions])
  const safeDistrictOptions = useMemo(() => districtOptions || [], [districtOptions])
  const safeWardOptions = useMemo(() => wardOptions || [], [wardOptions])
  const safeLocationSearch = locationSearch || { city: '', district: '', ward: '' }
  const safeBranchForm = branchForm || {}

  // Filter branches by keyword and status
  const filteredBranches = useMemo(() => {
    let list = safeBranchItems
    if (keyword.trim()) {
      const q = keyword.toLowerCase().trim()
      list = list.filter(
        (item) =>
          String(item?.ten_chi_nhanh || '').toLowerCase().includes(q) ||
          String(item?.ma_chi_nhanh || '').toLowerCase().includes(q) ||
          String(item?.dia_chi || '').toLowerCase().includes(q) ||
          String(item?.so_dien_thoai || '').includes(q)
      )
    }
    if (statusFilter) {
      list = list.filter((item) => item?.trang_thai === statusFilter)
    }
    return list
  }, [safeBranchItems, keyword, statusFilter])

  // Pagination calculation
  const PAGE_SIZE = 10
  const pageData = useMemo(() => {
    const total = filteredBranches.length
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    const start = (safePage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE
    return {
      rows: filteredBranches.slice(start, end),
      total,
      totalPages,
      page: safePage,
      from: total === 0 ? 0 : start + 1,
      to: Math.min(end, total)
    }
  }, [filteredBranches, currentPage])

  // KPI Statistics
  const stats = useMemo(() => {
    const all = safeBranchItems
    const active = all.filter((b) => b?.trang_thai === 'ACTIVE').length
    const inactive = all.filter((b) => b?.trang_thai === 'INACTIVE').length
    const totalAccounts = all.reduce((sum, b) => sum + Number(b?.account_count || 0), 0)
    return {
      total: all.length,
      active,
      inactive,
      totalAccounts
    }
  }, [safeBranchItems])

  const handleOpenAddForm = () => {
    if (editingBranchCode) {
      cancelEditBranch && cancelEditBranch()
    }
    setBranchForm && setBranchForm({
      ma_chi_nhanh: '',
      ten_chi_nhanh: '',
      thanh_pho: safeCityOptions.length ? safeCityOptions[0].code : '',
      quan_huyen: '',
      phuong_xa: '',
      dia_chi_chi_tiet: '',
      so_dien_thoai: '',
      gio_mo_cua: '07:00',
      gio_dong_cua: '22:00',
      trang_thai: 'ACTIVE',
      hinh_anh_url: '',
      map_url: ''
    })
    setLocationSearch && setLocationSearch({ city: '', district: '', ward: '' })
    setShowForm(true)
  }

  const handleCloseForm = () => {
    if (editingBranchCode) {
      cancelEditBranch && cancelEditBranch()
    }
    setShowForm(false)
  }

  return (
    <div className="branch-manage-container">
      {/* Header Section */}
      <div className="branch-manage-header">
        <div className="branch-manage-header-title">
          <div className="branch-manage-icon-wrapper">
            <Store size={26} className="branch-header-icon" />
          </div>
          <div>
            <h2>Quản lý Chi nhánh Cửa hàng</h2>
            <p>Thiết lập danh sách điểm bán, địa chỉ, giờ hoạt động và theo dõi phản hồi đánh giá</p>
          </div>
        </div>
        <div className="branch-manage-header-actions">
          {loadBranches && (
            <button
              type="button"
              className="branch-refresh-btn"
              onClick={loadBranches}
              title="Tải lại dữ liệu"
            >
              <RefreshCw size={16} />
              <span>Tải lại</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="branch-kpi-grid">
        <div className="branch-kpi-card branch-kpi-card--total">
          <div className="branch-kpi-icon branch-kpi-icon--total">
            <Store size={20} />
          </div>
          <div className="branch-kpi-content">
            <span className="branch-kpi-label">Tổng số Chi nhánh</span>
            <span className="branch-kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="branch-kpi-card branch-kpi-card--active">
          <div className="branch-kpi-icon branch-kpi-icon--active">
            <CheckCircle2 size={20} />
          </div>
          <div className="branch-kpi-content">
            <span className="branch-kpi-label">Đang hoạt động</span>
            <span className="branch-kpi-value">{stats.active}</span>
          </div>
        </div>

        <div className="branch-kpi-card branch-kpi-card--inactive">
          <div className="branch-kpi-icon branch-kpi-icon--inactive">
            <AlertCircle size={20} />
          </div>
          <div className="branch-kpi-content">
            <span className="branch-kpi-label">Tạm dừng hoạt động</span>
            <span className="branch-kpi-value">{stats.inactive}</span>
          </div>
        </div>

        <div className="branch-kpi-card branch-kpi-card--staff">
          <div className="branch-kpi-icon branch-kpi-icon--staff">
            <Users size={20} />
          </div>
          <div className="branch-kpi-content">
            <span className="branch-kpi-label">Tổng Nhân sự gán</span>
            <span className="branch-kpi-value">{stats.totalAccounts}</span>
          </div>
        </div>
      </div>

      {/* Form Card (Create / Edit Branch) */}
      {showForm && (
        <div className="branch-form-card">
          <div className="branch-form-header">
            <div className="branch-form-header-title">
              <Store size={20} className="branch-form-header-icon" />
              <h3>{editingBranchCode ? `Cập nhật chi nhánh: ${editingBranchCode}` : 'Tạo chi nhánh mới'}</h3>
            </div>
            <button
              type="button"
              className="branch-form-close-btn"
              onClick={handleCloseForm}
              title="Đóng form"
            >
              <X size={18} />
            </button>
          </div>

          <div className="branch-form-grid">
            <div className="branch-form-field">
              <label>
                <span>Mã chi nhánh <span className="text-red">*</span></span>
                <input
                  type="text"
                  value={safeBranchForm.ma_chi_nhanh || ''}
                  onChange={(e) =>
                    setBranchForm && setBranchForm((p) => ({ ...p, ma_chi_nhanh: e.target.value.toUpperCase() }))
                  }
                  placeholder="VD: QUAN_1"
                  disabled={Boolean(editingBranchCode)}
                />
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Tên chi nhánh <span className="text-red">*</span></span>
                <input
                  type="text"
                  value={safeBranchForm.ten_chi_nhanh || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, ten_chi_nhanh: e.target.value }))}
                  placeholder="VD: Avengers Coffee Quận 1"
                />
              </label>
            </div>

            {/* Location Cascading Selects */}
            <div className="branch-form-field">
              <label>
                <span>Tỉnh / Thành phố</span>
                <input
                  type="text"
                  className="branch-search-subinput"
                  value={safeLocationSearch.city || ''}
                  onChange={(e) => setLocationSearch && setLocationSearch((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Gõ tìm tỉnh/thành..."
                />
                <select
                  value={safeBranchForm.thanh_pho || ''}
                  onChange={(e) => {
                    setBranchForm && setBranchForm((p) => ({
                      ...p,
                      thanh_pho: e.target.value,
                      quan_huyen: '',
                      phuong_xa: ''
                    }))
                    setLocationSearch && setLocationSearch((p) => ({ ...p, district: '', ward: '' }))
                  }}
                >
                  {safeCityOptions.map((city) => (
                    <option key={city.code} value={city.code}>
                      {city.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Quận / Huyện</span>
                <input
                  type="text"
                  className="branch-search-subinput"
                  value={safeLocationSearch.district || ''}
                  onChange={(e) => setLocationSearch && setLocationSearch((p) => ({ ...p, district: e.target.value }))}
                  placeholder="Gõ tìm quận/huyện..."
                  disabled={!safeBranchForm.thanh_pho}
                />
                <select
                  value={safeBranchForm.quan_huyen || ''}
                  onChange={(e) => {
                    setBranchForm && setBranchForm((p) => ({ ...p, quan_huyen: e.target.value, phuong_xa: '' }))
                    setLocationSearch && setLocationSearch((p) => ({ ...p, ward: '' }))
                  }}
                  disabled={!safeDistrictOptions.length}
                >
                  <option value="">Chọn quận/huyện</option>
                  {safeDistrictOptions.map((district) => (
                    <option key={district.code} value={district.code}>
                      {district.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Phường / Xã</span>
                <input
                  type="text"
                  className="branch-search-subinput"
                  value={safeLocationSearch.ward || ''}
                  onChange={(e) => setLocationSearch && setLocationSearch((p) => ({ ...p, ward: e.target.value }))}
                  placeholder="Gõ tìm phường/xã..."
                  disabled={!safeBranchForm.quan_huyen}
                />
                <select
                  value={safeBranchForm.phuong_xa || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, phuong_xa: e.target.value }))}
                  disabled={!safeWardOptions.length}
                >
                  <option value="">Chọn phường/xã</option>
                  {safeWardOptions.map((ward) => (
                    <option key={ward.code} value={ward.code}>
                      {ward.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Số điện thoại liên hệ</span>
                <input
                  type="text"
                  value={safeBranchForm.so_dien_thoai || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, so_dien_thoai: e.target.value }))}
                  placeholder="VD: 028 1234 5678"
                />
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Giờ mở cửa</span>
                <input
                  type="text"
                  value={safeBranchForm.gio_mo_cua || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, gio_mo_cua: e.target.value }))}
                  placeholder="VD: 07:00"
                />
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Giờ đóng cửa</span>
                <input
                  type="text"
                  value={safeBranchForm.gio_dong_cua || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, gio_dong_cua: e.target.value }))}
                  placeholder="VD: 22:00"
                />
              </label>
            </div>

            <div className="branch-form-field">
              <label>
                <span>Trạng thái hoạt động</span>
                <select
                  value={safeBranchForm.trang_thai || 'ACTIVE'}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, trang_thai: e.target.value }))}
                >
                  <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
                  <option value="INACTIVE">Tạm dừng hoạt động (INACTIVE)</option>
                </select>
              </label>
            </div>

            <div className="branch-form-field branch-form-field--full">
              <label>
                <span>Địa chỉ chi tiết (Số nhà, Tên đường, Tòa nhà)</span>
                <input
                  type="text"
                  value={safeBranchForm.dia_chi_chi_tiet || ''}
                  onChange={(e) =>
                    setBranchForm && setBranchForm((p) => ({ ...p, dia_chi_chi_tiet: e.target.value }))
                  }
                  placeholder="VD: 123 Nguyễn Đình Chiểu, Tòa nhà Bitexco"
                />
              </label>
            </div>

            <div className="branch-form-field branch-form-field--full">
              <label>
                <span>URL Ảnh chi nhánh</span>
                <input
                  type="text"
                  value={safeBranchForm.hinh_anh_url || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, hinh_anh_url: e.target.value }))}
                  placeholder="https://images.unsplash.com/..."
                />
              </label>
            </div>

            <div className="branch-form-field branch-form-field--full">
              <label>
                <span>Link Google Maps</span>
                <input
                  type="text"
                  value={safeBranchForm.map_url || ''}
                  onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, map_url: e.target.value }))}
                  placeholder="https://www.google.com/maps/search/?api=1&query=..."
                />
              </label>
            </div>

            {/* Address Preview Box */}
            <div className="branch-address-preview-box">
              <MapPin size={18} className="branch-preview-pin" />
              <div>
                <strong>Địa chỉ hiển thị đầy đủ:</strong>
                <p>{branchAddressPreview || 'Vui lòng nhập số nhà và chọn quận huyện để xem preview'}</p>
              </div>
            </div>
          </div>

          <div className="branch-form-actions">
            <button
              type="button"
              className="branch-btn branch-btn--save"
              onClick={() => {
                saveBranch && saveBranch()
              }}
              disabled={savingBranch}
            >
              <Check size={18} />
              <span>{savingBranch ? 'Đang lưu...' : 'Lưu chi nhánh'}</span>
            </button>

            <button
              type="button"
              className="branch-btn branch-btn--cancel"
              onClick={handleCloseForm}
            >
              <X size={18} />
              <span>Hủy bỏ</span>
            </button>
          </div>
        </div>
      )}

      {/* Main List Card & Filters */}
      <div className="branch-list-card">
        <div className="branch-toolbar">
          <div className="branch-search-group">
            <div className="branch-search-box">
              <div className="branch-search-input-wrap">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Tìm theo tên, mã, địa chỉ chi nhánh..."
                />
                {keyword && (
                  <button
                    type="button"
                    className="branch-search-clear"
                    onClick={() => {
                      setKeyword('')
                      setCurrentPage(1)
                    }}
                    title="Xóa tìm kiếm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button type="button" className="branch-search-btn" title="Tìm kiếm">
                <Search size={18} strokeWidth={2.5} style={{ stroke: '#ffffff' }} />
              </button>
            </div>

            <select
              className="branch-filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Tạm dừng</option>
            </select>
          </div>

          {!showForm && (
            <button
              type="button"
              className="branch-btn branch-btn--create"
              onClick={handleOpenAddForm}
            >
              <Plus size={18} strokeWidth={2.5} style={{ stroke: '#ffffff' }} />
              <span>Thêm chi nhánh mới</span>
            </button>
          )}
        </div>

        {/* Loading & Error States */}
        {branchesState?.loading && (
          <div className="branch-state-box">
            <RefreshCw size={24} className="branch-spin-icon" />
            <span>Đang tải danh sách chi nhánh...</span>
          </div>
        )}

        {branchesState?.error && (
          <div className="branch-state-box branch-state-box--error">
            <AlertCircle size={20} />
            <span>{branchesState.error}</span>
          </div>
        )}

        {/* Branch Table */}
        {!branchesState?.loading && !branchesState?.error && (
          <>
            {pageData.rows.length === 0 ? (
              <div className="branch-state-box branch-state-box--empty">
                <Info size={24} />
                <span>Không tìm thấy chi nhánh nào phù hợp.</span>
              </div>
            ) : (
              <div className="branch-table-wrapper">
                <table className="branch-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Chi nhánh &amp; Mã</th>
                      <th style={{ width: '28%' }}>Địa chỉ &amp; Bản đồ</th>
                      <th style={{ width: '18%' }}>Liên hệ &amp; Giờ mở cửa</th>
                      <th style={{ width: '10%' }}>Tài khoản</th>
                      <th style={{ width: '10%' }}>Trạng thái</th>
                      <th style={{ width: '9%' }} className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.map((branch, index, array) => {
                      const branchCode = branch?.ma_chi_nhanh || ''
                      const isEditingThis = editingBranchCode === branchCode
                      const accountCount = Number(branch?.account_count || 0)
                      const hasImage = Boolean(branch?.hinh_anh_url) && !imgErrors[branchCode]

                      return (
                        <tr
                          key={branchCode || Math.random()}
                          className={`branch-table-row ${isEditingThis ? 'editing' : ''}`}
                          onClick={() => setSelectedBranchForReview && setSelectedBranchForReview(branch)}
                          title="Bấm vào dòng để xem chi tiết &amp; đánh giá chi nhánh"
                        >
                          <td>
                            <div className="branch-info-cell">
                              <div className="branch-thumb-wrapper">
                                {hasImage ? (
                                  <img
                                    src={branch.hinh_anh_url}
                                    alt={branch.ten_chi_nhanh || ''}
                                    className="branch-thumb-img"
                                    onError={() => {
                                      setImgErrors((prev) => ({ ...prev, [branchCode]: true }))
                                    }}
                                  />
                                ) : (
                                  <div className="branch-thumb-fallback">
                                    <Store size={20} />
                                  </div>
                                )}
                              </div>
                              <div className="branch-title-meta">
                                <strong className="branch-name">{branch?.ten_chi_nhanh || '---'}</strong>
                                <span className="branch-code-badge">{branchCode}</span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="branch-address-cell">
                              <span className="branch-address-text" title={branch?.dia_chi || 'Chưa có địa chỉ'}>
                                {branch?.dia_chi || '---'}
                              </span>
                              {branch?.map_url && (
                                <a
                                  href={branch.map_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="branch-map-link"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Xem trên Google Maps"
                                >
                                  <ExternalLink size={12} />
                                  <span>Maps</span>
                                </a>
                              )}
                            </div>
                          </td>

                          <td>
                            <div className="branch-contact-cell">
                              <div className="branch-contact-item">
                                <Phone size={13} className="contact-icon" />
                                <span>{branch?.so_dien_thoai || '---'}</span>
                              </div>
                              <div className="branch-contact-item">
                                <Clock size={13} className="contact-icon" />
                                <span>
                                  {branch?.gio_mo_cua || '07:00'} - {branch?.gio_dong_cua || '22:00'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="branch-account-badge">
                              <Users size={13} />
                              <span>{fmtNumber(accountCount)}</span>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`branch-status-pill ${
                                branch?.trang_thai === 'ACTIVE' ? 'active' : 'inactive'
                              }`}
                            >
                              <span className="status-dot"></span>
                              <span>{branch?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm dừng'}</span>
                            </span>
                          </td>

                          <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-icon-more"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenBranchActionId(openBranchActionId === branchCode ? null : branchCode)
                              }}
                              title="Thao tác"
                            >
                              <MoreVertical size={16} color="#475569" />
                            </button>

                            {openBranchActionId === branchCode && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 'calc(100% + 6px)',
                                  top: index >= (array.length - 2) ? 'auto' : '-4px',
                                  bottom: index >= (array.length - 2) ? '-4px' : 'auto',
                                  backgroundColor: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                  zIndex: 9999,
                                  minWidth: '210px',
                                  padding: '0.35rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.15rem'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="btn-dropdown-item"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#6366f1', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenBranchActionId(null)
                                    setSelectedBranchForReview && setSelectedBranchForReview(branch)
                                  }}
                                >
                                  <Star size={14} color="#6366f1" /> Xem chi tiết &amp; Đánh giá
                                </button>

                                <button
                                  type="button"
                                  className="btn-dropdown-item"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenBranchActionId(null)
                                    startEditBranch && startEditBranch(branch)
                                  }}
                                >
                                  <Edit3 size={14} color="#2563eb" /> Chỉnh sửa chi nhánh
                                </button>

                                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                                <button
                                  type="button"
                                  className="btn-dropdown-item danger"
                                  disabled={accountCount > 0}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    width: '100%',
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8125rem',
                                    fontWeight: '500',
                                    color: accountCount > 0 ? '#94a3b8' : '#dc2626',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: accountCount > 0 ? 'not-allowed' : 'pointer',
                                    textAlign: 'left',
                                    opacity: accountCount > 0 ? 0.6 : 1
                                  }}
                                  onClick={() => {
                                    if (accountCount > 0) return
                                    setOpenBranchActionId(null)
                                    deleteBranch && deleteBranch(branchCode)
                                  }}
                                  title={accountCount > 0 ? 'Không thể xóa chi nhánh đang có nhân sự/tài khoản gán vào' : 'Xóa chi nhánh này'}
                                >
                                  <Trash2 size={14} color={accountCount > 0 ? '#94a3b8' : '#dc2626'} /> Xóa chi nhánh
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <BranchPagination pageData={pageData} onPageChange={setCurrentPage} />
          </>
        )}
      </div>
    </div>
  )
}
