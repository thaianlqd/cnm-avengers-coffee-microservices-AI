import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function Launcher() {
  const mobileAppPath = 'avengers-coffee-system/apps/shipper-mobile'
  const browserHost = window.location.hostname || 'localhost'
  const defaultLanHost = browserHost !== 'localhost' && browserHost !== '127.0.0.1' ? browserHost : ''
  const [lanHost, setLanHost] = useState(defaultLanHost)
  const [showPhoneTools, setShowPhoneTools] = useState(false)
  const [previewMode, setPreviewMode] = useState('android')

  const effectiveHost = useMemo(() => {
    const cleaned = String(lanHost || '').trim()
    if (!cleaned) return browserHost
    return cleaned
  }, [lanHost, browserHost])

  const hostIsLocalOnly = effectiveHost === 'localhost' || effectiveHost === '127.0.0.1'
  const webShipperUrl = `http://${effectiveHost}:5175`
  const launcherUrl = `http://${effectiveHost}:5176`
  const isPhonePreview = previewMode !== 'web'
  const previewSpec = useMemo(() => {
    if (previewMode === 'ios') {
      return {
        label: 'iPhone 14 Pro style (390x844)',
        width: 390,
        height: 844,
      }
    }

    if (previewMode === 'web') {
      return {
        label: 'Desktop preview (full width)',
        width: null,
        height: 560,
      }
    }

    return {
      label: 'Android style (412x915)',
      width: 412,
      height: 915,
    }
  }, [previewMode])
  const shipperLogin = {
    username: 'shipper_demo',
    password: '123456',
  }
  const qrWebShipper = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(webShipperUrl)}`
  const qrLauncher = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(launcherUrl)}`
  const expoGuide = [
    '1. Mở thư mục shipper-mobile',
    '2. Chạy npm install',
    '3. Chạy npm run start',
    '4. Quét QR bằng điện thoại với Expo Go',
  ]

  return (
    <div className="page">
      <div className="card hero">
        <div className="brand">Avengers Delivery</div>
        <h1>Shipper Mobile Launcher</h1>
        <p>
          Ban co the demo ngay tren laptop, khong can dien thoai. Sau khi chay <code>docker-compose up -d</code>, bam nut duoi day de vao ban shipper web.
        </p>

        <div className="actions">
          <a className="primary" href={webShipperUrl} target="_blank" rel="noreferrer">
            Demo ngay tren laptop
          </a>
          <button className="ghost button-like" type="button" onClick={() => setShowPhoneTools((v) => !v)}>
            {showPhoneTools ? 'An cong cu dien thoai' : 'Mo cong cu dien thoai (QR)'}
          </button>
          <a className="ghost" href="#guide">
            Xem huong dan nhanh
          </a>
        </div>

        {showPhoneTools ? (
          <>
            <div className="host-form">
              <label htmlFor="lanHost">IP LAN cua may ban (de dien thoai truy cap duoc)</label>
              <input
                id="lanHost"
                value={lanHost}
                onChange={(e) => setLanHost(e.target.value)}
                placeholder="Vi du: 192.168.1.23"
              />
              <p className="host-hint">Neu de trong, launcher dung host hien tai: {browserHost}</p>
            </div>

            {hostIsLocalOnly ? (
              <p className="warning">
                QR dang dung localhost nen dien thoai se khong vao duoc. Hay nhap IP LAN cua may tinh (vi du 192.168.x.x) roi quet lai.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="grid" id="guide">
        <div className="card">
          <h2>Demo laptop nhanh</h2>
          <ol>
            <li>Mo trang launcher tai <strong>http://localhost:5176</strong>.</li>
            <li>Bam <strong>Demo ngay tren laptop</strong>.</li>
            <li>Dang nhap bang <strong>shipper_demo / 123456</strong>.</li>
            <li>Neu can dien thoai, mo nut <strong>Mo cong cu dien thoai (QR)</strong>.</li>
          </ol>
        </div>

        <div className="card">
          <h2>Đường dẫn</h2>
          <p><strong>Web launcher:</strong> {launcherUrl}</p>
          <p><strong>Web shipper:</strong> {webShipperUrl}</p>
          <p><strong>Host đang dùng cho QR:</strong> {effectiveHost}</p>
          <p><strong>Mobile source:</strong> {mobileAppPath}</p>
          <p><strong>Expo:</strong> mở từ terminal của thư mục mobile app</p>
        </div>

        <div className="card">
          <h2>Mobile source</h2>
          <ul>
            {expoGuide.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p><strong>Thu muc:</strong> {mobileAppPath}</p>
        </div>

        {showPhoneTools ? (
          <div className="card qr-card">
            <h2>QR mo app nhanh</h2>
            <p>Quet ma QR nay tren dien thoai de mo ban shipper chay bang Docker.</p>
            <img className="qr-image" src={qrWebShipper} alt="QR Web Shipper" />
            <a className="primary full" href={webShipperUrl} target="_blank" rel="noreferrer">
              Mo ngay {webShipperUrl}
            </a>
          </div>
        ) : (
          <div className="card demo-preview-card">
            <h2>Mobile demo tren laptop</h2>
            <p>Chuyen qua Android/iOS de quay demo theo giao dien mobile tren may tinh.</p>

            <div className="preview-switches" role="group" aria-label="Device preview mode">
              <button
                type="button"
                className={`switch-btn ${previewMode === 'android' ? 'active' : ''}`}
                onClick={() => setPreviewMode('android')}
              >
                Android
              </button>
              <button
                type="button"
                className={`switch-btn ${previewMode === 'ios' ? 'active' : ''}`}
                onClick={() => setPreviewMode('ios')}
              >
                iOS
              </button>
              <button
                type="button"
                className={`switch-btn ${previewMode === 'web' ? 'active' : ''}`}
                onClick={() => setPreviewMode('web')}
              >
                Full Web
              </button>
            </div>

            <p className="preview-hint">Dang xem: {previewSpec.label}</p>

            {isPhonePreview ? (
              <div className="phone-stage">
                <div className="phone-shell">
                  <div className="phone-notch" />
                  <iframe
                    title="Shipper mobile style preview"
                    src={webShipperUrl}
                    className="preview-frame in-phone"
                    loading="lazy"
                    style={{ width: `${previewSpec.width}px`, height: `${previewSpec.height}px` }}
                  />
                </div>
              </div>
            ) : (
              <iframe
                title="Shipper web preview"
                src={webShipperUrl}
                className="preview-frame"
                loading="lazy"
                style={{ minHeight: `${previewSpec.height}px` }}
              />
            )}
          </div>
        )}

        <div className="card qr-card">
          <h2>Tai khoan shipper test</h2>
          <p><strong>Username:</strong> {shipperLogin.username}</p>
          <p><strong>Password:</strong> {shipperLogin.password}</p>
          <p>Neu muon vao nhanh khong can backend, bam nut <strong>Dung Demo</strong> trong man login.</p>
          {showPhoneTools ? <img className="qr-image mini" src={qrLauncher} alt="QR Launcher" /> : null}
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Launcher />)
