import { uiText as ui, useUiLanguage } from "../../lib/uiText";
export default function ReviewPagination({ page, pages, total, pageSize, onChange }) {
  useUiLanguage();
  if (!total) return null;
  return <nav aria-label={ui("Phân trang đánh giá")} className="review-pagination">
    <span aria-live="polite">{ui("Hiển thị ")}{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}{ui(" đánh giá")}</span>
    {pages > 1 && <div><button type="button" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label={ui("Trang đánh giá trước")}>←</button>
      <span>{ui("Trang ")}{page} / {pages}</span>
      <button type="button" disabled={page === pages} onClick={() => onChange(page + 1)} aria-label={ui("Trang đánh giá sau")}>→</button></div>}
  </nav>;
}
