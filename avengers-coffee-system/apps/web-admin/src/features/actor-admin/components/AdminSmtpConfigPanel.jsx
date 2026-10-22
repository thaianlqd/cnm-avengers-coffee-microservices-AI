import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import React, { useState, useEffect } from 'react'
import {
  Mail,
  Server,
  Key,
  Shield,
  Send,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Info,
  ExternalLink,
  Lock,
  User,
  Check,
  Zap,
  Globe,
  X,
  ShieldCheck,
  CheckCheck,
  Copy
} from '../../../components/console/WorkspaceIcons'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'

export function AdminSmtpConfigPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [toast, setToast] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [testEmail, setTestEmail] = useState('')
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const [form, setForm] = useState({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth_user: '',
    auth_pass: '',
    from_email: '',
    from_name: 'Avengers Coffee',
    is_active: true,
    has_auth_pass: false,
    updated_at: null,
  })

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 5000)
  }

  const loadConfig = async () => {
    setLoading(true)
    try {
      const token = getAdminAccessToken()
      const res = await fetch(`${API_BASE_URL}/smtp/config`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setForm((prev) => ({
        ...prev,
        host: data.host || 'smtp.gmail.com',
        port: data.port || 587,
        secure: Boolean(data.secure),
        auth_user: data.auth_user || '',
        auth_pass: '', // Không hiển thị mật khẩu gốc vì lý do bảo mật
        from_email: data.from_email || data.auth_user || '',
        from_name: data.from_name || 'Avengers Coffee',
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
        has_auth_pass: Boolean(data.has_auth_pass),
        updated_at: data.updated_at,
      }))
    } catch (err) {
      showToast('error', 'Lỗi tải cấu hình SMTP: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    if (!form.host.trim()) {
      showToast('error', 'Vui lòng nhập địa chỉ máy chủ SMTP (Host)')
      return
    }
    setSaving(true)
    try {
      const token = getAdminAccessToken()
      const payload = {
        host: form.host.trim(),
        port: Number(form.port) || 587,
        secure: Boolean(form.secure),
        auth_user: form.auth_user.trim(),
        auth_pass: form.auth_pass.trim() ? form.auth_pass.trim() : undefined,
        from_email: form.from_email.trim() || form.auth_user.trim(),
        from_name: form.from_name.trim(),
        is_active: Boolean(form.is_active),
      }
      const res = await fetch(`${API_BASE_URL}/smtp/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await res.json()
      showToast('success', 'Đã lưu cấu hình máy chủ SMTP thành công!')
      loadConfig()
    } catch (err) {
      showToast('error', 'Không thể lưu cấu hình: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendTest = async (e) => {
    if (e) e.preventDefault()
    if (!testEmail.trim() || !testEmail.includes('@')) {
      showToast('error', 'Vui lòng nhập địa chỉ email nhận thư thử nghiệm hợp lệ')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const token = getAdminAccessToken()
      const res = await fetch(`${API_BASE_URL}/smtp/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to_email: testEmail.trim(),
          host: form.host.trim(),
          port: Number(form.port),
          secure: form.secure,
          auth_user: form.auth_user.trim(),
          auth_pass: form.auth_pass.trim() || undefined,
          from_email: form.from_email.trim(),
          from_name: form.from_name.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `Lỗi HTTP ${res.status}`)
      }
      setTestResult({
        success: true,
        message: data.message || 'Đã gửi email thử nghiệm thành công!',
        previewUrl: data.previewUrl,
      })
      showToast('success', 'Đã gửi thư kiểm tra thành công!')
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message,
      })
      showToast('error', 'Gửi thư thất bại: ' + err.message)
    } finally {
      setTesting(false)
    }
  }

  const applyGmailTlsPreset = () => {
    setForm((prev) => ({
      ...prev,
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
    }))
    showToast('info', 'Đã áp dụng mẫu thiết lập Gmail Cổng 587 (STARTTLS)')
  }

  const applyGmailSslPreset = () => {
    setForm((prev) => ({
      ...prev,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
    }))
    showToast('info', 'Đã áp dụng mẫu thiết lập Gmail Cổng 465 (SSL Trực tiếp)')
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText('https://myaccount.google.com/apppasswords')
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div className="admin-settings-layout admin-mail-workbench">
      {/* Toast Alert */}
      {toast && (
        <div className="admin-settings-notice" role="status"
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            backgroundColor: toast.type === 'success' ? "#f7f9fd" : toast.type === 'error' ? "#f7f9fd" : 'var(--primary-light)',
            color: toast.type === 'success' ? '#2563eb' : toast.type === 'error' ? '#dc2626' : 'var(--primary)',
            border: `1px solid ${toast.type === 'success' ? '#bfdbfe' : toast.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)'
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : toast.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UNIFIED CARD: CẤU HÌNH & KIỂM TRA MÁY CHỦ EMAIL (SMTP) - 1 SECTION DUY NHẤT */}
      {/* ========================================================================= */}
      <div
        className="admin-surface admin-settings-card"
        style={{
          width: '100%',
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        {/* Card Header */}
        <div
          className="admin-card-header"
          style={{
            padding: '1.25rem 1.75rem',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              className="admin-icon-tile"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Server size={20} color="#15803d" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#0f172a' }}>
                Cấu hình máy chủ gửi Email (SMTP)
              </h3>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Đồng bộ máy chủ gửi thư tự động và kiểm tra kết nối đường truyền cho toàn hệ thống
              </span>
            </div>
          </div>

          {/* Action Buttons Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              className="admin-button-secondary"
              type="button"
              onClick={() => setShowGuideModal(true)}
              title="Xem hướng dẫn từng bước lấy Mật khẩu ứng dụng Gmail"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0 0.95rem',
                height: '36px',
                borderRadius: '6px',
                border: '1px solid #fed7aa',
                backgroundColor: '#fffbeb',
                color: '#b45309',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.15s ease'
              }}
            >
              <Info size={15} color="#b45309" aria-hidden="true" />
              <span>Hướng dẫn lấy Mật khẩu Gmail</span>
            </button>

            <button
              className="admin-button-secondary"
              type="button"
              onClick={loadConfig}
              disabled={loading}
              title="Tải lại thông tin mới nhất từ máy chủ"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0 0.95rem',
                height: '36px',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: '#ffffff',
                fontSize: '0.8125rem',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

          {/* Synchronized System Notice Banner */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.8125rem',
              color: '#1e40af',
              fontWeight: '500'
            }}
          >
            <ShieldCheck size={18} color="#2563eb" style={{ flexShrink: 0 }} />
            <span>
              Cấu hình này tự động đồng bộ hóa và áp dụng tức thời cho toàn bộ hệ thống: Hóa đơn đơn hàng, Cập nhật trạng thái giao nhận, Thẻ quà tặng điện tử và Mã OTP đặt lại mật khẩu.
            </span>
          </div>

          {/* Quick Presets Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1.15rem',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', color: '#334155', fontWeight: '600' }}>
              <Zap size={15} color="#d97706" />
              <span>Mẫu thiết lập nhanh thông dụng:</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                className="admin-button-secondary"
                type="button"
                onClick={applyGmailTlsPreset}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#1e293b',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.785rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Globe size={14} color="#2563eb" />
                <span>Gmail (Cổng 587 - STARTTLS)</span>
              </button>

              <button
                className="admin-button-secondary"
                type="button"
                onClick={applyGmailSslPreset}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#1e293b',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.785rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <ShieldCheck size={14} color="#059669" />
                <span>Gmail (Cổng 465 - SSL Trực tiếp)</span>
              </button>
            </div>
          </div>

          {/* SECTION 1: KẾT NỐI MÁY CHỦ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <Server size={17} color="#2563eb" />
              <span>Thông số kết nối máy chủ</span>
              <span style={{ fontSize: '0.75rem', fontWeight: '400', color: '#64748b', marginLeft: 'auto' }}>
                Địa chỉ máy chủ SMTP, cổng và phương thức mã hóa
              </span>
            </div>

            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.25rem 1.5rem' }}>
              {/* Host */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-host" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <Globe size={14} color="#64748b" />
                  <span>Địa chỉ Máy chủ SMTP (Host) <span style={{ color: '#dc2626' }}>*</span></span>
                </label>
                <input
                  id="smtp-input-host"
                  type="text"
                  required
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.8125rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  value={form.host}
                  onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                />
              </div>

              {/* Port */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-port" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <Zap size={14} color="#64748b" />
                  <span>Cổng kết nối (Port) <span style={{ color: '#dc2626' }}>*</span></span>
                </label>
                <input
                  id="smtp-input-port"
                  type="number"
                  required
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.8125rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  value={form.port}
                  onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))}
                  placeholder="587"
                />
              </div>

              {/* Encryption */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-secure" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <Shield size={14} color="#64748b" />
                  <span>Chế độ mã hóa bảo mật</span>
                </label>
                <SearchableSelect
                  id="smtp-input-secure"
                  value={form.secure ? 'SSL' : 'TLS'}
                  onChange={(e) => {
                    const val = e?.target?.value ?? e
                    setForm((p) => ({ ...p, secure: val === 'SSL' }))
                  }}
                  clearable={false}
                  style={{ height: '38px', minHeight: '38px' }}
                >
                  <option value="TLS">STARTTLS (Khuyên dùng cho Cổng 587)</option>
                  <option value="SSL">SSL hoặc TLS Trực tiếp (Dành cho Cổng 465)</option>
                </SearchableSelect>
              </div>

              {/* Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-active" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <CheckCircle2 size={14} color="#64748b" />
                  <span>Trạng thái kích hoạt gửi Email</span>
                </label>
                <SearchableSelect
                  id="smtp-input-active"
                  value={form.is_active ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(e) => {
                    const val = e?.target?.value ?? e
                    setForm((p) => ({ ...p, is_active: val === 'ACTIVE' }))
                  }}
                  clearable={false}
                  style={{ height: '38px', minHeight: '38px' }}
                >
                  <option value="ACTIVE">Đang kích hoạt (Tự động gửi thư khi có đơn)</option>
                  <option value="INACTIVE">Tạm dừng gửi thư</option>
                </SearchableSelect>
              </div>
            </div>
          </div>

          {/* SECTION 2: TÀI KHOẢN XÁC THỰC & NGƯỜI GỬI */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <Key size={17} color="#059669" />
              <span>Xác thực tài khoản &amp; Thông tin người gửi</span>
              <span style={{ fontSize: '0.75rem', fontWeight: '400', color: '#64748b', marginLeft: 'auto' }}>
                Tài khoản ủy quyền và thông tin hiển thị trên email gửi đi
              </span>
            </div>

            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.25rem 1.5rem' }}>
              {/* Auth User */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-auth-user" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <Mail size={14} color="#64748b" />
                  <span>Tài khoản đăng nhập SMTP (Email / User) <span style={{ color: '#dc2626' }}>*</span></span>
                </label>
                <input
                  id="smtp-input-auth-user"
                  type="text"
                  required
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.8125rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  value={form.auth_user}
                  onChange={(e) => setForm((p) => ({ ...p, auth_user: e.target.value }))}
                  placeholder="ví dụ: avengerscoffee.official@gmail.com"
                />
              </div>

              {/* Auth Pass */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="smtp-input-auth-pass" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                    <Lock size={14} color="#64748b" />
                    <span>Mật khẩu ứng dụng (App Password)</span>
                    <button
                      type="button"
                      onClick={() => setShowGuideModal(true)}
                      title="Xem hướng dẫn lấy Mật khẩu ứng dụng 16 ký tự"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: '#d97706'
                      }}
                    >
                      <Info size={14} />
                    </button>
                  </label>
                  {form.has_auth_pass && !form.auth_pass && (
                    <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}>
                      <Check size={13} /> Đã có mật khẩu trong hệ thống
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    id="smtp-input-auth-pass"
                    type={showPassword ? 'text' : 'password'}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 2.5rem 0 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      fontSize: '0.8125rem',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    value={form.auth_pass}
                    onChange={(e) => setForm((p) => ({ ...p, auth_pass: e.target.value }))}
                    placeholder={form.has_auth_pass ? '•••••••• (để trống nếu không muốn đổi)' : 'Nhập mã 16 ký tự Google'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* From Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-from-name" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <User size={14} color="#64748b" />
                  <span>Tên hiển thị người gửi</span>
                </label>
                <input
                  id="smtp-input-from-name"
                  type="text"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.8125rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  value={form.from_name}
                  onChange={(e) => setForm((p) => ({ ...p, from_name: e.target.value }))}
                  placeholder="Avengers Coffee"
                />
              </div>

              {/* From Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="smtp-input-from-email" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontWeight: '500', fontSize: '0.8125rem' }}>
                  <Mail size={14} color="#64748b" />
                  <span>Địa chỉ Email người gửi</span>
                </label>
                <input
                  id="smtp-input-from-email"
                  type="email"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.8125rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  value={form.from_email}
                  onChange={(e) => setForm((p) => ({ ...p, from_email: e.target.value }))}
                  placeholder="support@avengers.coffee"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: KIỂM TRA GỬI THƯ THỬ NGHIỆM (TEST EMAIL) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <Send size={16} color="#7c3aed" />
              <span>Kiểm tra gửi thư điện tử (Test Email)</span>
              <span style={{ fontSize: '0.75rem', fontWeight: '400', color: '#64748b', marginLeft: 'auto' }}>
                Xác thực kết nối máy chủ gửi thử nghiệm trước khi áp dụng
              </span>
            </div>

            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}
            >
              <label htmlFor="smtp-test-email" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', color: '#475569', fontWeight: '500' }}>
                <Send size={14} color="#64748b" />
                <span>Nhập địa chỉ email hòm thư cá nhân của bạn để hệ thống gửi thử một lá thư kiểm tra kết nối:</span>
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  id="smtp-test-email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSendTest(e)
                    }
                  }}
                  placeholder="Nhập email người nhận thử nghiệm (ví dụ: your-email@gmail.com)..."
                  style={{
                    flex: '1 1 320px',
                    height: '38px',
                    padding: '0 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.8125rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />

                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testing}
                  style={{
                    height: '38px',
                    padding: '0 1.25rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontWeight: '500',
                    fontSize: '0.8125rem',
                    cursor: testing ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Send size={14} className={testing ? 'animate-bounce' : ''} />
                  <span>{testing ? 'Đang gửi thư...' : 'Gửi Thư Kiểm Tra'}</span>
                </button>
              </div>

              {/* Test Result Box */}
              {testResult && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: testResult.success ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                    color: testResult.success ? '#15803d' : '#b91c1c',
                    fontSize: '0.8125rem',
                    lineHeight: 1.5,
                    marginTop: '0.25rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                    {testResult.success ? <CheckCircle2 size={16} color="#15803d" /> : <AlertCircle size={16} color="#dc2626" />}
                    <span>{testResult.success ? 'Gửi thử nghiệm thành công!' : 'Gửi thử nghiệm thất bại!'}</span>
                  </div>
                  <p style={{ margin: 0 }}>{testResult.message}</p>
                  {testResult.previewUrl && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <a
                        href={testResult.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#2563eb',
                          fontWeight: '600',
                          textDecoration: 'underline',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        Xem thư gửi thử tại Ethereal Web Viewer <ExternalLink size={13} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CARD FOOTER & SAVE ACTION BAR */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e2e8f0',
              paddingTop: '1.25rem',
              marginTop: '0.25rem',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              {form.updated_at && (
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Cập nhật lần cuối: <strong style={{ color: '#0f172a', fontWeight: '500' }}>{new Date(form.updated_at).toLocaleString('vi-VN')}</strong>
                </span>
              )}
            </div>

            <button
              type="submit"
              className="btn-save"
              disabled={saving}
              style={{
                height: '40px',
                padding: '0 1.75rem',
                fontSize: '0.84rem',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                borderRadius: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <CheckCircle2 size={16} color="#ffffff" />
              <span>{saving ? 'Đang lưu cấu hình...' : 'Lưu Cấu Hình Máy Chủ SMTP'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* ========================================================================= */}
      {/* MODAL HƯỚNG DẪN CÁC BƯỚC TẠO MẬT KHẨU ỨNG DỤNG GMAIL (POPUP DIALOG)      */}
      {/* ========================================================================= */}
      {showGuideModal && (
        <WorkspaceDialog label="Hướng dẫn tạo mật khẩu ứng dụng Gmail" onClose={() => setShowGuideModal(false)}>
          <div className="admin-surface"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              maxWidth: '620px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid var(--border-light)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="admin-card-header"
              style={{
                padding: '1.25rem 1.5rem',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="admin-icon-tile"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: "#f7f9fd",
                    color: '#d97706',
                    border: '1px solid #fde68a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(217, 119, 6, 0.15)'
                  }}
                >
                  <Key size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600', color: 'var(--text-main)' }}>
                    Hướng dẫn tạo Mật khẩu ứng dụng Gmail
                  </h3>
                  <span style={{ fontSize: '0.78125rem', color: 'var(--text-muted)' }}>
                    Các bước để hệ thống Avengers Coffee tự động gửi email xác nhận
                  </span>
                </div>
              </div>

              <button className="admin-icon-button" aria-label="Đóng cửa sổ"
                type="button"
                onClick={() => setShowGuideModal(false)}
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


                title="Đóng cửa sổ"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Step by Step */}
            <div
              style={{
                padding: '1.5rem',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              {/* Step 1 */}
              <div className="admin-surface"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  1
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Bật Xác minh 2 bước (2-Step Verification)
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Đăng nhập tài khoản Google của bạn và kích hoạt tính năng Xác minh 2 bước trong mục <strong>Bảo mật (Security)</strong>.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="admin-surface"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  2
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Truy cập trang Mật khẩu ứng dụng
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Vào mục <strong>Mật khẩu ứng dụng (App Passwords)</strong> tại trang quản lý tài khoản Google.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.75rem',
                        backgroundColor: '#f1f5fb', color: 'var(--text-main)', border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        fontSize: '0.78125rem',
                        fontWeight: '700',
                        textDecoration: 'none'
                      }}
                    >
                      <span>Mở trang Mật khẩu ứng dụng Google</span>
                      <ExternalLink size={13} />
                    </a>
                    <button className="admin-button-secondary"
                      type="button"
                      onClick={handleCopyLink}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.65rem',
                        backgroundColor: '#ffffff',
                        color: copiedLink ? "var(--primary)" : 'var(--text-muted)',
                        border: `1px solid ${copiedLink ? '#bfdbfe' : '#ccd3c7'}`,
                        borderRadius: '8px',
                        fontSize: '0.78125rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {copiedLink ? <CheckCheck size={13} /> : <Copy size={13} />}
                      <span>{copiedLink ? 'Đã sao chép link' : 'Sao chép link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="admin-surface"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  3
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Đặt tên ứng dụng và bấm Tạo
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Nhập tên nhận diện (ví dụ: <code style={{ backgroundColor: "#f7f9fd", padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: '700' }}>Avengers Coffee</code>) rồi bấm nút <strong>Tạo (Create)</strong>.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="admin-surface"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  4
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Sao chép mã 16 ký tự và dán vào hệ thống
                  </div>
                  <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Google sẽ cấp một chuỗi mật khẩu gồm 16 ký tự màu vàng nhạt (ví dụ: <code style={{ backgroundColor: "#f7f9fd", color: '#b45309', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '700' }}>abcd efgh ijkl mnop</code>).
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Dán mã 16 ký tự này vào ô <strong>Mật khẩu ứng dụng (App Password)</strong> và bấm <strong>Lưu Cấu Hình</strong>.
                  </p>
                </div>
              </div>

              {/* Security Alert Note */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: "#f7f9fd",
                  borderRadius: '12px',
                  border: '1px solid #bfdbfe',
                  color: '#1e40af',
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem'
                }}
              >
                <CheckCircle2 size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Bảo mật tuyệt đối:</strong> Mật khẩu ứng dụng chỉ cấp quyền gửi email tự động và hoàn toàn không để lộ mật khẩu chính của tài khoản Gmail. Bạn có thể thu hồi mật khẩu này bất kỳ lúc nào trên Google Security.
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                backgroundColor: '#ffffff',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem'
              }}
            >
              <button className="admin-button-primary"
                type="button"
                onClick={() => setShowGuideModal(false)}
                style={{
                  height: '38px',
                  padding: '0 1.25rem',
                  borderRadius: '10px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                }}
              >
                <span>Đã hiểu & Đóng</span>
              </button>
            </div>

          </div>
        </WorkspaceDialog>
      )}

    </div>
  )
}
