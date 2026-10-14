import { Component } from 'react';
export default class PageErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[customer-page]', error); }
  componentDidUpdate(previous) {
    if (previous.pageKey !== this.props.pageKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <div className="page-loading" role="alert"><div><p>{this.props.message}</p><button type="button" className="mt-4 text-[#b22830] underline cursor-pointer" onClick={() => window.location.reload()}>{this.props.retry}</button></div></div>;
    return this.props.children;
  }
}
