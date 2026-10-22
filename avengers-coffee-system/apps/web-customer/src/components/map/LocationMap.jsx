import React, { useRef, useState, useEffect, useMemo } from 'react';
import Map, {
  Marker,
  Popup,
  NavigationControl,
  FullscreenControl,
  GeolocateControl,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import './locationMap.css';
import {
  RiCupFill,
  RiMapPin2Fill,
  RiTimeLine,
  RiPhoneLine,
  RiStarFill,
  RiArrowRightUpLine,
  RiFocus3Line,
  RiStackLine,
  RiInformationLine,
  RiWifiLine,
  RiBankCardLine,
  RiCloseLine,
} from 'react-icons/ri';
import { coordinates, DEFAULT_MAP_CENTER, decodeHtmlEntities } from '../../lib/locationModel';
import { useLocationText } from '../../lib/locationText';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

const MAP_STYLES = [
  { id: 'streets', label: 'Đường phố', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'light', label: 'Sáng thanh lịch', url: 'mapbox://styles/mapbox/light-v11' },
  { id: 'satellite', label: 'Vệ tinh', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
];

export default function LocationMap({
  branches = [],
  selected = null,
  onSelect,
  onViewDetail,
  height = '100%',
}) {
  const t = useLocationText();
  const mapRef = useRef(null);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/streets-v12');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [hoveredStore, setHoveredStore] = useState(null);
  const [showPopupCard, setShowPopupCard] = useState(true);

  // Determine initial center
  const selectedPoint = coordinates(selected);
  const firstPoint = selectedPoint || branches.map(coordinates).find(Boolean);
  const defaultCenter = firstPoint ? [firstPoint.lng, firstPoint.lat] : [DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]];

  const [viewState, setViewState] = useState({
    longitude: defaultCenter[0],
    latitude: defaultCenter[1],
    zoom: firstPoint ? 15 : 12,
    pitch: 0,
    bearing: 0,
  });

  // Re-fly and show popup when selected store changes (from sidebar or map)
  useEffect(() => {
    if (selected) {
      const point = coordinates(selected);
      if (point && mapRef.current) {
        mapRef.current.flyTo({
          center: [point.lng, point.lat],
          zoom: 15.5,
          duration: 800,
          essential: true,
        });
      }
      setShowPopupCard(true);
    }
  }, [selected?.id, selected?.ma_chi_nhanh]);

  const handleCenterSelected = () => {
    const point = coordinates(selected) || firstPoint;
    if (point && mapRef.current) {
      mapRef.current.flyTo({
        center: [point.lng, point.lat],
        zoom: 16,
        pitch: 0,
        bearing: 0,
        duration: 700,
      });
    }
  };

  const validBranches = useMemo(() => {
    return branches.filter((branch) => coordinates(branch));
  }, [branches]);

  return (
    <div className="relative w-full overflow-hidden bg-slate-100" style={{ height, minHeight: 380 }}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {/* Navigation Controls */}
        <NavigationControl position="bottom-right" showCompass visualizePitch />
        <FullscreenControl position="bottom-right" />
        <GeolocateControl
          position="bottom-right"
          trackUserLocation
          showAccuracyCircle
          showUserHeading
        />

        {/* Store Markers */}
        {validBranches.map((branch) => {
          const pt = coordinates(branch);
          if (!pt) return null;
          const isSelected =
            (selected?.id && selected.id === branch.id) ||
            (selected?.ma_chi_nhanh && selected.ma_chi_nhanh === branch.ma_chi_nhanh);
          const isHovered = hoveredStore?.id === branch.id;
          const storeName = decodeHtmlEntities(branch.name || branch.ten_chi_nhanh || t('branch'));
          const storeAddress = decodeHtmlEntities(branch.address || branch.dia_chi || '');

          return (
            <Marker
              key={branch.id || branch.ma_chi_nhanh || `${pt.lat}-${pt.lng}`}
              longitude={pt.lng}
              latitude={pt.lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelect?.(branch);
                setShowPopupCard(true);
              }}
            >
              <div
                className="relative cursor-pointer transition-transform duration-200"
                style={{ zIndex: isSelected ? 50 : isHovered ? 40 : 10 }}
                onMouseEnter={() => setHoveredStore(branch)}
                onMouseLeave={() => setHoveredStore(null)}
              >
                {/* Ripple ring for selected store */}
                {isSelected && (
                  <span className="absolute -inset-2 rounded-full bg-[#b22830]/25 animate-ping pointer-events-none" />
                )}

                {/* Marker Pin */}
                <div
                  className={`flex items-center justify-center rounded-full transition-all duration-300 shadow-lg ${
                    isSelected
                      ? 'w-11 h-11 bg-gradient-to-tr from-[#8b1820] to-[#d32f2f] text-white ring-4 ring-white ring-offset-2 scale-110 shadow-red-900/40'
                      : 'w-8 h-8 bg-gradient-to-tr from-[#9c2028] to-[#b22830] text-white hover:scale-115 hover:ring-2 hover:ring-white shadow-stone-800/25'
                  }`}
                  style={{
                    clipPath: isSelected
                      ? 'polygon(50% 100%, 0% 40%, 0% 0%, 100% 0%, 100% 40%)'
                      : 'polygon(50% 100%, 0% 35%, 0% 0%, 100% 0%, 100% 35%)',
                    borderRadius: isSelected ? '14px 14px 4px 4px' : '10px 10px 3px 3px',
                    paddingBottom: isSelected ? '8px' : '6px',
                  }}
                  title={storeName}
                >
                  <RiCupFill className={isSelected ? 'w-5 h-5 drop-shadow-sm' : 'w-3.5 h-3.5'} />
                </div>

                {/* Compact Hover Tooltip (Small card with Name and Address only) */}
                {isHovered && !isSelected && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[240px] p-2.5 bg-gray-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl pointer-events-none z-50 text-left animate-fade-in border border-white/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <RiCupFill className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <p className="text-xs font-bold text-white truncate leading-tight">
                        {storeName}
                      </p>
                    </div>
                    {storeAddress && (
                      <p className="text-[10.5px] text-gray-300 font-normal line-clamp-2 leading-relaxed">
                        {storeAddress}
                      </p>
                    )}
                    {/* Little pointy shape pointing down to the marker */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-gray-900/95" />
                  </div>
                )}
              </div>
            </Marker>
          );
        })}

        {/* Selected Store Detailed Popup with pointy shape pointing down to pin */}
        {selected && showPopupCard && selectedPoint && (
          <Popup
            longitude={selectedPoint.lng}
            latitude={selectedPoint.lat}
            anchor="bottom"
            offset={[0, -44]}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setShowPopupCard(false)}
            className="store-selected-popup"
            maxWidth="360px"
          >
            <div className="p-4 w-[330px] max-w-[calc(100vw-48px)] text-left font-sans bg-white rounded-2xl">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-800 text-[10px] font-bold border border-red-100">
                    <RiCupFill className="w-3 h-3 text-[#b22830]" />
                    Avengers Coffee
                  </span>
                  <h3 className="mt-1 text-sm font-bold text-gray-900 truncate">
                    {decodeHtmlEntities(selected.name || selected.ten_chi_nhanh || t('branch'))}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPopupCard(false)}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Đóng"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>

              {/* Rating & Type */}
              <div className="mt-2 flex items-center gap-2">
                {selected.reviewCount > 0 ? (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 text-xs font-semibold px-2 py-0.5 rounded-md border border-amber-200">
                    <RiStarFill className="w-3.5 h-3.5 text-amber-500" />
                    {Number(selected.rating).toFixed(1)}
                    <span className="text-gray-400 font-normal">({selected.reviewCount})</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400 italic">Chưa có đánh giá</span>
                )}
                {selected.type === 'KIOSK_VE_TINH' && (
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold border border-blue-100">
                    Take-away
                  </span>
                )}
                {selected.type === 'XE_NUOC_FRUIT' && (
                  <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-semibold border border-orange-100">
                    Xe Đẩy
                  </span>
                )}
              </div>

              {/* Address, Hours, Phone */}
              <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                <div className="flex items-start gap-2">
                  <RiMapPin2Fill className="w-3.5 h-3.5 text-[#b22830] shrink-0 mt-0.5" />
                  <p className="line-clamp-2 leading-relaxed font-medium text-gray-700">
                    {decodeHtmlEntities(selected.address || selected.dia_chi || 'Đang cập nhật địa chỉ')}
                  </p>
                </div>
                {selected.hours && (
                  <div className="flex items-center gap-2">
                    <RiTimeLine className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-gray-600 font-medium">{selected.hours}</span>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-2">
                    <RiPhoneLine className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <a
                      href={`tel:${selected.phone}`}
                      className="text-gray-700 hover:text-[#b22830] font-medium"
                    >
                      {selected.phone}
                    </a>
                  </div>
                )}
              </div>

              {/* Amenities */}
              <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center gap-3 text-[11px] text-gray-500 font-medium">
                <span className="flex items-center gap-1 text-blue-700 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100">
                  <RiWifiLine className="w-3 h-3 text-blue-500" /> Wifi
                </span>
                <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50/60 px-2 py-0.5 rounded border border-emerald-100">
                  <RiBankCardLine className="w-3 h-3 text-emerald-500" /> Thẻ
                </span>
              </div>

              {/* Action buttons */}
              <div className="mt-3.5 pt-2 flex items-center gap-2">
                {onViewDetail && (
                  <button
                    type="button"
                    onClick={() => onViewDetail(selected)}
                    className="flex-1 h-8 px-3 rounded-xl bg-[#b22830] hover:bg-red-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <RiInformationLine className="w-3.5 h-3.5" />
                    Chi tiết & Đánh giá
                  </button>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    coordinates(selected)
                      ? `${coordinates(selected).lat},${coordinates(selected).lng}`
                      : selected.address || selected.dia_chi || ''
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-8 px-3 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all text-center"
                >
                  <RiArrowRightUpLine className="w-3.5 h-3.5" />
                  Chỉ đường
                </a>
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {/* Top Controls: Re-center & Map Style Switcher */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Style switch button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            className="h-9 px-3 rounded-xl bg-white/95 backdrop-blur-md text-gray-700 hover:text-[#b22830] text-xs font-medium border border-gray-200/80 shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            title="Đổi kiểu bản đồ"
          >
            <RiStackLine className="w-4 h-4 text-[#b22830]" />
            <span className="hidden sm:inline">Kiểu bản đồ</span>
          </button>

          {showStyleMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-40 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-30 animate-fade-in">
              {MAP_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    setMapStyle(style.url);
                    setShowStyleMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                    mapStyle === style.url
                      ? 'bg-red-50 text-[#b22830] font-semibold'
                      : 'text-gray-700 hover:bg-gray-50 font-medium'
                  }`}
                >
                  {style.label}
                  {mapStyle === style.url && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#b22830]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Re-center Button */}
        <button
          type="button"
          onClick={handleCenterSelected}
          className="h-9 px-3 rounded-xl bg-white/95 backdrop-blur-md text-gray-700 hover:text-[#b22830] text-xs font-medium border border-gray-200/80 shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
          title="Định tâm cửa hàng"
        >
          <RiFocus3Line className="w-4 h-4 text-[#b22830]" />
          <span className="hidden sm:inline">Định tâm</span>
        </button>
      </div>
    </div>
  );
}
