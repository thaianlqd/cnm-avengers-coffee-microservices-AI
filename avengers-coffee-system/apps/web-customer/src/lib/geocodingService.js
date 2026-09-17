/**
 * Geocoding & Distance Calculation Service
 * Supports real-time address suggestion, geocoding, reverse-geocoding, and distance calculation.
 */

// Bán kính phục vụ giao hàng mặc định (km)
export const MAX_DELIVERY_RADIUS_KM = 5.0;

// Toạ độ mặc định các Quận/Huyện/Thành phố lớn tại Việt Nam (Fallback khi mất kết nối Geocoding)
// Toạ độ chuẩn các Quận/Huyện/Thành phố tại Việt Nam (Dùng phân giải vị trí theo phân cấp hành chính)
export const DISTRICT_COORDINATES = {
  // TP. Hồ Chí Minh (24 quận huyện)
  'quận 12': { lat: 10.8671, lng: 106.6413, city: 'Hồ Chí Minh' },
  'quận 11': { lat: 10.7628, lng: 106.6455, city: 'Hồ Chí Minh' },
  'quận 10': { lat: 10.7743, lng: 106.6675, city: 'Hồ Chí Minh' },
  'quận 9': { lat: 10.8277, lng: 106.8123, city: 'Hồ Chí Minh' },
  'quận 8': { lat: 10.7249, lng: 106.6346, city: 'Hồ Chí Minh' },
  'quận 7': { lat: 10.7340, lng: 106.7216, city: 'Hồ Chí Minh' },
  'quận 6': { lat: 10.7481, lng: 106.6353, city: 'Hồ Chí Minh' },
  'quận 5': { lat: 10.7540, lng: 106.6631, city: 'Hồ Chí Minh' },
  'quận 4': { lat: 10.7588, lng: 106.7012, city: 'Hồ Chí Minh' },
  'quận 3': { lat: 10.7834, lng: 106.6802, city: 'Hồ Chí Minh' },
  'quận 2': { lat: 10.7876, lng: 106.7416, city: 'Hồ Chí Minh' },
  'quận 1': { lat: 10.7756, lng: 106.7019, city: 'Hồ Chí Minh' },
  'gò vấp': { lat: 10.8387, lng: 106.6661, city: 'Hồ Chí Minh' },
  'bình thạnh': { lat: 10.8106, lng: 106.7093, city: 'Hồ Chí Minh' },
  'tân bình': { lat: 10.8015, lng: 106.6526, city: 'Hồ Chí Minh' },
  'tân phú': { lat: 10.7901, lng: 106.6262, city: 'Hồ Chí Minh' },
  'phú nhuận': { lat: 10.7991, lng: 106.6781, city: 'Hồ Chí Minh' },
  'bình tân': { lat: 10.7653, lng: 106.6083, city: 'Hồ Chí Minh' },
  'thủ đức': { lat: 10.8494, lng: 106.7537, city: 'Hồ Chí Minh' },
  'hóc môn': { lat: 10.8841, lng: 106.5912, city: 'Hồ Chí Minh' },
  'bình chánh': { lat: 10.6874, lng: 106.5938, city: 'Hồ Chí Minh' },
  'nhà bè': { lat: 10.6952, lng: 106.7323, city: 'Hồ Chí Minh' },
  'củ chi': { lat: 10.9731, lng: 106.4939, city: 'Hồ Chí Minh' },
  'cần giờ': { lat: 10.4114, lng: 106.9547, city: 'Hồ Chí Minh' },

  // Hà Nội
  'ba đình': { lat: 21.0341, lng: 105.8239, city: 'Hà Nội' },
  'hoàn kiếm': { lat: 21.0313, lng: 105.8526, city: 'Hà Nội' },
  'tây hồ': { lat: 21.0718, lng: 105.8228, city: 'Hà Nội' },
  'long biên': { lat: 21.0365, lng: 105.8929, city: 'Hà Nội' },
  'cầu giấy': { lat: 21.0313, lng: 105.7928, city: 'Hà Nội' },
  'đống đa': { lat: 21.0181, lng: 105.8275, city: 'Hà Nội' },
  'hai bà trưng': { lat: 21.0063, lng: 105.8524, city: 'Hà Nội' },
  'hoàng mai': { lat: 20.9764, lng: 105.8452, city: 'Hà Nội' },
  'thanh xuân': { lat: 20.9937, lng: 105.8118, city: 'Hà Nội' },
  'nam từ liêm': { lat: 21.0189, lng: 105.7621, city: 'Hà Nội' },
  'bắc từ liêm': { lat: 21.0664, lng: 105.7634, city: 'Hà Nội' },
  'hà đông': { lat: 20.9723, lng: 105.7765, city: 'Hà Nội' },

  // Đà Nẵng
  'hải châu': { lat: 16.0680, lng: 108.2208, city: 'Đà Nẵng' },
  'thanh khê': { lat: 16.0620, lng: 108.1873, city: 'Đà Nẵng' },
  'sơn trà': { lat: 16.0820, lng: 108.2433, city: 'Đà Nẵng' },
  'ngũ hành sơn': { lat: 16.0026, lng: 108.2562, city: 'Đà Nẵng' },
  'liên chiểu': { lat: 16.0963, lng: 108.1472, city: 'Đà Nẵng' },
  'cẩm lệ': { lat: 16.0177, lng: 108.1963, city: 'Đà Nẵng' },

  // Bình Dương
  'thủ dầu một': { lat: 10.9804, lng: 106.6519, city: 'Bình Dương' },
  'dĩ an': { lat: 10.9068, lng: 106.7718, city: 'Bình Dương' },
  'thuận an': { lat: 10.9168, lng: 106.6961, city: 'Bình Dương' },
};

