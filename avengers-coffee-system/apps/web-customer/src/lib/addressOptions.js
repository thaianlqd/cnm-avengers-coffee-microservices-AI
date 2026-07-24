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

function cleanGeoName(str) {
  return normalizeText(str)
    .replace(/\b(thanh pho|tp|quan|huyen|phuong|xa|thi tran|thi xa)\b/g, '')
    .trim();
}

export function normalizeAddressSelection(parsedAddress, addressOptions) {
  const parsed = parsedAddress || {};
  const fallback = getAddressSelectionDefaults(addressOptions);

  const cityKeys = Object.keys(addressOptions || {});
  let city = cityKeys.find(
    (c) => c === parsed.city || (parsed.city && (cleanGeoName(c) === cleanGeoName(parsed.city) || cleanGeoName(c).includes(cleanGeoName(parsed.city)) || cleanGeoName(parsed.city).includes(cleanGeoName(c))))
  );
  if (!city) city = fallback.city || parsed.city || '';

  const districtMap = addressOptions?.[city] || {};
  const districtKeys = Object.keys(districtMap);
  let district = districtKeys.find(
    (d) => d === parsed.district || (parsed.district && (cleanGeoName(d) === cleanGeoName(parsed.district) || cleanGeoName(d).includes(cleanGeoName(parsed.district)) || cleanGeoName(parsed.district).includes(cleanGeoName(d))))
  );
  if (!district) district = districtKeys[0] || parsed.district || fallback.district || '';

  const wardKeys = districtMap[district] || [];
  let ward = wardKeys.find(
    (w) => w === parsed.ward || (parsed.ward && (cleanGeoName(w) === cleanGeoName(parsed.ward) || cleanGeoName(w).includes(cleanGeoName(parsed.ward)) || cleanGeoName(parsed.ward).includes(cleanGeoName(w))))
  );
  if (!ward) ward = wardKeys[0] || parsed.ward || fallback.ward || '';

  return {
    city,
    district,
    ward,
    street: String(parsed.street || '').trim(),
  };
}
