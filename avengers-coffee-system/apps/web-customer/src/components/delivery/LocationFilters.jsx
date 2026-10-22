import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon } from '../common/icons';
import { branchFilterOptions, normalizeLocationText } from '../../lib/locationModel';
import { useLocationText } from '../../lib/locationText';

function SearchableLocationSelect({ label, options, value, onChange, placeholder, disabled = false }) {
  const t = useLocationText(), id = useId(), wrapper = useRef(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  useEffect(() => {
    const close = event => { if (!wrapper.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const filtered = options.filter(option => normalizeLocationText(option).includes(normalizeLocationText(search)));
  return <div ref={wrapper} className="relative min-w-0 flex-1" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <label id={`${id}-label`} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    <button type="button" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open && !disabled}
      disabled={disabled} onClick={() => { setOpen(!open); setSearch(''); }}
      className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-xs disabled:bg-gray-50 disabled:text-gray-400">
      <span id={`${id}-value`} className="truncate">{value || placeholder}</span><ChevronDownIcon className="h-4 w-4 shrink-0" />
    </button>
    {open && !disabled && <div className="absolute left-0 right-0 top-full z-[11000] mt-1 min-w-48 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
      <input autoFocus aria-label={`${t('search')} ${label}`} value={search} onChange={event => setSearch(event.target.value)}
        className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs" placeholder={t('search')} />
      <div role="listbox" aria-labelledby={`${id}-label`} className="max-h-52 overflow-y-auto">
        {['', ...filtered].map(option => <button key={option} role="option" aria-selected={value === option} type="button"
          onClick={() => { onChange(option); setOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-50 ${value === option ? 'font-semibold text-[#b22830]' : ''}`}>
          {option || placeholder}
        </button>)}
        {!filtered.length && <p className="px-3 py-2 text-xs text-gray-500">{t('noOptions')}</p>}
      </div>
    </div>}
  </div>;
}

export default function LocationFilters({ branches, city, ward, area, onChange }) {
  const t = useLocationText();
  const { cities, wards, areas } = branchFilterOptions(branches, city);
  const wardOptions = (wards && wards.length > 0) ? wards : areas;
  const currentWard = ward || area || '';

  return <div className="flex w-full min-w-0 gap-3">
    <SearchableLocationSelect label={t('city')} options={cities} value={city}
      placeholder={t('allCities')} onChange={nextCity => onChange({ city: nextCity, ward: '', area: '' })} />
    <SearchableLocationSelect key={city} label="Phường / Xã" options={wardOptions} value={currentWard} disabled={!city}
      placeholder={city ? 'Tất cả phường / xã' : 'Chọn tỉnh / TP trước'} onChange={nextWard => onChange({ city, ward: nextWard, area: nextWard })} />
  </div>;
}