export const KNOWN_VIETNAM_COORDINATES = {
  ...DISTRICT_COORDINATES,
  'hồ chí minh': { lat: 10.7769, lng: 106.7009, city: 'Hồ Chí Minh' },
  'hà nội': { lat: 21.0285, lng: 105.8542, city: 'Hà Nội' },
  'đà nẵng': { lat: 16.0544, lng: 108.2022, city: 'Đà Nẵng' },
  'bình dương': { lat: 10.9804, lng: 106.6519, city: 'Bình Dương' },
};

/**
 * Tính khoảng cách (km) giữa 2 toạ độ GPS bằng công thức Haversine
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) *
      Math.cos(numLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Làm tròn 1 chữ số thập phân (vd: 2.3 km)
}

/**
 * Phân tích địa chỉ từ kết quả Geocoding OpenStreetMap
 */
function parseNominatimAddress(item) {
  const addr = item.address || {};
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const displayName = item.display_name || '';
  const rawParts = displayName.split(',').map((p) => p.trim()).filter(Boolean);

  // 1. Tên địa điểm / số nhà / tên đường
  const streetNumber = addr.house_number || '';
  const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.highway || '';
  let street = [streetNumber, road].filter(Boolean).join(' ') || item.name || '';

  if (!street && rawParts.length > 0) {
    street = rawParts[0];
  }

  // 2. Phường / Xã / Thị trấn
  let ward =
    addr.quarter ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.residential ||
    addr.village ||
    addr.town ||
    addr.hamlet ||
    '';

  if (!ward) {
    for (const part of rawParts) {
      if (/^(Phường|Xã|Thị trấn|P\.|X\.)\s*/i.test(part)) {
        ward = part;
        break;
      }
    }
  }

  // 3. Quận / Huyện / Thị xã
  let district = addr.city_district || addr.district || addr.county || addr.borough || '';
  if (!district) {
    for (const part of rawParts) {
      if (/^(Quận|Huyện|Thị xã|TP\.|Thành phố)\s*/i.test(part) && !/Hồ Chí Minh|Hà Nội|Đà Nẵng|Cần Thơ|Hải Phòng/i.test(part)) {
        district = part;
        break;
      }
    }
  }

  // 4. Tỉnh / Thành phố
  let city =
    addr.city ||
    addr.state ||
    addr.province ||
    addr.region ||
    addr.municipality ||
    '';

  if (!city) {
    for (let i = rawParts.length - 1; i >= 0; i--) {
      const part = rawParts[i];
      if (/Hồ Chí Minh|Hà Nội|Đà Nẵng|Cần Thơ|Hải Phòng|Bình Dương|Đồng Nai|Khánh Hòa|Lâm Đồng|Quảng Nam|Huế/i.test(part)) {
        city = part;
        break;
      }
    }
  }

  // Chuẩn hóa Tỉnh/Thành phố
  city = city.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
  if (city.toLowerCase().includes('hồ chí minh') || city.toLowerCase().includes('hcm') || city.toLowerCase().includes('saigon')) {
    city = 'Hồ Chí Minh';
  } else if (city.toLowerCase().includes('hà nội')) {
    city = 'Hà Nội';
  } else if (city.toLowerCase().includes('đà nẵng')) {
    city = 'Đà Nẵng';
  }

  // Tiêu đề ngắn gọn
  let title = item.name || street || road || ward || 'Địa chỉ bản đồ';
  if (streetNumber && road && !title.includes(streetNumber)) {
    title = `${streetNumber} ${road}`;
  }

  // Phụ đề mô tả
  const subtitleParts = [ward, district, city].filter(Boolean);
  const subtitle = subtitleParts.join(', ') || displayName;

  return {
    id: item.place_id || `${lat}_${lng}`,
    title,
    subtitle,
    displayName,
    lat,
    lng,
    street: street || title,
    ward,
    district,
    city: city || 'Hồ Chí Minh',
  };
}

