import { BRANCH_OPTIONS, useSystemAdmin } from '../hooks/useSystemAdmin'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

export function AdminSystemConsole({ session, onLogout }) {
  const {
    activeTab,
    setActiveTab,
    statsState,
    roleChartRows,
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
          <button type="button" className={activeTab === 'menu' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('menu')}>
            Quản lý menu tổng
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
          <section className="panel">
            <div className="panel-head">
              <h2>Thống kê người dùng toàn hệ thống</h2>
              <span>Dùng để demo tổng quan vai trò và vận hành</span>
            </div>

            {statsState.loading ? <p>Đang tải thống kê...</p> : null}
            {statsState.error ? <p className="error-text">{statsState.error}</p> : null}

            {!statsState.loading && !statsState.error && statsState.data ? (
              <>
                <div className="stats-grid" style={{ marginBottom: '0.9rem' }}>
                  <article className="kpi-card kpi-brown"><p>Tổng users</p><h3>{fmtNumber(statsState.data.total_users)}</h3></article>
                  <article className="kpi-card kpi-green"><p>Đang hoạt động</p><h3>{fmtNumber(statsState.data.active_users)}</h3></article>
                  <article className="kpi-card kpi-amber"><p>Tạm khóa</p><h3>{fmtNumber(statsState.data.inactive_users)}</h3></article>
                </div>

                <div className="panel" style={{ background: '#fff', border: '1px solid #efdaca' }}>
                  <div className="panel-head"><h2>Biểu đồ tỷ trọng theo role</h2></div>
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {roleChartRows.map((row) => (
                      <div key={row.role}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <strong>{row.role}</strong>
                          <span>{row.count} ({row.percent}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '10px', borderRadius: '999px', background: '#f2e2d3' }}>
                          <div
                            style={{
                              width: `${Math.min(Math.max(row.percent, 0), 100)}%`,
                              height: '100%',
                              borderRadius: '999px',
                              background: 'linear-gradient(90deg, #f97316, #d65a12)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        )}

        {activeTab === 'users' && (
          <section className="panel">
            <div className="panel-head">
              <h2>Quản lý người dùng và phân quyền</h2>
              <span>CRUD tài khoản STAFF/MANAGER + gán chi nhánh</span>
            </div>

            <div className="orders-filter-bar" style={{ marginBottom: '0.8rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 220px auto', gap: '0.55rem' }}>
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
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch.code} value={branch.code}>{branch.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => loadUsers()}>Lọc</button>
              </div>
            </div>

            <div className="panel" style={{ marginBottom: '0.8rem' }}>
              <div className="panel-head"><h2>{editingUserId ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}</h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
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
                    {BRANCH_OPTIONS.map((branch) => (
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
              <div style={{ display: 'flex', gap: '0.55rem', marginTop: '0.7rem' }}>
                <button type="button" onClick={saveUser} disabled={savingUser}>{savingUser ? 'Đang lưu...' : 'Lưu tài khoản'}</button>
                {editingUserId ? <button type="button" className="secondary" onClick={cancelEditUser}>Hủy sửa</button> : null}
              </div>
            </div>

            {usersState.loading ? <p>Đang tải users...</p> : null}
            {usersState.error ? <p className="error-text">{usersState.error}</p> : null}
            <div className="order-list">
              {usersState.items.map((item) => (
                <article key={item.ma_nguoi_dung} className="order-card">
                  <div>
                    <h3>{item.ho_ten}</h3>
                    <p>@{item.ten_dang_nhap}</p>
                    <p>{item.email || '---'}</p>
                    <p>{item.co_so_ten || 'Khong gan chi nhanh'}</p>
                  </div>
                  <div>
                    <p className="order-payment-pill">{item.vai_tro}</p>
                    <strong>{item.trang_thai}</strong>
                    <p>{new Date(item.ngay_tao).toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="status-update-box">
                    <button type="button" className="secondary" onClick={() => startEditUser(item)}>Sửa</button>
                    <button type="button" className="secondary" onClick={() => deleteUser(item.ma_nguoi_dung)} disabled={item.vai_tro === 'ADMIN'}>Xóa</button>
                  </div>
                </article>
              ))}
            </div>
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
                    <p>Chọn file, hệ thống sẽ tự đổi tên theo tên món và lưu vào thư mục dùng chung.</p>
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
