import { useState } from 'react';

export function useReviewPagination(items, identity, pageSize = 5) {
  const [selection, setSelection] = useState({ identity, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.identity === identity ? Math.min(selection.page, pages) : 1;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pages, total: items.length,
    pageSize, onChange: next => setSelection({ identity, page: Math.max(1, Math.min(next, pages)) }) };
}