function normalizeCityName(cityName) {
  const c = String(cityName || '').trim();
  if (/ho chi minh|hcm|saigon|hồ chí minh/i.test(c)) return 'Hồ Chí Minh';
  if (/hanoi|hà nội/i.test(c)) return 'Hà Nội';
  if (/da nang|đà nẵng/i.test(c)) return 'Đà Nẵng';
  if (/binh duong|bình dương/i.test(c)) return 'Bình Dương';
  if (/dong nai|đồng nai/i.test(c)) return 'Đồng Nai';
  if (/can tho|cần thơ/i.test(c)) return 'Cần Thơ';
  if (/hai phong|hải phòng/i.test(c)) return 'Hải Phòng';
  return c.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim() || 'Hồ Chí Minh';
}

function normalizeWardName(wardName) {
  let w = String(wardName || '').trim();
  if (!w) return '';
  w = w.replace(/^(Phường|Xã|Thị trấn|P\.|X\.)\s*/i, '').trim();
  return `Phường ${w}`;
}

const VIETMAP_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VIETMAP_API_KEY) ||
  'dbdd3165b3cb0d85239a7f59f410a9fa925974c4a6d4c54b';

/**
 * Tìm kiếm gợi ý địa chỉ theo thời gian thực (Address Autocomplete Dropdown)
 * Sử dụng giải thuật phân tách địa chỉ và Forward Geocoding đa nguồn (Ưu tiên Vietmap API)
 */
