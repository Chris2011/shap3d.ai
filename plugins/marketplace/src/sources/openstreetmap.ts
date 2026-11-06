import { buildingsToStl, type Footprint, type Point } from '../buildings';
import { pluginContext } from '../runtime';
import { fetchJson, SourceError, type ModelItem, type ModelSource } from '../source';

/**
 * Buildings from OpenStreetMap: Nominatim finds the place (one request per search, its policy allows no search-as-you-type),
 * Overpass hands out the footprints around it. Data under the ODbL. Overpass is a shared service: it can take a while or be full.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const RADIUS = 150;

interface Place {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

export const openStreetMap: ModelSource = {
  id: 'osm',
  label: 'OpenStreetMap', // i18n-ignore – a name
  places: true,
  search: async ({ query, signal }) => {
    if (!query) {
      return { items: [] };
    }
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '12' });
    const places = await fetchJson<Place[]>(`${NOMINATIM}?${params}`, signal);
    return {
      items: places.map((place): ModelItem => ({
        sourceId: 'osm',
        id: String(place.place_id),
        title: place.display_name,
        author: 'OpenStreetMap contributors', // i18n-ignore – the credit the licence asks for
        authorUrl: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL 1.0',
        licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
        webUrl: `https://www.openstreetmap.org/#map=18/${encodeURIComponent(place.lat)}/${encodeURIComponent(place.lon)}`,
        extra: { lat: Number(place.lat), lon: Number(place.lon) },
      })),
    };
  },
  download: async (item, _key, signal) => {
    const lat = Number(item.extra?.lat);
    const lon = Number(item.extra?.lon);
    const body = new URLSearchParams({ data: `[out:json][timeout:25];way["building"](around:${RADIUS},${lat},${lon});out geom tags;` });
    const answer = await fetchJson<{ elements?: Footprint[] }>(OVERPASS, signal, { method: 'POST', body });
    const { ShapeUtils, Vector2 } = pluginContext().THREE;
    const vectors = (ring: Point[]) => ring.map(({ x, y }) => new Vector2(x, y));
    const { bytes, count } = buildingsToStl(answer.elements ?? [], lat, lon, {
      triangulate: (ring) => ShapeUtils.triangulateShape(vectors(ring), []),
      area: (ring) => ShapeUtils.area(vectors(ring)),
    });
    if (!count) {
      throw new SourceError('noBuildings');
    }
    return new File([bytes], 'buildings.stl');
  },
};
