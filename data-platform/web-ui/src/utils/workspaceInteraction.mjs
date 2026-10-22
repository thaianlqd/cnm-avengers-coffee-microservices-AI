/** Semantic selections only. No SQL, arithmetic or provider route in this boundary. */
export function workspaceRevisionInput(report, filters, drillPath, depth, refresh = false) {
  const c = report.interaction_contract;
  if (!c || c.session_id !== report.session_id || c.revision !== report.revision) throw new Error('Báo cáo chưa có hợp đồng tương tác.');
  return { session_id: c.session_id, revision: c.revision, catalog_fingerprint: c.catalog_fingerprint,
    access_fingerprint: c.access_fingerprint, filters, drill_path: drillPath, analysis_depth: depth, refresh };
}

export function queueWorkspaceFilter(filters, selection) {
  return [...filters.filter(f => f.dimension_id !== selection.dimension_id), selection];
}

/** Superseded HTTP may complete despite abort; only the newest ticket publishes. */
export function workspaceRevisionController() {
  let epoch = 0, active;
  return {
    invalidate() { epoch++; active?.controller.abort(); active = undefined; },
    async apply(input, send, publish) {
      const key = JSON.stringify(input);
      if (active?.key === key) return active.promise;
      active?.controller.abort();
      const ticket = ++epoch, controller = new AbortController();
      const record = { key, controller };
      active = record;
      record.promise = (async () => {
        try {
          const report = await send(input, controller.signal);
          if (ticket !== epoch || controller.signal.aborted) return false;
          if (report.status !== 'success' || report.session_id !== input.session_id || report.revision !== input.revision + 1
              || report.interaction_contract?.revision !== report.revision
              || report.interaction_contract?.session_id !== report.session_id
              || report.interaction_contract?.catalog_fingerprint !== input.catalog_fingerprint
              || report.interaction_contract?.access_fingerprint !== input.access_fingerprint) throw new Error('Kết quả chưa có revision nhất quán.');
          publish(report); return true;
        } catch (error) {
          if (ticket !== epoch || controller.signal.aborted) return false;
          throw error;
        } finally { if (ticket === epoch) active = undefined; }
      })();
      return record.promise;
    },
  };
}