export async function searchAddressSuggestions(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  // 1. Phân tách số nhà / hẻm và tên đường
  // VD: "251/33 Vườn Lài" -> houseNumber = "251/33", coreStreet = "Vườn Lài"
  const houseMatch = q.match(/^(?:Số\s+|Hẻm\s+)?(\d+[\d\/\-A-Za-z]*)\s+(.*)$/i);
  const houseNumber = houseMatch ? houseMatch[1] : '';
  const coreStreet = houseMatch ? houseMatch[2].trim() : q;

  const results = [];
  const seenKeys = new Set();

  function addResult(item) {
    if (!item || item.lat == null || item.lng == null) return;
    if (item.lat < 8.0 || item.lat > 24.0 || item.lng < 102.0 || item.lng > 110.0) return;

    // Khử trùng lặp theo toạ độ gần nhau (< 300m) hoặc cùng tên đường + phường + quận
    const roundLat = item.lat.toFixed(3);
    const roundLng = item.lng.toFixed(3);
    const textKey = `${item.title}_${item.ward}_${item.district || ''}_${item.city}`.toLowerCase().replace(/\s+/g, ' ');
    const geoKey = `${roundLat}_${roundLng}`;

    if (!seenKeys.has(textKey) && !seenKeys.has(geoKey)) {
      seenKeys.add(textKey);
      seenKeys.add(geoKey);
      results.push(item);
    }
  }

  // 1.5. ƯU TIÊN SỐ 1: Tìm kiếm qua Vietmap Search & Place API (Độ chính xác cao nhất cho địa chỉ Việt Nam)
  if (VIETMAP_API_KEY) {
    try {
      const vmSearchUrl = `https://maps.vietmap.vn/api/search/v3?apikey=${VIETMAP_API_KEY}&text=${encodeURIComponent(q)}`;
      const vmRes = await fetch(vmSearchUrl);
      if (vmRes.ok) {
        const vmData = await vmRes.json();
        if (Array.isArray(vmData) && vmData.length > 0) {
          const topItems = vmData.slice(0, 6);
          const placePromises = topItems.map(async (item) => {
            try {
              if (!item.ref_id) return null;
              const pRes = await fetch(
                `https://maps.vietmap.vn/api/place/v3?apikey=${VIETMAP_API_KEY}&refid=${encodeURIComponent(item.ref_id)}`
              );
              if (pRes.ok) {
                const pData = await pRes.json();
                if (pData?.lat != null && pData?.lng != null) {
                  const boundaries = Array.isArray(item.boundaries) ? item.boundaries : [];
                  const wardObj = boundaries.find((b) => b.type === 2 || /phường|xã|thị trấn/i.test(b.prefix || ''));
                  const districtObj = boundaries.find((b) => b.type === 1 || /quận|huyện|thị xã/i.test(b.prefix || ''));
                  const cityObj = boundaries.find((b) => b.type === 0 || /thành phố|tỉnh/i.test(b.prefix || ''));

                  const rawWard = wardObj?.full_name || wardObj?.name || '';
                  const ward = rawWard ? normalizeWardName(rawWard) : '';
                  const district = districtObj?.full_name || districtObj?.name || '';
                  const city = normalizeCityName(cityObj?.full_name || cityObj?.name || 'Hồ Chí Minh');
                  const title = item.name || q;
                  const subtitle = item.address || [ward, district, city].filter(Boolean).join(', ');

                  return {
                    id: `vm_${item.ref_id}`,
                    title,
                    subtitle,
                    displayName: item.display || `${title} ${subtitle}`,
                    lat: Number(pData.lat),
                    lng: Number(pData.lng),
                    street: title,
                    ward,
                    district,
                    city,
                  };
                }
              }
            } catch {}
            return null;
          });

          const resolvedPlaces = await Promise.all(placePromises);
          resolvedPlaces.filter(Boolean).forEach(addResult);

          if (results.length >= 3) {
            return results;
          }
        }
      }
    } catch (vmErr) {
      console.warn('[Vietmap Autocomplete Error]', vmErr);
    }
  }

  // 2. Tìm kiếm qua Photon API (Elasticsearch index OpenStreetMap - Dự phòng)
  const photonQueries = [];
  if (houseNumber && coreStreet) {
    photonQueries.push(coreStreet);
    if (!coreStreet.toLowerCase().startsWith('đường') && !coreStreet.toLowerCase().startsWith('phố')) {
      photonQueries.push(`Đường ${coreStreet}`);
    }
  } else {
    photonQueries.push(q);
  }

  const streetCandidates = [];
  const nonStreetCandidates = [];

  for (const pQuery of photonQueries) {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(pQuery)}&limit=12&lang=en`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.features)) {
          for (const f of data.features) {
            const props = f.properties || {};
            const coords = f.geometry?.coordinates || [];
            if (coords.length < 2) continue;
            const lng = coords[0];
            const lat = coords[1];

            // Chỉ lấy địa điểm thuộc Việt Nam
            if (props.countrycode !== 'VN' && !/Việt Nam|Vietnam/i.test(props.country || '')) continue;
            if (props.osm_value === 'nature_reserve' || props.osm_value === 'national_park') continue;

            const isHighway = props.osm_key === 'highway' || props.type === 'street';
            const rawName = props.name || props.street || coreStreet;

            // Nếu người dùng nhập số nhà/tên đường cụ thể mà địa điểm chỉ là suburb/district (khu dân cư, khu phố)
            // chứ không phải là một con đường (ví dụ: Khu phố Vườn Lài ở Quận 10),
            // thì KHÔNG gán số nhà và KHÔNG biến thành đường vì sẽ gây lệch toạ độ sai quận nghiêm trọng.
            if (!isHighway && houseNumber && (props.osm_value === 'suburb' || props.type === 'district')) {
              continue;
            }

            let roadFormatted = rawName;
            if (isHighway) {
              if (!roadFormatted.startsWith('Đường') && !roadFormatted.startsWith('Phố') && !roadFormatted.startsWith('Hẻm')) {
                roadFormatted = `Đường ${roadFormatted}`;
              }
            }

            let title = roadFormatted;
            if (houseNumber) {
              if (roadFormatted.startsWith('Hẻm')) {
                title = roadFormatted;
              } else if (isHighway) {
                title = `${houseNumber} ${roadFormatted}`;
              }
            }

            const rawWard = props.district || props.locality || props.suburb || '';
            const ward = rawWard ? normalizeWardName(rawWard) : '';
            const city = normalizeCityName(props.city || props.state || 'Hồ Chí Minh');

            const subtitleParts = [ward, city].filter(Boolean);
            const subtitle = subtitleParts.join(', ') || 'Việt Nam';

            const candidate = {
              id: `photon_${props.osm_id || Math.random()}`,
              title,
              subtitle,
              displayName: `${title}, ${subtitle}`,
              lat,
              lng,
              street: title,
              ward,
              district: props.district || '',
              city,
              isHighway,
            };

            if (isHighway) {
              streetCandidates.push(candidate);
            } else {
              nonStreetCandidates.push(candidate);
            }
          }
        }
      }
    } catch {}

    if (streetCandidates.length >= 6) break;
  }

  // Ưu tiên đưa các tuyến đường thực tế vào trước
  streetCandidates.forEach(addResult);

  // 3. Bổ sung từ OpenStreetMap Nominatim chuẩn tiếng Việt nếu cần
  if (results.length < 3) {
    const nomQueries = [];
    if (houseNumber && coreStreet) {
      nomQueries.push(`Đường ${coreStreet}, Vietnam`);
      nomQueries.push(`${coreStreet}, Vietnam`);
    } else {
      nomQueries.push(`${q}, Vietnam`);
    }

    for (const nQuery of nomQueries) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          nQuery
        )}&addressdetails=1&countrycodes=vn&limit=6&accept-language=vi`;
        const res = await fetch(url, {
          headers: {
            'Accept-Language': 'vi-VN,vi;q=0.9',
            'User-Agent': 'AvengersCoffeeCustomerApp/1.0',
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const item of data) {
              const addr = item.address || {};
              const lat = Number(item.lat);
              const lng = Number(item.lon);
              const rawParts = (item.display_name || '').split(',').map(s => s.trim()).filter(Boolean);

              const road = addr.road || addr.street || addr.pedestrian;
              // Nếu người dùng nhập số nhà mà Nominatim không có tên đường thực tế, bỏ qua
              if (houseNumber && !road) continue;

              const baseRoad = road || item.name || coreStreet;
              let rawWard = addr.quarter || addr.suburb || addr.neighbourhood || addr.village || addr.town || '';
              if (!rawWard) {
                for (const p of rawParts) {
                  if (/^(Phường|Xã|Thị trấn|P\.|X\.)/i.test(p)) { rawWard = p; break; }
                }
              }

              let district = addr.city_district || addr.district || addr.county || '';
              if (!district) {
                for (const p of rawParts) {
                  if (/^(Quận|Huyện|Thị xã|TP\.)/i.test(p)) { district = p; break; }
                }
              }

              const city = normalizeCityName(addr.city || addr.state || addr.province || 'Hồ Chí Minh');
              const ward = rawWard ? normalizeWardName(rawWard) : '';

              const roadDisplay = baseRoad.startsWith('Đường') || baseRoad.startsWith('Phố') || baseRoad.startsWith('Hẻm') ? baseRoad : `Đường ${baseRoad}`;
              let title = roadDisplay;
              if (houseNumber) {
                title = roadDisplay.startsWith('Hẻm') ? roadDisplay : `${houseNumber} ${roadDisplay}`;
              }

              const subtitleParts = [ward, district, city].filter(Boolean);
              const subtitle = subtitleParts.join(', ') || item.display_name;

              addResult({
                id: `nom_${item.place_id}`,
                title,
                subtitle,
                displayName: `${title}, ${subtitle}`,
                lat,
                lng,
                street: title,
                ward,
                district,
                city,
              });
            }
          }
        }
      } catch {}
      if (results.length >= 6) break;
    }
  }

  // Nếu vẫn chưa đủ kết quả, thêm non-street
  if (results.length < 3) {
    nonStreetCandidates.forEach(addResult);
  }

  // 4. Fallback từ điển địa phương
  if (results.length === 0) {
    const lowerQ = q.toLowerCase();
    const matchedEntries = Object.entries(KNOWN_VIETNAM_COORDINATES).filter(([key]) =>
      lowerQ.includes(key) || key.includes(lowerQ)
    );

    matchedEntries.slice(0, 4).forEach(([name, val]) => {
      addResult({
        id: `local_${name}`,
        title: name.charAt(0).toUpperCase() + name.slice(1),
        subtitle: `${val.city}, Việt Nam`,
        displayName: `${name}, ${val.city}`,
        lat: val.lat,
        lng: val.lng,
        street: q,
        ward: name.includes('phường') ? name : '',
        city: val.city,
      });
    });
  }

  return results;
}

