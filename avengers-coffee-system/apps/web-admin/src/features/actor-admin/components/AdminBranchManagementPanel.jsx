import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
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
} from '../../../components/console/WorkspaceIcons'

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
  const [formError, setFormError] = useState('')
  const formOpen = showForm || Boolean(editingBranchCode)

  const safeBranchItems = useMemo(() => {
    return (branchesState?.items || []).filter(
      b => b?.loai_diem_ban !== 'KIOSK_VE_TINH' && b?.loai_diem_ban !== 'KIOSK_NHUONG_QUYEN'
    )
  }, [branchesState])
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
    if (savingBranch) return
    setFormError('')
    if (editingBranchCode) {
      cancelEditBranch && cancelEditBranch()
    }
    setShowForm(false)
  }


  return (
    <div className="branch-manage-container">
      {/* Form Card (Create / Edit Branch) */}
      {formOpen && (
        <WorkspaceDialog label={editingBranchCode ? 'Chỉnh sửa chi nhánh' : 'Thêm chi nhánh'} onClose={handleCloseForm} busy={savingBranch}>
          {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
          <div
            className="system-admin-card admin-surface"
            aria-label={editingBranchCode ? 'Chỉnh sửa chi nhánh' : 'Thêm chi nhánh'}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.25s ease',
              width: '100%',
              maxWidth: '820px'
            }}
          >
            {/* Form Header */}
            <div className="admin-card-header" style={{ padding: '1.1rem 1.5rem', backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: '11px', borderTopRightRadius: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="admin-icon-tile" style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#f1f5fb', color: 'var(--text-main)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {editingBranchCode ? <Edit3 size={19} /> : <Store size={19} />}
                </div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '500', color: 'var(--text-main)' }}>
                  {editingBranchCode ? `Cập nhật chi nhánh: ${editingBranchCode}` : 'Tạo chi nhánh mới'}
                </h3>
              </div>

              <button className="admin-icon-button" aria-label="Đóng form"
                type="button"
                onClick={handleCloseForm}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: '#ffffff',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                title="Đóng form"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Body - 2 Column Balanced Grid */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>

                {/* Field: Branch Code */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Mã chi nhánh</span> <span style={{ color: '#ef4444', fontWeight: '600' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.ma_chi_nhanh || ''}
                    onChange={(e) =>
                      setBranchForm && setBranchForm((p) => ({ ...p, ma_chi_nhanh: e.target.value.toUpperCase() }))
                    }
                    placeholder="VD: HCM_Q1"
                    disabled={Boolean(editingBranchCode)}
                  />
                </div>

                {/* Field: Branch Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Tên chi nhánh</span> <span style={{ color: '#ef4444', fontWeight: '600' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.ten_chi_nhanh || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, ten_chi_nhanh: e.target.value }))}
                    placeholder="VD: Avengers Coffee - Bến Nghé"
                  />
                </div>

                {/* Field: Province / City (34 Provinces after merger) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Tỉnh / Thành phố</span> <span style={{ color: '#ef4444', fontWeight: '600' }}>*</span>
                  </label>
                  <SearchableSelect
                    value={safeBranchForm.thanh_pho || ''}
                    onChange={(e) => {
                      const newCity = e.target.value
                      setBranchForm && setBranchForm((p) => ({
                        ...p,
                        thanh_pho: newCity,
                        quan_huyen: '',
                        phuong_xa: ''
                      }))
                      setLocationSearch && setLocationSearch((p) => ({ ...p, ward: '' }))
                    }}
                    placeholder="-- Chọn Tỉnh / Thành phố --"
                  >
                    {safeCityOptions.map((city) => (
                      <option key={city.code} value={city.code}>
                        {city.label}
                      </option>
                    ))}
                  </SearchableSelect>
                </div>

                {/* Field: Ward (Directly filtered by Province) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Phường / Xã</span>
                  </label>
                  <SearchableSelect
                    value={safeBranchForm.phuong_xa || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, phuong_xa: e.target.value }))}
                    disabled={!safeBranchForm.thanh_pho || !safeWardOptions.length}
                    placeholder={safeBranchForm.thanh_pho ? '-- Chọn Phường / Xã --' : 'Vui lòng chọn Tỉnh/Thành trước'}
                  >
                    {safeWardOptions.map((ward) => (
                      <option key={ward.code} value={ward.code}>
                        {ward.label}
                      </option>
                    ))}
                  </SearchableSelect>
                </div>

                {/* Field: Phone */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                    Số điện thoại liên hệ
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.so_dien_thoai || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, so_dien_thoai: e.target.value }))}
                    placeholder="VD: 028 1234 5678"
                  />
                </div>

                {/* Field: Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                    Trạng thái hoạt động
                  </label>
                  <SearchableSelect
                    value={safeBranchForm.trang_thai || 'ACTIVE'}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, trang_thai: e.target.value }))}
                  >
                    <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
                    <option value="INACTIVE">Tạm dừng hoạt động (INACTIVE)</option>
                  </SearchableSelect>
                </div>

                {/* Field: Opening Time */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                    Giờ mở cửa
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.gio_mo_cua || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, gio_mo_cua: e.target.value }))}
                    placeholder="VD: 07:00"
                  />
                </div>

                {/* Field: Closing Time */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                    Giờ đóng cửa
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.gio_dong_cua || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, gio_dong_cua: e.target.value }))}
                    placeholder="VD: 22:00"
                  />
                </div>

                {/* Field: Detailed Address (Full Width) */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Địa chỉ chi tiết (Số nhà, Tên đường, Tòa nhà)</span> <span style={{ color: '#ef4444', fontWeight: '600' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.dia_chi_chi_tiet || ''}
                    onChange={(e) =>
                      setBranchForm && setBranchForm((p) => ({ ...p, dia_chi_chi_tiet: e.target.value }))
                    }
                    placeholder="VD: 72 Lê Thánh Tôn"
                  />
                </div>

                {/* Field: Image URL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                    URL Ảnh chi nhánh
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.hinh_anh_url || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, hinh_anh_url: e.target.value }))}
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>

                {/* Field: Google Maps URL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                    Link Google Maps
                  </label>
                  <input
                    type="text"
                    className="shadcn-input ui-input"
                    value={safeBranchForm.map_url || ''}
                    onChange={(e) => setBranchForm && setBranchForm((p) => ({ ...p, map_url: e.target.value }))}
                    placeholder="https://www.google.com/maps/search/?api=1&query=..."
                  />
                </div>

                {/* Address Preview Box */}
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#334155',
                    fontSize: '0.8125rem',
                  }}
                >
                  <MapPin size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>Địa chỉ hoàn chỉnh: </span>
                    <span style={{ color: branchAddressPreview ? '#0f172a' : '#94a3b8' }}>
                      {branchAddressPreview || 'Vui lòng nhập địa chỉ chi tiết và chọn tỉnh/thành'}
                    </span>
                  </div>
                </div>

              </div>

              {/* Form Footer Actions */}
              <div className="admin-editor-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e4df', paddingTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="btn-cancel"
                  style={{ height: '38px', padding: '0 1.25rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <X size={15} /> Hủy bỏ
                </button>

                <button
                  type="button"
                  className="btn-save"
                  onClick={async () => {
                    if (savingBranch) return
                    setFormError('')
                    const result = await saveBranch?.()
                    if (result?.ok === false) { setFormError(result.error); return }
                    if (result !== false) setShowForm(false)
                  }}
                  disabled={savingBranch}
                  style={{ height: '38px', padding: '0 1.35rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <CheckCircle2 size={17} color="#ffffff" />
                  <span>{savingBranch ? 'Đang lưu...' : (editingBranchCode ? 'Lưu chi nhánh' : 'Tạo chi nhánh')}</span>
                </button>
              </div>

            </div>
          </div>
        </WorkspaceDialog>
      )}

      {/* Main List Card & Filters */}
      <div className="branch-list-card admin-branch-directory"><div className="admin-section-intro"><div><h2>Danh sách chi nhánh</h2><p>Thông tin liên hệ, trạng thái hoạt động và đánh giá tại từng chi nhánh.</p></div></div>
        <div className="branch-toolbar admin-branch-toolbar">
          <div className="branch-search-group">
            <div className="branch-search-box">
              <div className="branch-search-input-wrap">

                <input className="ui-input"
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
            </div>

            <div style={{ minWidth: 190, width: 200, flexShrink: 0 }}>
              <SearchableSelect
                id="branch-status-filter-select"
                className="branch-filter-select"
                value={statusFilter}
                onChange={(e) => {
                  const val = e?.target?.value ?? e
                  setStatusFilter(val)
                  setCurrentPage(1)
                }}
                placeholder="Tất cả trạng thái"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Tạm dừng</option>
              </SearchableSelect>
            </div>
          </div>

          <div className="admin-branch-toolbar-actions">
            {loadBranches && (
              <button
                type="button"
                className="branch-refresh-btn"
                onClick={loadBranches}
                title="Tải lại dữ liệu"
              >
                <RefreshCw size={15} />
                <span>Tải lại</span>
              </button>
            )}

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
              <div className="branch-table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                <table className="branch-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                      <th style={{ width: '24%', padding: '0.75rem 1rem' }}>Chi nhánh</th>
                      <th style={{ width: '27%', padding: '0.75rem 1rem' }}>Địa chỉ &amp; Bản đồ</th>
                      <th style={{ width: '18%', padding: '0.75rem 1rem' }}>Liên hệ &amp; Giờ mở cửa</th>
                      <th style={{ width: '9%', padding: '0.75rem 1rem', textAlign: 'center' }}>Tài khoản</th>
                      <th style={{ width: '10%', padding: '0.75rem 1rem' }}>Trạng thái</th>
                      <th style={{ width: '12%', textAlign: 'center', padding: '0.75rem 1rem' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.map((branch, index) => {
                      const branchCode = branch?.ma_chi_nhanh || ''
                      const isEditingThis = editingBranchCode === branchCode
                      const accountCount = Number(branch?.account_count || 0)
                      const hasImage = Boolean(branch?.hinh_anh_url) && !imgErrors[branchCode]
                      const branchName = String(branch?.ten_chi_nhanh || '---').replace(/[\u2014\u2013]/g, '-')

                      return (
                        <tr
                          key={branchCode || `branch-${pageData.page}-${index}`}
                          className={`branch-table-row ${isEditingThis ? 'editing' : ''}`}
                          onClick={() => setSelectedBranchForReview && setSelectedBranchForReview(branch)}
                          title="Bấm vào dòng để xem chi tiết &amp; đánh giá chi nhánh"
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                            <div className="branch-info-cell" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div className="branch-thumb-wrapper" style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                                {hasImage ? (
                                  <img
                                    src={branch.hinh_anh_url}
                                    alt={branchName}
                                    className="branch-thumb-img"
                                    onError={() => {
                                      setImgErrors((prev) => ({ ...prev, [branchCode]: true }))
                                    }}
                                  />
                                ) : (
                                  <div className="branch-thumb-fallback" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', background: '#f1f5f9' }}>
                                    <Store size={18} />
                                  </div>
                                )}
                              </div>
                              <div className="branch-title-meta" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                                <strong className="branch-name branch-name-title" style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#0f172a', lineHeight: 1.35, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {branchName}
                                </strong>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                            <div className="branch-address-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span className="branch-address-text" style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: 1.4 }} title={branch?.dia_chi || 'Chưa có địa chỉ'}>
                                {branch?.dia_chi || '---'}
                              </span>
                              {branch?.map_url && (
                                <a
                                  href={branch.map_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="branch-map-link"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', fontWeight: '500', color: '#2563eb', textDecoration: 'none', width: 'fit-content' }}
                                  title="Xem trên Google Maps"
                                >
                                  <ExternalLink size={11} />
                                  <span>Xem trên Maps</span>
                                </a>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                            <div className="branch-contact-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div className="branch-contact-item" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78125rem', color: '#334155' }}>
                                <Phone size={12} color="#64748b" style={{ flexShrink: 0 }} />
                                <span>{branch?.so_dien_thoai || '---'}</span>
                              </div>
                              <div className="branch-contact-item" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                                <span>
                                  {branch?.gio_mo_cua || '07:00'} - {branch?.gio_dong_cua || '22:00'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', textAlign: 'center' }}>
                            <div className="branch-account-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: '500' }}>
                              <Users size={12} color="#64748b" />
                              <span>{fmtNumber(accountCount)}</span>
                            </div>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                            <span
                              className={`branch-status-pill ${
                                branch?.trang_thai === 'ACTIVE' ? 'active' : 'inactive'
                              }`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '2.5px 8px',
                                borderRadius: '9999px',
                                fontSize: '0.72rem',
                                fontWeight: '500',
                                backgroundColor: branch?.trang_thai === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                                color: branch?.trang_thai === 'ACTIVE' ? '#166534' : '#991b1b',
                                border: branch?.trang_thai === 'ACTIVE' ? '1px solid #bbf7d0' : '1px solid #fecaca',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: branch?.trang_thai === 'ACTIVE' ? '#16a34a' : '#dc2626' }}></span>
                              <span>{branch?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm dừng'}</span>
                            </span>
                          </td>

                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '0.75rem 1rem', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="admin-table-action-btn btn-special"
                                onClick={() => setSelectedBranchForReview && setSelectedBranchForReview(branch)}
                                title="Xem và phản hồi đánh giá chi nhánh"
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  color: '#d97706',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Star size={14} fill="#fef3c7" />
                              </button>

                              <button
                                type="button"
                                className="admin-table-action-btn btn-edit"
                                onClick={() => startEditBranch && startEditBranch(branch)}
                                title="Chỉnh sửa chi nhánh"
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  color: '#2563eb',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Edit3 size={14} />
                              </button>

                              <button
                                type="button"
                                className="admin-table-action-btn btn-delete"
                                onClick={() => deleteBranch && deleteBranch(branchCode)}
                                title={accountCount > 0 ? `Chi nhánh có ${accountCount} tài khoản liên kết` : 'Xóa chi nhánh'}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  color: '#dc2626',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
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
