# Geographic reference data

Downloaded 2026-10-20. Business values are never taken from these reference datasets.

- Country outline: Natural Earth 1:110m Admin 0 Countries, public domain.
  https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/
  https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
- Representative city points: GeoNames cities15000, CC BY 4.0.
  https://download.geonames.org/export/dump/cities15000.zip
  https://www.geonames.org/ · https://creativecommons.org/licenses/by/4.0/
  Coordinates retained as WGS84 longitude/latitude. Each point keeps its GeoNames ID.
- Warehouse city aliases (plus representative-city names) and reporting-region membership: semantic_catalog.json,
  analysis_registry.dimensions.city, warehouse_reporting_geography_v1.
  Regional representative points are the arithmetic mean of their member city reference points.

These are representative positions for labels in the warehouse. Province values use a representative
city (e.g. Nghệ An → Vinh); they are not province centroids, store GPS, delivery addresses,
or a current administrative boundary map. Unknown labels are listed separately, never guessed or dropped.
The country outline is generalized at a small scale and is used only as geographic context.

The reference lookup covers 63 historical province labels that may occur in warehouse records.
Additional province-to-city references are explicit representative points; they do not extend
the server's selectable scopes or reporting-region classification.

## Detailed province map

- Province polygons: geoBoundaries gbHumanitarian VNM ADM1, reference year 2020,
  63 province/municipality features; Government of Viet Nam / HDX.
  License: CC BY 3.0 IGO. Original metadata retained in public/geo/vietnam-provinces-source.json.
  https://www.geoboundaries.org/api/current/gbHumanitarian/VNM/ADM1/
  Geometry simplified by the provider, coordinates rounded to five decimal places;
  names canonicalized to the historical warehouse labels. No polygons or observations merged.
- Live street basemap: OpenFreeMap / OpenMapTiles / OpenStreetMap, requested by the browser.
  https://openfreemap.org/quick_start/
- Renderer: locally vendored MapLibre GL JS from the existing web-customer application,
  license retained under public/map-libs. Loaded only when a geographic report opens.

The 2020 province layer matches historical warehouse labels; it does not claim to represent
current administrative divisions. For regional reports, the color and tooltip represent the
REGIONAL value, repeated for locating the group's province membership. They never redistribute
a regional total to provinces. Membership follows warehouse_reporting_geography_v1;
provinces outside its named groups remain “Chưa phân loại”.
