import SearchableSelect from './SearchableSelect'

// Retain the value-only callback used by existing SmartSelect consumers.
export default function SmartSelect({ onChange, label, ...props }) {
  return <SearchableSelect {...props} aria-label={label || props['aria-label']} onChange={event => onChange?.(event.target.value)} />
}
