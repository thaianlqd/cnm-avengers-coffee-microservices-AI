import { Component } from 'react'
import { Coffee, RefreshCw, TriangleAlert } from 'lucide-react'

export class WorkspaceErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('Workspace render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={this.props.inline ? 'console-recovery console-recovery-inline' : 'console-login console-recovery'}>
        <section className="console-card" role="alert">
          <span className="console-brand-icon"><Coffee size={24} /></span>
          <TriangleAlert size={30} className="console-recovery-icon" />
          <h1>Không thể hiển thị không gian làm việc</h1>
          <p>Giao diện gặp lỗi khi tải. Hãy tải lại để tiếp tục với phiên đăng nhập hiện tại.</p>
          <button className="console-button" onClick={() => window.location.reload()}>
            <RefreshCw size={18} /> Tải lại giao diện
          </button>
          {this.props.inline && <p>Bạn có thể chọn mục khác trong menu để tiếp tục làm việc.</p>}
        </section>
      </div>
    )
  }
}
