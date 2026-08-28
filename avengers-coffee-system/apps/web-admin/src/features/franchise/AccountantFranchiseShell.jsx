import { useState } from 'react'
import { FranchisePanel } from './FranchisePanel'

/**
 * AccountantFranchiseShell
 * Giao diện dành riêng cho role ACCOUNTANT — mang phong cách chuyên nghiệp, tối giản.
 * Tập trung vào số liệu, báo cáo với sidebar màu dark navy.
 */
export function AccountantFranchiseShell({ session, onLogout }) {
  const userName =
    session?.user?.ho_ten ||
    session?.user?.hoTen ||
    session?.user?.tenDangNhap ||
    session?.user?.ten_dang_nhap ||
    'Kế toán'

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#f1f5f9', // Nền nhạt, lạnh
        fontFamily: '"Segoe UI",Inter,system-ui,sans-serif',
      }}
    >
      {/* ── Sidebar (Red Theme) ─────────────────────────────────────────── */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          background: '#1e3a8a', // Deep Blue
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        {/* Brand */}
        <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: '#2563eb', // Lighter Blue
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
          }}>💼</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '0.02em' }}>Avengers Coffee</div>
            <div style={{ fontSize: 11, color: '#bfdbfe', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Khối Kế Toán & TC</div>
          </div>
        </div>

        {/* User Card */}
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>Xin chào,</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 8 }}>{userName}</div>
          <div style={{ display: 'inline-block', padding: '4px 10px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700 }}>
            ROLE: ACCOUNTANT
          </div>
        </div>

        {/* Menu (Chỉ để decor vì các tab nằm trong FranchisePanel) */}
        <div style={{ flex: 1, padding: '20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modules Hệ Thống</div>
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', borderLeft: '3px solid #fff',
            color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10
          }}>
            <span style={{ fontSize: 18 }}>🤝</span> Quản lý Nhượng quyền
          </div>
          {/* Mock disabled menus cho chuyên nghiệp */}
          <div style={{ padding: '10px 14px', marginTop: 4, color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7 }}>
            <span style={{ fontSize: 18 }}>📉</span> Báo cáo Doanh thu (Sắp ra mắt)
          </div>
          <div style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7 }}>
            <span style={{ fontSize: 18 }}>🏦</span> Quản trị Dòng tiền (Sắp ra mắt)
          </div>
        </div>

        {/* System info & Logout */}
        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }}></span>
            Hệ thống đang hoạt động tốt
          </div>
          <button
            onClick={onLogout}
            style={{
              width: '100%', padding: '10px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer',
              color: '#fff', fontSize: 13, fontWeight: 600, transition: 'all .2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fff' }}
          >
            Đăng xuất khỏi hệ thống
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ─────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar mini */}
        <header style={{
          height: 60, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50
        }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Trung tâm Quản lý Nhượng Quyền & Đối Soát</h1>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
            Session ID: {Math.random().toString(36).substring(2, 10).toUpperCase()} · {new Date().toLocaleDateString('vi-VN')}
          </div>
        </header>

        {/* Nội dung FranchisePanel (đã bao gồm các Tab: Kiosk, Combo, Công nợ, Royalty...) */}
        <div style={{ flex: 1, padding: 24, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
          <FranchisePanel />
        </div>
      </main>
    </div>
  )
}
