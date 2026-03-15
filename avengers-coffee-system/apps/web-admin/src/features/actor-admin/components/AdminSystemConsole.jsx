import { useSystemAdmin } from '../hooks/useSystemAdmin'
import { AiAnalyticsPanel } from './AiAnalyticsPanel'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function fmtDateShort(value) {
  if (!value) return '---'
  try { return new Date(value).toLocaleDateString('vi-VN') } catch { return String(value) }
}

const PROMOTION_TYPE_LABELS = { PERCENT: 'Giảm %', FIXED: 'Giảm tiền', FREE_ITEM: 'Tặng kèm' }
const PROMOTION_STATUS_LABELS = { ACTIVE: 'Hiệu lực', INACTIVE: 'Tạm dừng', EXPIRED: 'Hết hạn' }

export function AdminSystemConsole({ session, onLogout }) {
  const {
    activeTab,
    setActiveTab,
    statsState,
    roleChartRows,
    branchChartRows,
    dashboardSummary,
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
    branchForm,
    setBranchForm,
    editingBranchCode,
    startEditBranch,
    cancelEditBranch,
    saveBranch,
    deleteBranch,
    savingBranch,
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
  } = useSystemAdmin()

  return (
    <div className="system-admin-shell">
      <aside className="system-admin-sidebar">
        <h2>System Admin</h2>
        <p className="staff-tag" style={{ marginTop: '0.5rem' }}>
          {session?.user?.tenDangNhap || 'admin'} (ADMIN)
        </p>

        <div className="system-admin-tabs">
          <button type="button" className={activeTab === 'overview' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('overview')}>
            Dashboard tổng
          </button>
          <button type="button" className={activeTab === 'users' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('users')}>
            Quản lý người dùng
          </button>
          <button type="button" className={activeTab === 'branches' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('branches')}>
            Quản lý chi nhánh
          </button>
          <button type="button" className={activeTab === 'menu' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('menu')}>
            Quản lý menu tổng
          </button>
            <button type="button" className={activeTab === 'promotions' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('promotions')}>
              Khuyến mãi &amp; Voucher
            </button>
              <button type="button" className={activeTab === 'ai-analytics' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('ai-analytics')}>
                🤖 AI Analytics
              </button>
        </div>

        <button type="button" className="logout-btn" onClick={onLogout}>Đăng xuất</button>
      </aside>

      <main className="system-admin-content">
        <section className="system-admin-hero">
          <div>
            <p className="system-admin-kicker">System-wide Control</p>
            <h1>Bảng điều khiển Quản trị viên hệ thống</h1>
            <p>Tách biệt hoàn toàn với giao diện Manager/Staff và chỉ giữ đúng 3 nhóm chức năng bạn yêu cầu.</p>
          </div>
          <div className="system-admin-hero-badge">
            <strong>{session?.user?.tenDangNhap || 'thaian_admin'}</strong>
            <span>Toàn hệ thống cửa hàng</span>
          </div>
        </section>

        {activeTab === 'overview' && (
          <section className="panel system-admin-panel">
            <div className="panel-head">
              <h2>Thống kê người dùng toàn hệ thống</h2>
              <span>Dashboard chi tiết theo role, trạng thái và phân bổ chi nhánh</span>
            </div>

            {statsState.loading ? <p>Đang tải thống kê...</p> : null}
            {statsState.error ? <p className="error-text">{statsState.error}</p> : null}

            {!statsState.loading && !statsState.error && statsState.data ? (
              <>
                <div className="system-admin-kpi-grid">
                  <article className="system-admin-kpi-card">
                    <p>Tổng tài khoản</p>
                    <h3>{fmtNumber(dashboardSummary.totalUsers)}</h3>
                    <small>{fmtNumber(dashboardSummary.branchCount)} chi nhánh đang có tài khoản</small>
                  </article>
                  <article className="system-admin-kpi-card">
                    <p>Tỷ lệ hoạt động</p>
                    <h3>{dashboardSummary.activeRate}%</h3>
                    <small>{fmtNumber(dashboardSummary.activeUsers)} active / {fmtNumber(dashboardSummary.inactiveUsers)} inactive</small>
                  </article>
                  <article className="system-admin-kpi-card">
                    <p>Khối vận hành</p>
                    <h3>{fmtNumber(dashboardSummary.workforceCount)}</h3>
                    <small>{dashboardSummary.workforceRate}% tổng users là STAFF/MANAGER</small>
                  </article>
                  <article className="system-admin-kpi-card">
                    <p>Khách hàng</p>
                    <h3>{fmtNumber(dashboardSummary.customerCount)}</h3>
                    <small>{dashboardSummary.customerRate}% trên toàn hệ thống</small>
                  </article>
                </div>

                <div className="system-admin-charts-grid">
                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Biểu đồ tròn trạng thái</h2></div>
                    <div className="system-admin-donut-grid">
                      <div className="system-admin-donut-card">
                        <div className="system-admin-donut" style={{ '--percent': `${dashboardSummary.activeRate}%` }}>
                          <div>
                            <strong>{dashboardSummary.activeRate}%</strong>
                            <small>Active</small>
                          </div>
                        </div>
                        <p>{fmtNumber(dashboardSummary.activeUsers)} tài khoản đang hoạt động</p>
                      </div>
                      <div className="system-admin-donut-card">
                        <div className="system-admin-donut" style={{ '--percent': `${dashboardSummary.workforceRate}%` }}>
                          <div>
                            <strong>{dashboardSummary.workforceRate}%</strong>
                            <small>Workforce</small>
                          </div>
                        </div>
                        <p>{fmtNumber(dashboardSummary.workforceCount)} STAFF/MANAGER</p>
                      </div>
                    </div>
                  </article>

                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Biểu đồ cột theo role</h2></div>
                    <div className="system-admin-bars-wrap">
                      {roleChartRows.map((row) => (
                        <div key={row.role} className="system-admin-bar-item">
                          <div className="system-admin-bar-row">
                            <strong>{row.role}</strong>
                            <span>{row.count} ({row.percent}%)</span>
                          </div>
                          <div className="system-admin-bar-track">
                            <div className="system-admin-bar-fill" style={{ width: `${Math.min(Math.max(row.percent, 0), 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                  </article>

                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Phân bổ tài khoản theo chi nhánh</h2></div>
                    <div className="system-admin-bars-wrap">
                      {branchChartRows.map((row) => (
                        <div key={row.code} className="system-admin-bar-item">
                          <div className="system-admin-bar-row">
                            <strong>{row.label}</strong>
                            <span>{row.count} tài khoản</span>
                          </div>
                          <div className="system-admin-bar-track">
                            <div className="system-admin-bar-fill system-admin-bar-fill--branch" style={{ width: `${Math.min(Math.max(row.percentOfMax, 0), 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Phân tích lực lượng</h2></div>
                    <div className="system-admin-role-pill-grid">
                      <div>
                        <span>ADMIN</span>
                        <strong>{fmtNumber(dashboardSummary.adminCount)}</strong>
                      </div>
                      <div>
                        <span>MANAGER</span>
                        <strong>{fmtNumber(dashboardSummary.managerCount)}</strong>
                      </div>
                      <div>
                        <span>STAFF</span>
                        <strong>{fmtNumber(dashboardSummary.staffCount)}</strong>
                      </div>
                      <div>
                        <span>CUSTOMER</span>
                        <strong>{fmtNumber(dashboardSummary.customerCount)}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </>
            ) : null}
          </section>
        )}

        {activeTab === 'promotions' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý chương trình khuyến mãi &amp; Voucher</h2>
              <span>Thiết lập, chỉnh sửa và kích hoạt các chương trình giảm giá / voucher</span>
            </div>

            <div className="system-admin-card" style={{ marginBottom: '0.8rem' }}>
              <div className="panel-head">
                <h2>{editingPromotionCode ? `Cập nhật: ${editingPromotionCode}` : 'Tạo chương trình khuyến mãi mới'}</h2>
              </div>

              <div className="system-admin-form-grid system-admin-form-grid--promotion">
                <label>
                  <span>Mã khuyến mãi (công khai)</span>
                  <input
                    value={promotionForm.ma_khuyen_mai}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, ma_khuyen_mai: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                    placeholder="VD: SUMMER10"
                    disabled={Boolean(editingPromotionCode)}
                  />
                </label>
                <label className="system-admin-promo-name-field">
                  <span>Tên chương trình</span>
                  <input
                    value={promotionForm.ten_khuyen_mai}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, ten_khuyen_mai: e.target.value }))}
                    placeholder="VD: Giảm 10% mùa hè 2025"
                  />
                </label>
                <label>
                  <span>Loại khuyến mãi</span>
                  <select
                    value={promotionForm.loai_khuyen_mai}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, loai_khuyen_mai: e.target.value }))}
                    disabled={Boolean(editingPromotionCode)}
                  >
                    {(PROMOTION_TYPES || []).map((t) => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    {promotionForm.loai_khuyen_mai === 'PERCENT' ? 'Phần trăm giảm (%)' :
                     promotionForm.loai_khuyen_mai === 'FIXED' ? 'Số tiền giảm (đ)' : 'Giá trị (không bắt buộc)'}
                  </span>
                  <input
                    type="number" min="0"
                    max={promotionForm.loai_khuyen_mai === 'PERCENT' ? 100 : undefined}
                    value={promotionForm.gia_tri}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, gia_tri: e.target.value }))}
                    disabled={promotionForm.loai_khuyen_mai === 'FREE_ITEM'}
                  />
                </label>
                <label>
                  <span>Giá trị đơn tối thiểu (đ)</span>
                  <input
                    type="number" min="0"
                    value={promotionForm.gia_tri_don_toi_thieu}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, gia_tri_don_toi_thieu: e.target.value }))}
                    placeholder="0 = không giới hạn"
                  />
                </label>
                {promotionForm.loai_khuyen_mai === 'PERCENT' ? (
                  <label>
                    <span>Giảm tối đa (đ, để trống = không giới hạn)</span>
                    <input
                      type="number" min="0"
                      value={promotionForm.giam_toi_da}
                      onChange={(e) => setPromotionForm((p) => ({ ...p, giam_toi_da: e.target.value }))}
                      placeholder="VD: 50000"
                    />
                  </label>
                ) : promotionForm.loai_khuyen_mai === 'FREE_ITEM' ? (
                  <label>
                    <span>Tên sản phẩm tặng kèm</span>
                    <input
                      value={promotionForm.ten_san_pham_tang}
                      onChange={(e) => setPromotionForm((p) => ({ ...p, ten_san_pham_tang: e.target.value }))}
                      placeholder="VD: Bánh quy chocolate"
                    />
                  </label>
                ) : <div />}

                <label>
                  <span>Số lượng tối đa (0 = vô hạn)</span>
                  <input
                    type="number" min="0"
                    value={promotionForm.so_luong_toi_da}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, so_luong_toi_da: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Giới hạn mỗi khách</span>
                  <input
                    type="number" min="1"
                    value={promotionForm.gioi_han_moi_nguoi}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, gioi_han_moi_nguoi: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Trạng thái</span>
                  <select value={promotionForm.trang_thai} onChange={(e) => setPromotionForm((p) => ({ ...p, trang_thai: e.target.value }))}>
                    <option value="ACTIVE">✅ Hiệu lực</option>
                    <option value="INACTIVE">⏸️ Tạm dừng</option>
                  </select>
                </label>

                <label>
                  <span>Ngày bắt đầu</span>
                  <input type="datetime-local" value={promotionForm.ngay_bat_dau} onChange={(e) => setPromotionForm((p) => ({ ...p, ngay_bat_dau: e.target.value }))} />
                </label>
                <label>
                  <span>Ngày kết thúc</span>
                  <input type="datetime-local" value={promotionForm.ngay_ket_thuc} onChange={(e) => setPromotionForm((p) => ({ ...p, ngay_ket_thuc: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span>Hiển thị cho khách</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(promotionForm.hien_thi_cho_khach)}
                      onChange={(e) => setPromotionForm((p) => ({ ...p, hien_thi_cho_khach: e.target.checked }))}
                      style={{ width: 'auto', accentColor: 'var(--burnt)' }}
                    />
                    <span style={{ fontSize: '0.86rem', color: '#4a2f20' }}>Hiển thị trang khuyến mãi</span>
                  </label>
                </label>

                <label>
                  <span>URL ảnh banner (tùy chọn)</span>
                  <input
                    value={promotionForm.hinh_anh}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, hinh_anh: e.target.value }))}
                    placeholder="https://... hoặc để trống"
                  />
                </label>
                <label className="system-admin-promo-desc-field">
                  <span>Mô tả chi tiết</span>
                  <input
                    value={promotionForm.mo_ta}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, mo_ta: e.target.value }))}
                    placeholder="Mô tả điều kiện áp dụng..."
                  />
                </label>
              </div>

              <div className="system-admin-form-actions" style={{ marginTop: '0.7rem' }}>
                <button type="button" onClick={savePromotion} disabled={savingPromotion}>
                  {savingPromotion ? 'Đang lưu...' : editingPromotionCode ? 'Cập nhật' : 'Tạo khuyến mãi'}
                </button>
                {editingPromotionCode ? (
                  <button type="button" className="secondary" onClick={cancelEditPromotion}>Hủy sửa</button>
                ) : null}
              </div>
            </div>

            <div className="orders-filter-bar" style={{ marginBottom: '0.8rem' }}>
              <div className="system-admin-promo-filter-grid">
                <input
                  value={promotionFilter.q}
                  onChange={(e) => setPromotionFilter((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="Tìm mã, tên, mô tả..."
                />
                <select value={promotionFilter.status} onChange={(e) => setPromotionFilter((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">Hiệu lực</option>
                  <option value="INACTIVE">Tạm dừng</option>
                  <option value="EXPIRED">Hết hạn</option>
                </select>
                <select value={promotionFilter.type} onChange={(e) => setPromotionFilter((prev) => ({ ...prev, type: e.target.value }))}>
                  <option value="">Tất cả loại</option>
                  <option value="PERCENT">Giảm %</option>
                  <option value="FIXED">Giảm tiền</option>
                  <option value="FREE_ITEM">Tặng kèm</option>
                </select>
              </div>
            </div>

            {promotionsState.loading ? <p>Đang tải khuyến mãi...</p> : null}
            {promotionsState.error ? <p className="error-text">{promotionsState.error}</p> : null}

            <div className="system-admin-promo-list">
              {promotionFilteredItems.map((item) => (
                <article key={item.ma_khuyen_mai} className={`system-admin-promo-card system-admin-promo-card--${(item.trang_thai || 'inactive').toLowerCase()}`}>
                  <div className="system-admin-promo-card-header">
                    <div className="system-admin-promo-code-badge">
                      <span className="system-admin-promo-code">{item.ma_khuyen_mai}</span>
                      <span className={`system-admin-promo-type-badge system-admin-promo-type--${(item.loai_khuyen_mai || '').toLowerCase()}`}>
                        {PROMOTION_TYPE_LABELS[item.loai_khuyen_mai] || item.loai_khuyen_mai}
                      </span>
                    </div>
                    <span className={`system-admin-promo-status-badge system-admin-promo-status--${(item.trang_thai || 'inactive').toLowerCase()}`}>
                      {PROMOTION_STATUS_LABELS[item.trang_thai] || item.trang_thai}
                    </span>
                  </div>

                  <div className="system-admin-promo-card-body">
                    {item.hinh_anh ? (
                      <img src={item.hinh_anh} alt={item.ten_khuyen_mai} className="system-admin-promo-thumb" />
                    ) : null}
                    <div className="system-admin-promo-info">
                      <h3>{item.ten_khuyen_mai}</h3>
                      {item.mo_ta ? <p className="system-admin-promo-desc">{item.mo_ta}</p> : null}
                      <div className="system-admin-promo-meta-grid">
                        <div>
                          <span>Giá trị giảm</span>
                          <strong>
                            {item.loai_khuyen_mai === 'PERCENT'
                              ? `${item.gia_tri}%${item.giam_toi_da ? ` (tối đa ${fmtNumber(item.giam_toi_da)}đ)` : ''}`
                              : item.loai_khuyen_mai === 'FIXED'
                              ? `${fmtNumber(item.gia_tri)}đ`
                              : item.ten_san_pham_tang || 'Xem mô tả'}
                          </strong>
                        </div>
                        <div>
                          <span>Đơn tối thiểu</span>
                          <strong>{item.gia_tri_don_toi_thieu > 0 ? `${fmtNumber(item.gia_tri_don_toi_thieu)}đ` : 'Không yêu cầu'}</strong>
                        </div>
                        <div>
                          <span>Lượt dùng</span>
                          <strong>{item.so_luong_da_dung}{item.so_luong_toi_da > 0 ? ` / ${fmtNumber(item.so_luong_toi_da)}` : ' / Vô hạn'}</strong>
                        </div>
                        <div>
                          <span>Giới hạn/người</span>
                          <strong>{item.gioi_han_moi_nguoi} lần</strong>
                        </div>
                        <div>
                          <span>Hiệu lực từ</span>
                          <strong>{fmtDateShort(item.ngay_bat_dau)}</strong>
                        </div>
                        <div>
                          <span>Hết hạn</span>
                          <strong>{fmtDateShort(item.ngay_ket_thuc)}</strong>
                        </div>
                      </div>
                      {item.hien_thi_cho_khach
                        ? <span className="system-admin-promo-visible-badge">👀 Hiển thị cho khách</span>
                        : <span className="system-admin-promo-hidden-badge">🕶️ Ẩn khỏi trang khách</span>}
                    </div>
                  </div>

                  <div className="system-admin-promo-card-actions">
                    <button type="button" className="secondary" onClick={() => startEditPromotion(item)}>Sửa</button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => deletePromotion(item.ma_khuyen_mai)}
                      disabled={Number(item.so_luong_da_dung || 0) > 0}
                      title={Number(item.so_luong_da_dung || 0) > 0 ? 'Không thể xóa vì đã có người dùng. Hãy chuyển sang INACTIVE.' : ''}
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              ))}
              {!promotionsState.loading && promotionFilteredItems.length === 0 ? (
                <p style={{ color: '#8c6b56' }}>Chưa có chương trình nào. Hãy tạo chương trình đầu tiên ở trên!</p>
              ) : null}
            </div>
          </section>
        )}

        {activeTab === 'users' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý người dùng và phân quyền</h2>
              <span>CRUD tài khoản STAFF/MANAGER + gán chi nhánh</span>
            </div>

            <div className="orders-filter-bar" style={{ marginBottom: '0.8rem' }}>
              <div className="system-admin-filter-grid">
                <input
                  value={userFilters.q}
                  onChange={(e) => setUserFilters((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="Tìm username, họ tên, email"
                />
                <select value={userFilters.role} onChange={(e) => setUserFilters((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="">Tất cả role</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="STAFF">STAFF</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                </select>
                <select value={userFilters.branch_code} onChange={(e) => setUserFilters((prev) => ({ ...prev, branch_code: e.target.value }))}>
                  <option value="">Tất cả chi nhánh</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>{branch.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => loadUsers()}>Lọc</button>
              </div>
            </div>

            <div className="system-admin-card" style={{ marginBottom: '0.8rem' }}>
              <div className="panel-head"><h2>{editingUserId ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}</h2></div>
              <div className="system-admin-form-grid system-admin-form-grid--user">
                <label>
                  <span>Username</span>
                  <input value={userForm.ten_dang_nhap} onChange={(e) => setUserForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))} />
                </label>
                <label>
                  <span>Họ tên</span>
                  <input value={userForm.ho_ten} onChange={(e) => setUserForm((p) => ({ ...p, ho_ten: e.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input value={userForm.email || ''} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
                </label>
                <label>
                  <span>Mật khẩu {editingUserId ? '(để trống nếu giữ nguyên)' : ''}</span>
                  <input type="password" value={userForm.mat_khau || ''} onChange={(e) => setUserForm((p) => ({ ...p, mat_khau: e.target.value }))} />
                </label>
                <label>
                  <span>Vai trò</span>
                  <select value={userForm.vai_tro} onChange={(e) => setUserForm((p) => ({ ...p, vai_tro: e.target.value }))}>
                    <option value="STAFF">STAFF</option>
                    <option value="MANAGER">MANAGER</option>
                  </select>
                </label>
                <label>
                  <span>Chi nhánh</span>
                  <select value={userForm.co_so_ma} onChange={(e) => setUserForm((p) => ({ ...p, co_so_ma: e.target.value }))}>
                    {branchOptions.map((branch) => (
                      <option key={branch.code} value={branch.code}>{branch.name}</option>
                    ))}
                  </select>
                </label>
                {editingUserId ? (
                  <label>
                    <span>Trạng thái</span>
                    <select value={userForm.trang_thai || 'ACTIVE'} onChange={(e) => setUserForm((p) => ({ ...p, trang_thai: e.target.value }))}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="system-admin-form-actions">
                <button type="button" onClick={saveUser} disabled={savingUser}>{savingUser ? 'Đang lưu...' : 'Lưu tài khoản'}</button>
                {editingUserId ? <button type="button" className="secondary" onClick={cancelEditUser}>Hủy sửa</button> : null}
              </div>
            </div>

            {usersState.loading ? <p>Đang tải users...</p> : null}
            {usersState.error ? <p className="error-text">{usersState.error}</p> : null}
            <div className="system-admin-users-grid">
              {usersState.items.map((item) => (
                <article key={item.ma_nguoi_dung} className="system-admin-user-card">
                  <div>
                    <h3>{item.ho_ten}</h3>
                    <p>@{item.ten_dang_nhap}</p>
                    <p>{item.email || '---'}</p>
                    <p>{item.co_so_ten || 'Không gán chi nhánh'}</p>
                  </div>
                  <div>
                    <p className="order-payment-pill">{item.vai_tro}</p>
                    <strong>{item.trang_thai}</strong>
                    <p>{new Date(item.ngay_tao).toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="system-admin-user-actions">
                    <button type="button" className="secondary" onClick={() => startEditUser(item)}>Sửa</button>
                    <button type="button" className="secondary" onClick={() => deleteUser(item.ma_nguoi_dung)} disabled={item.vai_tro === 'ADMIN'}>Xóa</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'branches' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý chi nhánh cửa hàng</h2>
              <span>CRUD chi nhánh: mã, tên, địa chỉ, số điện thoại, trạng thái</span>
            </div>

            <div className="system-admin-card" style={{ marginBottom: '0.8rem' }}>
              <div className="panel-head"><h2>{editingBranchCode ? 'Cập nhật chi nhánh' : 'Tạo chi nhánh mới'}</h2></div>
              <div className="system-admin-form-grid system-admin-form-grid--branch">
                <label>
                  <span>Mã chi nhánh</span>
                  <input
                    value={branchForm.ma_chi_nhanh}
                    onChange={(e) => setBranchForm((p) => ({ ...p, ma_chi_nhanh: e.target.value.toUpperCase() }))}
                    placeholder="VD: QUAN_1"
                    disabled={Boolean(editingBranchCode)}
                  />
                </label>
                <label>
                  <span>Tên chi nhánh</span>
                  <input value={branchForm.ten_chi_nhanh} onChange={(e) => setBranchForm((p) => ({ ...p, ten_chi_nhanh: e.target.value }))} />
                </label>

                <label className="system-admin-branch-city-field">
                  <span>Tỉnh/Thành phố</span>
                  <input
                    className="system-admin-select-search"
                    value={locationSearch.city}
                    onChange={(e) => setLocationSearch((p) => ({ ...p, city: e.target.value }))}
                    placeholder="Gõ để lọc tỉnh/thành"
                  />
                  <select
                    value={branchForm.thanh_pho}
                    onChange={(e) => {
                      setBranchForm((p) => ({
                        ...p,
                        thanh_pho: e.target.value,
                        quan_huyen: '',
                        phuong_xa: '',
                      }))
                      setLocationSearch((p) => ({ ...p, district: '', ward: '' }))
                    }}
                  >
                    {cityOptions.map((city) => (
                      <option key={city.code} value={city.code}>{city.label}</option>
                    ))}
                  </select>
                </label>

                <label className="system-admin-branch-district-field">
                  <span>Quận/Huyện</span>
                  <input
                    className="system-admin-select-search"
                    value={locationSearch.district}
                    onChange={(e) => setLocationSearch((p) => ({ ...p, district: e.target.value }))}
                    placeholder="Gõ để lọc quận/huyện"
                    disabled={!branchForm.thanh_pho}
                  />
                  <select
                    value={branchForm.quan_huyen}
                    onChange={(e) => {
                      setBranchForm((p) => ({ ...p, quan_huyen: e.target.value, phuong_xa: '' }))
                      setLocationSearch((p) => ({ ...p, ward: '' }))
                    }}
                    disabled={!districtOptions.length}
                  >
                    <option value="">Chọn quận/huyện</option>
                    {districtOptions.map((district) => (
                      <option key={district.code} value={district.code}>{district.label}</option>
                    ))}
                  </select>
                </label>

                <label className="system-admin-branch-ward-field">
                  <span>Phường/Xã</span>
                  <input
                    className="system-admin-select-search"
                    value={locationSearch.ward}
                    onChange={(e) => setLocationSearch((p) => ({ ...p, ward: e.target.value }))}
                    placeholder="Gõ để lọc phường/xã"
                    disabled={!branchForm.quan_huyen}
                  />
                  <select
                    value={branchForm.phuong_xa}
                    onChange={(e) => setBranchForm((p) => ({ ...p, phuong_xa: e.target.value }))}
                    disabled={!wardOptions.length}
                  >
                    <option value="">Chọn phường/xã</option>
                    {wardOptions.map((ward) => (
                      <option key={ward.code} value={ward.code}>{ward.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Số điện thoại</span>
                  <input value={branchForm.so_dien_thoai || ''} onChange={(e) => setBranchForm((p) => ({ ...p, so_dien_thoai: e.target.value }))} />
                </label>
                <label>
                  <span>Trạng thái</span>
                  <select value={branchForm.trang_thai} onChange={(e) => setBranchForm((p) => ({ ...p, trang_thai: e.target.value }))}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </label>
                <label className="system-admin-branch-address-field">
                  <span>Địa chỉ chi tiết (số nhà, tên đường, tòa nhà)</span>
                  <input
                    value={branchForm.dia_chi_chi_tiet || ''}
                    onChange={(e) => setBranchForm((p) => ({ ...p, dia_chi_chi_tiet: e.target.value }))}
                    placeholder="VD: 123 Nguyen Dinh Chieu"
                  />
                </label>

                <div className="system-admin-branch-address-preview">
                  <strong>Địa chỉ đầy đủ:</strong>
                  <span>{branchAddressPreview || 'Chưa đủ thông tin địa chỉ để hiển thị preview'}</span>
                </div>
              </div>

              <div className="system-admin-form-actions">
                <button type="button" onClick={saveBranch} disabled={savingBranch}>{savingBranch ? 'Đang lưu...' : 'Lưu chi nhánh'}</button>
                {editingBranchCode ? <button type="button" className="secondary" onClick={cancelEditBranch}>Hủy sửa</button> : null}
              </div>
            </div>

            {branchesState.loading ? <p>Đang tải chi nhánh...</p> : null}
            {branchesState.error ? <p className="error-text">{branchesState.error}</p> : null}

            <div className="system-admin-branch-grid">
              {branchesState.items.map((branch) => (
                <article key={branch.ma_chi_nhanh} className="system-admin-branch-card">
                  <div>
                    <h3>{branch.ten_chi_nhanh}</h3>
                    <p>Mã: {branch.ma_chi_nhanh}</p>
                    <p>Địa chỉ: {branch.dia_chi || '---'}</p>
                    <p>SĐT: {branch.so_dien_thoai || '---'}</p>
                  </div>
                  <div>
                    <p className="order-payment-pill">{branch.trang_thai}</p>
                    <strong>{fmtNumber(branch.account_count)} tài khoản</strong>
                    <p>{new Date(branch.ngay_cap_nhat || branch.ngay_tao).toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="system-admin-user-actions">
                    <button type="button" className="secondary" onClick={() => startEditBranch(branch)}>Sửa</button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => deleteBranch(branch.ma_chi_nhanh)}
                      disabled={Number(branch.account_count || 0) > 0}
                      title={Number(branch.account_count || 0) > 0 ? 'Không thể xóa vì đang có tài khoản gán vào' : ''}
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'ai-analytics' && (
          <section className="panel system-admin-panel" style={{ padding: '28px 32px' }}>
            <AiAnalyticsPanel session={session} />
          </section>
        )}

        {activeTab === 'menu' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý menu tổng (CRUD)</h2>
              <span>Ảnh upload sẽ được lưu vào web-customer/public/images/products</span>
            </div>

            <div className="system-admin-menu-layout">
              <section className="system-admin-card system-admin-form-card">
                <div className="panel-head"><h2>{editingMenuId ? 'Cập nhật món' : 'Thêm món mới'}</h2></div>

                <div className="system-admin-form-grid">
                  <label>
                    <span>Tên món</span>
                    <input value={menuForm.name} onChange={(e) => setMenuForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ví dụ: Cà phê sữa đá" />
                  </label>
                  <label>
                    <span>Danh mục</span>
                    <select value={menuForm.category_code} onChange={(e) => setMenuForm((p) => ({ ...p, category_code: e.target.value }))}>
                      <option value="">Chọn danh mục</option>
                      {categoriesState.items.map((cat) => (
                        <option key={cat.code} value={cat.code}>{cat.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Giá bán</span>
                    <input type="number" min="0" value={menuForm.price} onChange={(e) => setMenuForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))} />
                  </label>
                  <label>
                    <span>Mô tả</span>
                    <input value={menuForm.description} onChange={(e) => setMenuForm((p) => ({ ...p, description: e.target.value }))} placeholder="Mô tả ngắn gọn cho món" />
                  </label>
                  <label>
                    <span>Trạng thái</span>
                    <select value={menuForm.dang_ban ? '1' : '0'} onChange={(e) => setMenuForm((p) => ({ ...p, dang_ban: e.target.value === '1' }))}>
                      <option value="1">Đang bán</option>
                      <option value="0">Tạm ngưng</option>
                    </select>
                  </label>
                  <label>
                    <span>Đường dẫn ảnh</span>
                    <input value={menuForm.image} onChange={(e) => setMenuForm((p) => ({ ...p, image: e.target.value }))} placeholder="/images/products/ca-phe-sua-da.jpg" />
                  </label>
                </div>

                <div className="system-admin-upload-box">
                  <div>
                    <strong>Tải ảnh sản phẩm</strong>
                    <p>Chọn file, hệ thống sẽ tự đổi tên theo tên món và lưu vào thư mục ảnh sản phẩm.</p>
                  </div>
                  <label className="system-admin-upload-drop">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => uploadMenuImage(e.target.files?.[0]).catch(() => {})}
                    />
                    <span>{uploadState.loading ? 'Đang tải ảnh...' : 'Chọn ảnh JPG, PNG, WEBP'}</span>
                    <small>{menuForm.name ? `Tên file sẽ bám theo: ${menuForm.name}` : 'Nhập tên món trước để ra tên file đẹp hơn'}</small>
                  </label>
                  {uploadState.error ? <p className="error-text">{uploadState.error}</p> : null}
                  {uploadState.success ? <p className="system-admin-success">{uploadState.success}</p> : null}
                </div>

                <div className="system-admin-image-preview">
                  {menuForm.image ? <img src={menuForm.image} alt={menuForm.name || 'Preview'} /> : <div className="system-admin-image-placeholder">Chưa có ảnh xem trước</div>}
                  <div className="system-admin-image-meta">
                    <p>{menuForm.image || 'Chưa có đường dẫn ảnh'}</p>
                    <button type="button" className="secondary" onClick={clearMenuImage} disabled={!menuForm.image}>Xóa ảnh</button>
                  </div>
                </div>

                <div className="system-admin-form-actions">
                  <button type="button" onClick={saveMenu} disabled={savingMenu}>{savingMenu ? 'Đang lưu...' : 'Lưu món'}</button>
                  {editingMenuId ? <button type="button" className="secondary" onClick={cancelEditMenu}>Hủy sửa</button> : null}
                </div>
              </section>

              <section className="system-admin-card system-admin-menu-list-card">
                <div className="panel-head"><h2>Danh sách menu tổng</h2><span>{menuState.items.length} món</span></div>
                {menuState.loading ? <p>Đang tải menu...</p> : null}
                {menuState.error ? <p className="error-text">{menuState.error}</p> : null}

                <div className="system-admin-menu-grid">
                  {menuState.items.map((item) => (
                    <article key={item.id} className="system-admin-menu-item">
                      <div className="system-admin-menu-thumb-wrap">
                        {item.image ? <img src={item.image} alt={item.name} className="system-admin-menu-thumb" /> : <div className="system-admin-menu-thumb system-admin-menu-thumb--empty">No image</div>}
                        <span className={item.dang_ban ? 'system-admin-status system-admin-status--active' : 'system-admin-status system-admin-status--inactive'}>
                          {item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}
                        </span>
                      </div>
                      <div className="system-admin-menu-body">
                        <h3>{item.name}</h3>
                        <p className="system-admin-menu-category">{item.category || 'Chưa có danh mục'}</p>
                        <strong>{fmtNumber(item.price)} đ</strong>
                        <p className="system-admin-menu-description">{item.description || 'Chưa có mô tả cho món này.'}</p>
                        <div className="system-admin-menu-actions">
                          <button type="button" className="secondary" onClick={() => startEditMenu(item)}>Sửa</button>
                          <button type="button" className="secondary" onClick={() => deleteMenu(item.id)}>Xóa</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
