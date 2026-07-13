/**
 * Navigate tới một tab trong App bằng custom event
 * Dùng ở các trang con (Login, LienHe, ChinhSach...) thay vì <a href>
 */
export function navigateTab(tab) {
  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