/**
 * Reverse Geocoding: Tọa độ GPS -> Địa chỉ cụ thể (Ưu tiên Vietmap Reverse API)
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  // 1. Ưu tiên Vietmap Reverse Geocoding API
  if (VIETMAP_API_KEY) {
    try {
      const vmReverseUrl = `https://maps.vietmap.vn/api/reverse/v3?apikey=${VIETMAP_API_KEY}&lat=${lat}&lng=${lng}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(vmReverseUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const item = Array.isArray(data) ? data[0] : data;
        if (item && item.display) {
          const boundaries = Array.isArray(item.boundaries) ? item.boundaries : [];
          const wardObj = boundaries.find((b) => b.type === 2 || /phường|xã|thị trấn/i.test(b.prefix || ''));
          const districtObj = boundaries.find((b) => b.type === 1 || /quận|huyện|thị xã/i.test(b.prefix || ''));
          const cityObj = boundaries.find((b) => b.type === 0 || /thành phố|tỉnh/i.test(b.prefix || ''));

          const rawWard = wardObj?.full_name || wardObj?.name || '';
          const ward = rawWard ? normalizeWardName(rawWard) : '';
          const district = districtObj?.full_name || districtObj?.name || '';
          const city = normalizeCityName(cityObj?.full_name || cityObj?.name || 'Hồ Chí Minh');
          const title = item.name || 'Vị trí hiện tại';
          const subtitle = item.address || [ward, district, city].filter(Boolean).join(', ');

          return {
            lat: Number(lat),
            lng: Number(lng),
            title,
            subtitle,
            displayName: item.display || `${title}, ${subtitle}`,
            street: title,
            ward,
            district,
            city,
          };
        }
      }
    } catch (vmErr) {
      console.warn('[Vietmap Reverse Error]', vmErr);
    }
  }

  // 2. Dự phòng qua OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=vi`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'vi-VN,vi;q=0.9',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && (data.display_name || data.address)) {
        return parseNominatimAddress(data);
      }
    }
  } catch {}

  return {
    lat,
    lng,
    title: 'Vị trí hiện tại',
    subtitle: `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
    displayName: 'Vị trí hiện tại của bạn',
    street: '',
    ward: '',
    city: 'Hồ Chí Minh',
  };
}

/**
 * Geocode trực tiếp từ chuỗi địa chỉ thành toạ độ GPS
 */
