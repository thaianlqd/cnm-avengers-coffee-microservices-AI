export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()

export function filterSelectOptions(options, query) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  return options.filter(option => !option.disabled && terms.every(term => normalizeSearch(`${option.label} ${option.value} ${option.keywords || ''}`).includes(term)))
}
