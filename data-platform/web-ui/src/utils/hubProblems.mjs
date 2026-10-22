/** Hub problem helpers: pure, testable without a browser. */

/** Prefilled form from the server suggestion; the suggested group must be a real option. */
export function hubPublishDraft(suggestion) {
  const categories = suggestion?.categories || [];
  const suggested = suggestion?.suggested_category || '';
  const known = categories.includes(suggested);
  return {
    title: suggestion?.suggested_title || '',
    category: known ? suggested : '__new',
    newCategory: known ? '' : suggested,
    description: suggestion?.suggested_description || '',
  };
}

/** A saved report can become a hub problem only when it carries verified meaning. */
export function canPublishToHub(report) {
  return Boolean(report && report.category !== 'hub_problem' && report.module_config?.semantic_intent?.requirements?.length);
}

export function isHubProblem(report) {
  return report?.category === 'hub_problem';
}