export async function geocodeAddress(fullAddress) {
  const cleanAddr = String(fullAddress || '').trim();
  if (!cleanAddr) return null;

  try {
    const suggestions = await searchAddressSuggestions(cleanAddr);
    if (suggestions.length > 0) {
      return suggestions[0];
    }
  } catch {}

  // Fallback match với toạ độ quận/huyện chính xác
  const lower = cleanAddr.toLowerCase();
  const sortedDistricts = Object.entries(DISTRICT_COORDINATES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, coord] of sortedDistricts) {
    const regex = new RegExp(`(?:^|[^a-z0-9à-ỹ])${key}(?:[^a-z0-9à-ỹ]|$)`, 'i');
    if (regex.test(lower)) {
      return {
        lat: coord.lat,
        lng: coord.lng,
        displayName: cleanAddr,
        city: coord.city,
      };
    }
  }

  // Khớp theo tên thành phố lớn
  for (const [cityKey, cityCoord] of [
    ['hà nội', KNOWN_VIETNAM_COORDINATES['hà nội']],
    ['đà nẵng', KNOWN_VIETNAM_COORDINATES['đà nẵng']],
    ['bình dương', KNOWN_VIETNAM_COORDINATES['bình dương']],
    ['hồ chí minh', KNOWN_VIETNAM_COORDINATES['hồ chí minh']],
  ]) {
    if (lower.includes(cityKey)) {
      return {
        lat: cityCoord.lat,
        lng: cityCoord.lng,
        displayName: cleanAddr,
        city: cityCoord.city,
      };
    }
  }

  return null;
}

