import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Card } from '../../../components/ui/card'
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
    <div className="smtp-workspace admin-mail-workbench">
      {toast && <div className="workspace-form-error" role="status">{toast.message}</div>}
      <div className="smtp-heading">
        <div><p>Cấu hình người gửi, bảo mật kết nối và gửi thư kiểm tra.</p></div>
        <Button type="button" className="ui-button ui-button-secondary" onClick={loadConfig} disabled={loading}><RefreshCw size={16} />{loading ? 'Đang tải…' : 'Tải lại cấu hình'}</Button>
      </div>
      <form onSubmit={handleSave}>
        <div className="smtp-columns">
          <section className="smtp-section">
            <h3><Server size={18} />Kết nối SMTP</h3>
            <p>Thiết lập địa chỉ máy chủ và phương thức mã hóa.</p>
            <div className="smtp-presets">
              <Button type="button" className="ui-button ui-button-secondary" onClick={applyGmailTlsPreset}>Gmail · STARTTLS 587</Button>
              <Button type="button" className="ui-button ui-button-secondary" onClick={applyGmailSslPreset}>Gmail · SSL 465</Button>
            </div>
            <div className="smtp-fields">
              <Label className="smtp-wide" htmlFor="smtp-host">Máy chủ SMTP<Input className="ui-input" id="smtp-host" value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="smtp.gmail.com" required /></Label>
              <Label htmlFor="smtp-port">Cổng kết nối<Input className="ui-input" id="smtp-port" type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: e.target.value }))} min="1" max="65535" required /></Label>
              <Label htmlFor="smtp-secure">Bảo mật<SearchableSelect id="smtp-secure" value={String(form.secure)} onChange={e => setForm(p => ({ ...p, secure: e.target.value === 'true' }))}><option value="false">STARTTLS</option><option value="true">SSL / TLS trực tiếp</option></SearchableSelect></Label>
            </div>
            <hr className="smtp-divider" />
            <h3><Key size={18} />Xác thực &amp; người gửi</h3>
            <p>Email sẽ hiển thị thông tin người gửi bên dưới.</p>
            <div className="smtp-fields">
              <Label className="smtp-wide" htmlFor="smtp-user">Tài khoản xác thực<Input className="ui-input" id="smtp-user" autoComplete="username" value={form.auth_user} onChange={e => setForm(p => ({ ...p, auth_user: e.target.value }))} placeholder="admin@avengers.coffee" /></Label>
              <Label className="smtp-wide" htmlFor="smtp-password">Mật khẩu ứng dụng
                <div className="admin-password-field" style={{ position: 'relative' }}>
                  <Input className="ui-input" id="smtp-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.auth_pass} onChange={e => setForm(p => ({ ...p, auth_pass: e.target.value }))} placeholder={form.has_auth_pass ? 'Đã lưu mật khẩu · để trống để giữ nguyên' : 'Nhập mật khẩu ứng dụng'} />
                  <Button type="button" className="admin-password-toggle" style={{ position: 'absolute', right: 8, border: 0, background: 'transparent' }} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</Button>
                </div>
              </Label>
              <Label htmlFor="smtp-from-name">Tên người gửi<Input className="ui-input" id="smtp-from-name" value={form.from_name} onChange={e => setForm(p => ({ ...p, from_name: e.target.value }))} /></Label>
              <Label htmlFor="smtp-from-email">Email người gửi<Input className="ui-input" id="smtp-from-email" type="email" value={form.from_email} onChange={e => setForm(p => ({ ...p, from_email: e.target.value }))} placeholder="support@avengers.coffee" /></Label>
              <Label className="smtp-wide" htmlFor="smtp-active">Trạng thái gửi thư<SearchableSelect id="smtp-active" value={String(form.is_active)} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'true' }))}><option value="true">Đang bật</option><option value="false">Tạm dừng</option></SearchableSelect></Label>
            </div>
          </section>
          <aside className="smtp-section smtp-test">
            <h3><Send size={18} />Kiểm tra kết nối</h3>
            <p>Gửi một email bằng cấu hình hiện tại để kiểm tra kết nối trước khi lưu.</p>
            <Label htmlFor="smtp-test-email">Email nhận thư kiểm tra<Input className="ui-input" id="smtp-test-email" type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSendTest(e) } }} placeholder="your-email@example.com" /></Label>
            <Button type="button" className="ui-button ui-button-primary" onClick={handleSendTest} disabled={testing || loading}><Send size={16} />{testing ? 'Đang gửi…' : 'Test kết nối'}</Button>
            {testResult && <div className="smtp-result" role="status"><strong>{testResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{testResult.success ? 'Kết nối thành công' : 'Chưa kết nối được'}</strong><p>{testResult.message}</p>{testResult.previewUrl && <a href={testResult.previewUrl} target="_blank" rel="noreferrer">Xem email thử nghiệm <ExternalLink size={14} /></a>}</div>}
            <hr className="smtp-divider" />
            <h3><ShieldCheck size={18} />Dùng Gmail?</h3>
            <p>Sử dụng mật khẩu ứng dụng thay cho mật khẩu đăng nhập tài khoản.</p>
            <Button type="button" className="ui-button ui-button-secondary" onClick={() => setShowGuideModal(true)}>Hướng dẫn tạo mật khẩu <ExternalLink size={15} /></Button>
          </aside>
        </div>
        <footer className="smtp-footer">
          <small>{form.updated_at ? 'Lần lưu gần nhất: ' + new Date(form.updated_at).toLocaleString('vi-VN') : 'Cấu hình chưa có thời gian cập nhật.'}</small>
          <Button type="submit" className="ui-button ui-button-primary" data-intent="success" disabled={saving || loading}><Check size={17} />{saving ? 'Đang lưu…' : 'Lưu cấu hình SMTP'}</Button>
        </footer>
      </form>

      {showGuideModal && (
        <WorkspaceDialog label="Hướng dẫn tạo mật khẩu ứng dụng Gmail" onClose={() => setShowGuideModal(false)}>
          <Card className="admin-surface"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: "10px",
              maxWidth: '620px',
              width: '100%',
              boxShadow: "none",
              border: '1px solid var(--border-light)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div data-modal-body="true" className="admin-card-header"
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
                    boxShadow: "none"
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

              <Button data-intent="danger" className="admin-icon-button" aria-label="Đóng cửa sổ"
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
              </Button>
            </div>

            {/* Modal Body: Step by Step */}
            <div data-modal-body="true"
              style={{
                padding: '1.5rem',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              {/* Step 1 */}
              <Card className="admin-surface"
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
                  <div style={{ fontWeight: "600", fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Bật Xác minh 2 bước (2-Step Verification)
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Đăng nhập tài khoản Google của bạn và kích hoạt tính năng Xác minh 2 bước trong mục <strong>Bảo mật (Security)</strong>.
                  </p>
                </div>
              </Card>

              {/* Step 2 */}
              <Card className="admin-surface"
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
                  <div style={{ fontWeight: "600", fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
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
                        fontWeight: "600",
                        textDecoration: 'none'
                      }}
                    >
                      <span>Mở trang Mật khẩu ứng dụng Google</span>
                      <ExternalLink size={13} />
                    </a>
                    <Button className="admin-button-secondary"
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
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Step 3 */}
              <Card className="admin-surface"
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
                  <div style={{ fontWeight: "600", fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Đặt tên ứng dụng và bấm Tạo
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Nhập tên nhận diện (ví dụ: <code style={{ backgroundColor: "#f7f9fd", padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: "600" }}>Avengers Coffee</code>) rồi bấm nút <strong>Tạo (Create)</strong>.
                  </p>
                </div>
              </Card>

              {/* Step 4 */}
              <Card className="admin-surface"
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
                  <div style={{ fontWeight: "600", fontSize: '0.875rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                    Sao chép mã 16 ký tự và dán vào hệ thống
                  </div>
                  <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Google sẽ cấp một chuỗi mật khẩu gồm 16 ký tự màu vàng nhạt (ví dụ: <code style={{ backgroundColor: "#f7f9fd", color: '#b45309', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: "600" }}>abcd efgh ijkl mnop</code>).
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#60718a', lineHeight: 1.5 }}>
                    Dán mã 16 ký tự này vào ô <strong>Mật khẩu ứng dụng (App Password)</strong> và bấm <strong>Lưu Cấu Hình</strong>.
                  </p>
                </div>
              </Card>

              {/* Security Alert Note */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: "#f7f9fd",
                  borderRadius: '12px',
                  border: "1px solid var(--border-light)",
                  color: "var(--primary-hover)",
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
            <div data-modal-body="true"
              style={{
                padding: '1rem 1.5rem',
                backgroundColor: '#ffffff',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem'
              }}
            >
              <Button data-intent="danger" className="admin-button-primary"
                type="button"
                onClick={() => setShowGuideModal(false)}
                style={{
                  height: '38px',
                  padding: '0 1.25rem',
                  borderRadius: '10px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: "600",
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: "none"
                }}
              >
                <span>Đã hiểu & Đóng</span>
              </Button>
            </div>

          </Card>
        </WorkspaceDialog>
      )}

    </div>
  )
}
