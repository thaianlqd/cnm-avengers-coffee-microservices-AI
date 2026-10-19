import { useEffect, useRef } from 'react';

/** Shared report transport. Requests/downloads belong to this mounted account workspace. */
export function useReportActions() {
  const requests = useRef(new Map<string, AbortController>());
  useEffect(() => () => {
    requests.current.forEach(controller => controller.abort());
    requests.current.clear();
  }, []);
  const post = async <T,>(kind: string, path: string, payload: unknown,
    read: (response: Response, signal: AbortSignal) => Promise<T>, fallback: string,
    options: { method?: string; signal?: AbortSignal; replace?: boolean } = {}): Promise<T> => {
    if (options.replace) { requests.current.get(kind)?.abort(); requests.current.delete(kind); }
    if (requests.current.has(kind)) throw new Error('Thao tác báo cáo đang được xử lý.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    requests.current.set(kind, controller);
    try {
      const response = await fetch(path, { method: options.method || 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(typeof error.detail === 'string' ? error.detail : fallback);
      }
      const result = await read(response, controller.signal);
      if (controller.signal.aborted) throw new DOMException('Workspace changed', 'AbortError');
      return result;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (requests.current.get(kind) === controller) requests.current.delete(kind);
    }
  };
  const download = async (response: Response, signal: AbortSignal, title: string, filename?: string, current?: () => boolean) => {
    const blob = await response.blob();
    if (signal.aborted || current?.() === false) throw new DOMException('Report changed', 'AbortError');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    const safeTitle = title.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_').slice(0, 40);
    try {
      link.href = url; link.download = filename || `${safeTitle}.docx`;
      document.body.appendChild(link); link.click();
    } finally { link.remove(); URL.revokeObjectURL(url); }
  };
  return {
    openReport: (id: string, signal: AbortSignal) => post('open', `/api/reports/saved/${encodeURIComponent(id)}`, undefined,
      async response => response.json(), 'Chưa mở được báo cáo lưu trữ.', { method: 'GET', signal, replace: true }),
    deleteReport: (id: string) => post(`delete:${id}`, `/api/reports/saved/${encodeURIComponent(id)}`, undefined,
      async () => undefined, 'Không thể xóa báo cáo', { method: 'DELETE' }),
    downloadSavedDocx: (id: string, title: string) => post('saved-docx', `/api/reports/saved/${encodeURIComponent(id)}/download-docx`, undefined,
      (response, signal) => download(response, signal, title || 'Bao_Cao'), 'Không thể tải file Word từ kho lưu trữ', { method: 'GET' }),
    saveReport: (payload: unknown) => post('save', '/api/reports/saved', payload,
      async response => response.json(), 'Không thể lưu báo cáo'),
    exportDocx: (report: any, options: { saveToDb: boolean; filename?: string; current?: () => boolean }) =>
      post('docx', '/api/reports/export-docx', { report_data: report, save_to_db: options.saveToDb },
        (response, signal) => download(response, signal, String(report.title || 'Bao_Cao_Phan_Tich_AI'), options.filename, options.current), 'Không thể xuất tài liệu Word'),
  };
}
