import { useMemo, useState } from 'react'

const STORE_LOCATIONS = [
  {
    id: 'mac-dinh-chi',
    name: 'Avengers Coffee - Mạc Đĩnh Chi',
    address: '5 Mạc Đĩnh Chi, Phường Đa Kao, Quận 1, TP. Hồ Chí Minh',
    hotline: '028 3999 8899',
    openingHours: '06:30 - 22:30',
    mapQuery: '5 Mạc Đĩnh Chi, Quận 1, Hồ Chí Minh',
  },
  {
    id: 'the-grace-tower',
    name: 'Avengers Coffee - The Grace Tower',
    address: '71 Hoàng Hoa Thám, Phường 13, Quận Tân Bình, TP. Hồ Chí Minh',
    hotline: '028 3888 2299',
    openingHours: '07:00 - 22:00',
    mapQuery: 'The Grace Tower 71 Hoàng Hoa Thám Tân Bình',
  },
  {
    id: 'landmark-office',
    name: 'Avengers Coffee - Landmark Office Hub',
    address: '208 Nguyễn Hữu Cảnh, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh',
    hotline: '028 3777 1010',
    openingHours: '07:00 - 23:00',
    mapQuery: '208 Nguyễn Hữu Cảnh Bình Thạnh Hồ Chí Minh',
  },
]

function buildGoogleMapLink(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function buildGoogleEmbedLink(query) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
}

export function StoreLocationsPanel() {
  const [selectedLocationId, setSelectedLocationId] = useState(STORE_LOCATIONS[0]?.id || '')

  const selectedLocation = useMemo(
    () => STORE_LOCATIONS.find((location) => location.id === selectedLocationId) || STORE_LOCATIONS[0],
    [selectedLocationId],
  )

  return (
    <section className="panel admin-map-panel">
      <div className="panel-head">
        <h2>Xem địa chỉ quán</h2>
        <span>Chọn chi nhánh và bấm mở Google Maps</span>
      </div>

      <div className="admin-map-layout">
        <aside className="admin-map-list">
          {STORE_LOCATIONS.map((location) => (
            <button
              key={location.id}
              type="button"
              className={selectedLocation?.id === location.id ? 'admin-map-item active' : 'admin-map-item'}
              onClick={() => setSelectedLocationId(location.id)}
            >
              <h3>{location.name}</h3>
              <p>{location.address}</p>
              <small>{location.openingHours}</small>
            </button>
          ))}
        </aside>

        <div className="admin-map-detail">
          <h3>{selectedLocation?.name}</h3>
          <p>{selectedLocation?.address}</p>
          <p>Giờ mở cửa: {selectedLocation?.openingHours}</p>
          <p>Hotline: {selectedLocation?.hotline}</p>
          <a
            href={buildGoogleMapLink(selectedLocation?.mapQuery || selectedLocation?.address || '')}
            target="_blank"
            rel="noreferrer"
            className="admin-map-link"
          >
            Mở trong Google Maps
          </a>

          <div className="admin-map-embed-wrap">
            <iframe
              title={`map-${selectedLocation?.id || 'store'}`}
              src={buildGoogleEmbedLink(selectedLocation?.mapQuery || selectedLocation?.address || '')}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
