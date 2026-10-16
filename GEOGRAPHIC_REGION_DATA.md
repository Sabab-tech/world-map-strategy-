# OMEGA Geographic Region Data v1

## Canonical structure

- `countries.json` remains the canonical 249-row ISO 3166-1 identity roster. Existing identity fields and data are preserved; geographic fields are additive.
- Every country/area row now includes `continent` (primary), `continents` (membership used by the selector), `subregion`, `oceanAccess`, `lat`, `lng`, and `mapPointSource`.
- `world.json` remains the Leaflet polygon source. Existing geometries are retained, canonical ISO alpha-2/alpha-3 properties are added, and missing canonical polygons are appended. Geometry and country metadata join by ISO code, not display-name guesses.
- `world_oceans_v1.json` contains five ocean-basin highlighting geometries. North/South Atlantic polygons are grouped into Atlantic Ocean; North/South Pacific polygons are grouped into Pacific Ocean.
- `omega_geographic_region_system_v1.js` adds a compact map selector for seven continents and five oceans. Selecting a region recolors its member polygons and lists its country/area records. Selecting a list entry zooms to that polygon.

## Classification rules

Seven-continent model: Africa, Antarctica, Asia, Europe, North America, Oceania, South America. The primary continent uses Natural Earth’s geographic category where available, with UN Statistics Division M49 regional/subregional classifications for records without a suitable Natural Earth category. M49’s combined “Americas” region is split using its Northern America subregion and explicit South American ISO codes. A small number of transcontinental entities have multiple values in `continents`; `continent` remains the primary label. South Georgia and the South Sandwich Islands are grouped with South America for map selection, while Bouvet Island is grouped with Antarctica; classifications for remote/subantarctic islands are not universally consistent.

Five-ocean model: Arctic, Atlantic, Indian, Pacific, Southern. `oceanAccess` is a curated geographic membership list, including connected marginal-sea basins where appropriate. Landlocked records intentionally use an empty array. Territories with their own ISO rows are classified at their own geographic location rather than silently inheriting the sovereign state’s mainland membership.

Coordinates preserve existing `countries.json` latitude/longitude when present. Missing map points are filled first from Natural Earth label coordinates and then, if needed, from a representative point derived from the polygon. `mapPointSource` distinguishes these cases. These values are map-label/selection points, not a claim that every value is a capital or a legal boundary centroid.

Existing map-only disputed features are retained separately from the canonical ISO roster. They are not silently inserted into the 249-row ISO identity list. The pre-existing layer filter for Northern Cyprus and Somaliland remains unchanged.

## Provenance

- Country/area identity and subregion mapping: UN Statistics Division, M49 table, distributed in `datasets/country-codes`: https://github.com/datasets/country-codes/blob/main/tmp/UNSD-en.csv
- Polygon coverage: `rembish/iso-topojson`, `iso-a2.json`, a Natural Earth-derived 249-entity ISO polygon set plus a separate Kosovo map entity: https://github.com/rembish/iso-topojson
- Ocean surfaces and label points: Natural Earth 1:110m geography/marine datasets: https://github.com/nvkelso/natural-earth-vector

The derived `iso-a2.json` source identifies its license as CC BY 4.0; cite the upstream project when redistributing derived polygons. Natural Earth base data is public domain. The added data is simplified for a lightweight Leaflet map and is intended for game visualization, not legal or navigational use.