/**
 * Lấy toạ độ GPS vị trí thực tế của người dùng từ trình duyệt
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ GPS'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      err => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Tìm và giải mã toạ độ chi nhánh
 */
export function resolveBranchCoordinates(branch) {
  if (!branch) return null;

  if (branch.vi_do != null && branch.kinh_do != null) {
    const lat = Number(branch.vi_do);
    const lng = Number(branch.kinh_do);
    // Kiểm tra toạ độ hợp lệ trong phạm vi lãnh thổ Việt Nam (Vĩ độ 8-24, Kinh độ 102-110)
    if (!isNaN(lat) && !isNaN(lng) && lat >= 8.0 && lat <= 24.0 && lng >= 102.0 && lng <= 110.0) {
      return { lat, lng };
    }
  }

  const addrText = `${branch.ten_chi_nhanh || ''} ${branch.dia_chi || ''} ${branch.thanh_pho || ''}`.toLowerCase();
  
  // Kiểm tra tên chi nhánh hoặc địa chỉ cụ thể
  if (addrText.includes('landmark 81')) return { lat: 10.7951, lng: 106.7219 };
  if (addrText.includes('đồng khởi') || addrText.includes('hải triều') || addrText.includes('lê thánh tôn')) return { lat: 10.7756, lng: 106.7029 };
  if (addrText.includes('mạc đĩnh chi') || addrText.includes('mac_dinh_chi')) return { lat: 10.7834, lng: 106.6995 };
  if (addrText.includes('điện biên phủ')) return { lat: 10.7995, lng: 106.7112 };
  if (addrText.includes('nguyễn huệ') || addrText.includes('phố đi bộ')) return { lat: 10.7738, lng: 106.7039 };
  if (addrText.includes('crescent mall') || addrText.includes('tôn dật tiên')) return { lat: 10.7295, lng: 106.7198 };
  if (addrText.includes('nguyễn hữu thọ') || addrText.includes('tôn đức thắng')) return { lat: 10.7327, lng: 106.6991 };
  if (addrText.includes('vạn hạnh mall') || addrText.includes('sư vạn hạnh')) return { lat: 10.7701, lng: 106.6698 };
  if (addrText.includes('bách khoa') || addrText.includes('lý thường kiệt')) return { lat: 10.7725, lng: 106.6579 };
  if (addrText.includes('nguyễn văn linh') || addrText.includes('phú mỹ hưng')) return { lat: 10.7312, lng: 106.7115 };
  if (addrText.includes('xô viết nghệ tĩnh')) return { lat: 10.8012, lng: 106.7102 };
  if (addrText.includes('phạm văn đồng') || addrText.includes('hiệp bình chánh')) return { lat: 10.8354, lng: 106.7289 };
  if (addrText.includes('bình trị đông') || addrText.includes('bình tân')) return { lat: 10.7554, lng: 106.6125 };
  if (addrText.includes('cộng hòa') || addrText.includes('etown')) return { lat: 10.8015, lng: 106.6526 };

  // Khớp quận / huyện theo ranh giới từ chính xác (Ưu tiên tên dài trước để không bị 'quận 1' nuốt 'quận 10', 'quận 12')
  const sortedDistricts = Object.entries(DISTRICT_COORDINATES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, coord] of sortedDistricts) {
    const regex = new RegExp(`(?:^|[^a-z0-9à-ỹ])${key}(?:[^a-z0-9à-ỹ]|$)`, 'i');
    if (regex.test(addrText)) {
      return { lat: coord.lat, lng: coord.lng };
    }
  }

  // Khớp viết tắt dạng q12, q.12, q1, q.1...
  const qMatch = addrText.match(/(?:quận|q\.)\s*(\d{1,2})/i);
  if (qMatch) {
    const qKey = `quận ${qMatch[1]}`;
    if (DISTRICT_COORDINATES[qKey]) {
      return { lat: DISTRICT_COORDINATES[qKey].lat, lng: DISTRICT_COORDINATES[qKey].lng };
    }
  }

  return null;
}

