function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBranchValue(value) {
  return String(value || '').trim();
}

function extractWardFromAddress(rawAddress) {
  const address = String(rawAddress || '').trim();
  if (!address) return '';

  const parts = address
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const part of parts) {
    const normalized = normalizeText(part);
    if (
      normalized.startsWith('phuong ') ||
      normalized.startsWith('xa ') ||
      normalized.startsWith('thi tran ') ||
      normalized.startsWith('thi xa ')
    ) {
      return part;
    }
  }

  return '';
}

export function buildAddressOptionsFromBranches(branches) {
  const options = {};

  for (const branch of branches || []) {
    const city = normalizeBranchValue(branch?.thanh_pho);
    const district = normalizeBranchValue(branch?.quan_huyen);
    const ward = extractWardFromAddress(branch?.dia_chi) || district;

    if (!city || !district || !ward) {
      continue;
    }

    if (!options[city]) {
      options[city] = {};
    }

    if (!options[city][district]) {
      options[city][district] = [];
    }

    if (!options[city][district].includes(ward)) {
      options[city][district].push(ward);
    }
  }

  Object.values(options).forEach((districts) => {
    Object.values(districts).forEach((wards) => {
      wards.sort((a, b) => a.localeCompare(b, 'vi'));
    });
  });

  return options;
}

export function getAddressSelectionDefaults(addressOptions) {
  const city = Object.keys(addressOptions || {})[0] || '';
  const district = city ? Object.keys(addressOptions[city] || {})[0] || '' : '';
  const ward = city && district ? (addressOptions[city]?.[district] || [])[0] || '' : '';

  return { city, district, ward };
}

export function normalizeAddressSelection(parsedAddress, addressOptions) {
  const parsed = parsedAddress || {};
  const fallback = getAddressSelectionDefaults(addressOptions);

  const city = parsed.city && addressOptions?.[parsed.city] ? parsed.city : fallback.city || parsed.city || '';
  const districts = Object.keys(addressOptions?.[city] || {});
  const district = districts.includes(parsed.district)
    ? parsed.district
    : districts[0] || parsed.district || fallback.district || '';
  const wards = addressOptions?.[city]?.[district] || [];
  const ward = wards.includes(parsed.ward) ? parsed.ward : wards[0] || parsed.ward || fallback.ward || '';

  return {
    city,
    district,
    ward,
    street: String(parsed.street || '').trim(),
  };
}
