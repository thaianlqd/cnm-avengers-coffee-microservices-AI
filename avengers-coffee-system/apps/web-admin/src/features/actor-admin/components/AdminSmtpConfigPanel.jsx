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
} from 'lucide-react'
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
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        boxSizing: 'border-box'
      }}
    >
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            backgroundColor: toast.type === 'success' ? '#ecfdf5' : toast.type === 'error' ? '#fef2f2' : '#eff6ff',
            color: toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#2563eb',
            border: `1px solid ${toast.type === 'success' ? '#a7f3d0' : toast.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
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
      {/* CARD 1: CẤU HÌNH MÁY CHỦ GỬI EMAIL (SMTP) - 1 CỘT FULL WIDTH             */}
      {/* ========================================================================= */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        {/* Card Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.1)'
              }}
            >
              <Server size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Cấu hình máy chủ gửi Email (SMTP)
              </h3>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Hệ thống tự động gửi hóa đơn & liên kết theo dõi đơn hàng cho khách hàng
              </span>
            </div>
          </div>

          {/* Action Buttons Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {/* Guide Button with 'i' */}
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              title="Xem hướng dẫn từng bước lấy Mật khẩu ứng dụng Gmail"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.5rem 0.95rem',
                borderRadius: '9999px',
                border: '1px solid #fed7aa',
                backgroundColor: '#fffbeb',
                color: '#b45309',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontWeight: '700',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef3c7'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fffbeb'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: '#d97706',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '800'
                }}
              >
                i
              </div>
              <span>Hướng dẫn lấy Mật khẩu Gmail</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={loadConfig}
              disabled={loading}
              title="Tải lại thông tin mới nhất từ máy chủ"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.95rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '0.8125rem',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff'
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
          
          {/* Quick Presets Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1.25rem',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#1e293b', fontWeight: '700' }}>
              <Zap size={16} color="#d97706" />
              <span>Mẫu thiết lập thông dụng:</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={applyGmailTlsPreset}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#94a3b8'
                  e.currentTarget.style.backgroundColor = '#f1f5f9'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1'
                  e.currentTarget.style.backgroundColor = '#ffffff'
                }}
              >
                <Globe size={14} color="#2563eb" />
                <span>Gmail (Cổng 587 - STARTTLS)</span>
              </button>

              <button
                type="button"
                onClick={applyGmailSslPreset}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#94a3b8'
                  e.currentTarget.style.backgroundColor = '#f1f5f9'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1'
                  e.currentTarget.style.backgroundColor = '#ffffff'
                }}
              >
                <ShieldCheck size={14} color="#059669" />
                <span>Gmail (Cổng 465 - SSL Trực tiếp)</span>
              </button>
            </div>
          </div>

          {/* Row 1: Host & Port */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Địa chỉ Máy chủ SMTP (Host) <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <Server size={17} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  required
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: '#0f172a'
                  }}
                  value={form.host}
                  onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
                  placeholder="ví dụ: smtp.gmail.com"
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Cổng kết nối (Port) <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <input
                  type="number"
                  required
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: '#0f172a',
                    fontWeight: '700'
                  }}
                  value={form.port}
                  onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))}
                  placeholder="587"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Encryption & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Chế độ mã hóa bảo mật
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <Shield size={17} color={form.secure ? '#059669' : '#2563eb'} style={{ flexShrink: 0 }} />
                <select
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.85rem',
                    color: '#0f172a',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                  value={form.secure ? 'SSL' : 'TLS'}
                  onChange={(e) => setForm((p) => ({ ...p, secure: e.target.value === 'SSL' }))}
                >
                  <option value="TLS">STARTTLS (Khuyên dùng cho Cổng 587)</option>
                  <option value="SSL">SSL / TLS Trực tiếp (Dành cho Cổng 465)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Trạng thái kích hoạt gửi Email
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <CheckCircle2 size={17} color={form.is_active ? '#059669' : '#94a3b8'} style={{ flexShrink: 0 }} />
                <select
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.85rem',
                    color: form.is_active ? '#059669' : '#64748b',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                  value={form.is_active ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === 'ACTIVE' }))}
                >
                  <option value="ACTIVE">Đang kích hoạt (Tự động gửi thư khi có đơn hàng)</option>
                  <option value="INACTIVE">Tạm dừng gửi thư</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Auth User & Auth Password */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Tài khoản đăng nhập SMTP (Email / Username) <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <User size={17} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  required
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: '#0f172a'
                  }}
                  value={form.auth_user}
                  onChange={(e) => setForm((p) => ({ ...p, auth_user: e.target.value }))}
                  placeholder="ví dụ: avengerscoffee.official@gmail.com"
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                    Mật khẩu ứng dụng (App Password)
                  </label>
                  
                  {/* Inline Info Trigger Icon (i) */}
                  <button
                    type="button"
                    onClick={() => setShowGuideModal(true)}
                    title="Bấm vào để xem hướng dẫn lấy Mật khẩu ứng dụng 16 ký tự"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      color: '#d97706',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <div
                      style={{
                        width: '17px',
                        height: '17px',
                        borderRadius: '50%',
                        backgroundColor: '#fef3c7',
                        border: '1px solid #fde68a',
                        color: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.725rem',
                        fontWeight: '800'
                      }}
                    >
                      i
                    </div>
                  </button>
                </div>

                {form.has_auth_pass && !form.auth_pass && (
                  <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Check size={13} /> Đã có mật khẩu trong hệ thống
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <Lock size={17} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: '#0f172a'
                  }}
                  value={form.auth_pass}
                  onChange={(e) => setForm((p) => ({ ...p, auth_pass: e.target.value }))}
                  placeholder={form.has_auth_pass ? '•••••••• (để trống nếu không muốn thay đổi)' : 'Nhập mã 16 ký tự mật khẩu ứng dụng Google'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' }}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Row 4: From Name & From Email */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Tên hiển thị người gửi
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <input
                  type="text"
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: '#0f172a'
                  }}
                  value={form.from_name}
                  onChange={(e) => setForm((p) => ({ ...p, from_name: e.target.value }))}
                  placeholder="Avengers Coffee"
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ color: '#334155', fontWeight: '700', fontSize: '0.825rem' }}>
                Địa chỉ Email người gửi
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  padding: '0 0.95rem',
                  gap: '0.75rem'
                }}
              >
                <Mail size={17} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="email"
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: '#0f172a'
                  }}
                  value={form.from_email}
                  onChange={(e) => setForm((p) => ({ ...p, from_email: e.target.value }))}
                  placeholder="support@avengers.coffee"
                />
              </div>
            </div>
          </div>

          {/* Save Action Button Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn-save-green"
              disabled={saving}
              style={{
                height: '44px',
                padding: '0 2rem',
                fontSize: '0.9rem',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderRadius: '10px',
                whiteSpace: 'nowrap'
              }}
            >
              <CheckCircle2 size={18} color="#ffffff" />
              <span>{saving ? 'Đang lưu cấu hình...' : 'Lưu Cấu Hình Máy Chủ SMTP'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* ========================================================================= */}
      {/* CARD 2: KIỂM TRA KẾT NỐI & GỬI THƯ THỬ NGHIỆM - 1 CỘT FULL WIDTH        */}
      {/* ========================================================================= */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        {/* Card Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.1)'
              }}
            >
              <Send size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Kiểm tra gửi thư điện tử (Test Email)
              </h3>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Xác minh kết nối máy chủ SMTP thực tế trước khi khách hàng đặt hàng
              </span>
            </div>
          </div>
        </div>

        {/* Card Content */}
        <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
            Nhập địa chỉ email hòm thư cá nhân của bạn để hệ thống gửi thử một lá thư kiểm tra kết nối ngay lập tức.
          </p>

          {/* Test Email Input & Button Bar */}
          <form
            onSubmit={handleSendTest}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap'
            }}
          >
            <div
              style={{
                flex: '1 1 320px',
                display: 'flex',
                alignItems: 'center',
                height: '44px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                padding: '0 0.95rem',
                gap: '0.75rem',
                boxSizing: 'border-box'
              }}
            >
              <Mail size={17} color="#64748b" style={{ flexShrink: 0 }} />
              <input
                type="email"
                required
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Nhập email người nhận thư thử nghiệm (ví dụ: customer@gmail.com)..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '0.875rem',
                  color: '#0f172a'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={testing}
              style={{
                height: '44px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: testing ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0 1.75rem',
                transition: 'all 0.15s ease',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (!testing) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={(e) => {
                if (!testing) {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                  e.currentTarget.style.transform = 'translateY(0)'
                }
              }}
            >
              <Send size={16} className={testing ? 'animate-bounce' : ''} />
              <span>{testing ? 'Đang kết nối & gửi thư...' : 'Gửi Thư Kiểm Tra Ngay'}</span>
            </button>
          </form>

          {/* Test Result Box */}
          {testResult && (
            <div
              style={{
                padding: '1rem 1.25rem',
                borderRadius: '12px',
                backgroundColor: testResult.success ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${testResult.success ? '#a7f3d0' : '#fecaca'}`,
                color: testResult.success ? '#065f46' : '#991b1b',
                fontSize: '0.85rem',
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', marginBottom: '0.35rem' }}>
                {testResult.success ? <CheckCircle2 size={18} color="#059669" /> : <AlertCircle size={18} color="#dc2626" />}
                <span>{testResult.success ? 'Gửi thử nghiệm thành công!' : 'Gửi thử nghiệm thất bại!'}</span>
              </div>
              <p style={{ margin: 0 }}>{testResult.message}</p>
              {testResult.previewUrl && (
                <div style={{ marginTop: '0.65rem' }}>
                  <a
                    href={testResult.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: '#2563eb',
                      fontWeight: '700',
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

      {/* ========================================================================= */}
      {/* MODAL HƯỚNG DẪN CÁC BƯỚC TẠO MẬT KHẨU ỨNG DỤNG GMAIL (POPUP DIALOG)      */}
      {/* ========================================================================= */}
      {showGuideModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.25rem',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setShowGuideModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              maxWidth: '620px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#fef3c7',
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
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                    Hướng dẫn tạo Mật khẩu ứng dụng Gmail
                  </h3>
                  <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>
                    Các bước để hệ thống Avengers Coffee tự động gửi email xác nhận
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f1f5f9'
                  e.currentTarget.style.color = '#0f172a'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff'
                  e.currentTarget.style.color = '#64748b'
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  1
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                    Bật Xác minh 2 bước (2-Step Verification)
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                    Đăng nhập tài khoản Google của bạn và kích hoạt tính năng Xác minh 2 bước trong mục <strong>Bảo mật (Security)</strong>.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  2
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                    Truy cập trang Mật khẩu ứng dụng
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
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
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px',
                        fontSize: '0.78125rem',
                        fontWeight: '700',
                        textDecoration: 'none'
                      }}
                    >
                      <span>Mở trang Mật khẩu ứng dụng Google</span>
                      <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.65rem',
                        backgroundColor: '#ffffff',
                        color: copiedLink ? '#059669' : '#64748b',
                        border: `1px solid ${copiedLink ? '#a7f3d0' : '#cbd5e1'}`,
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  3
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                    Đặt tên ứng dụng và bấm Tạo
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                    Nhập tên nhận diện (ví dụ: <code style={{ backgroundColor: '#e2e8f0', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: '700' }}>Avengers Coffee</code>) rồi bấm nút <strong>Tạo (Create)</strong>.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  4
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                    Sao chép mã 16 ký tự và dán vào hệ thống
                  </div>
                  <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                    Google sẽ cấp một chuỗi mật khẩu gồm 16 ký tự màu vàng nhạt (ví dụ: <code style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '700' }}>abcd efgh ijkl mnop</code>).
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                    Dán mã 16 ký tự này vào ô <strong>Mật khẩu ứng dụng (App Password)</strong> và bấm <strong>Lưu Cấu Hình</strong>.
                  </p>
                </div>
              </div>

              {/* Security Alert Note */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: '#ecfdf5',
                  borderRadius: '12px',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem'
                }}
              >
                <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Bảo mật tuyệt đối:</strong> Mật khẩu ứng dụng chỉ cấp quyền gửi email tự động và hoàn toàn không để lộ mật khẩu chính của tài khoản Gmail. Bạn có thể thu hồi mật khẩu này bất kỳ lúc nào trên Google Security.
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem'
              }}
            >
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                style={{
                  height: '38px',
                  padding: '0 1.25rem',
                  borderRadius: '10px',
                  backgroundColor: '#2563eb',
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
        </div>
      )}

    </div>
  )
}