/**
 * Phân giải toạ độ từ chuỗi địa chỉ giao hàng (Fallback thông minh theo quận/huyện và địa danh Việt Nam)
 */
export function resolveAddressCoordinates(addressText) {
  if (!addressText || typeof addressText !== 'string') return null;
  const addrText = addressText.toLowerCase();

  // 1. Kiểm tra các địa danh / toà nhà / tuyến đường nổi bật
  if (addrText.includes('landmark 81')) return { lat: 10.7951, lng: 106.7219 };
  if (addrText.includes('đồng khởi') || addrText.includes('hải triều') || addrText.includes('lê thánh tôn')) return { lat: 10.7756, lng: 106.7029 };
  if (addrText.includes('mạc đĩnh chi') || addrText.includes('mac_dinh_chi')) return { lat: 10.7834, lng: 106.6995 };
  if (addrText.includes('điện biên phủ')) return { lat: 10.7995, lng: 106.7112 };
  if (addrText.includes('nguyễn huệ') || addrText.includes('phố đi bộ')) return { lat: 10.7738, lng: 106.7039 };
  if (addrText.includes('crescent mall') || addrText.includes('tôn dật tiên')) return { lat: 10.7295, lng: 106.7198 };
  if (addrText.includes('vạn hạnh mall') || addrText.includes('sư vạn hạnh')) return { lat: 10.7701, lng: 106.6698 };
  if (addrText.includes('bách khoa') || addrText.includes('lý thường kiệt')) return { lat: 10.7725, lng: 106.6579 };
  if (addrText.includes('cộng hòa') || addrText.includes('etown')) return { lat: 10.8015, lng: 106.6526 };

  // 2. Khớp quận / huyện theo từ điển chuẩn
  const sortedDistricts = Object.entries(DISTRICT_COORDINATES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, coord] of sortedDistricts) {
    const regex = new RegExp(`(?:^|[^a-z0-9à-ỹ])${key}(?:[^a-z0-9à-ỹ]|$)`, 'i');
    if (regex.test(addrText)) {
      return { lat: coord.lat, lng: coord.lng };
    }
  }

  // 3. Khớp viết tắt dạng q12, q.12, q1, q.1...
  const qMatch = addrText.match(/(?:quận|q\.)\s*(\d{1,2})/i);
  if (qMatch) {
    const qKey = `quận ${qMatch[1]}`;
    if (DISTRICT_COORDINATES[qKey]) {
      return { lat: DISTRICT_COORDINATES[qKey].lat, lng: DISTRICT_COORDINATES[qKey].lng };
    }
  }

  return null;
}

