// Solblikk – terrenghorisont fra Kartverkets høyde-API.
// API: https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4326&geojson=false&punkter=[[lon,lat],…]
// Svar: { punkter: [{ x, y, z }, …] } – z er terrenghøyde (moh.).
// Jordkrumning og refraksjon: senkning = d²(1−k)/(2R), k = 0,13 (standard terrestrisk).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const EARTH_R = 6371000;
export const API_URL = 'https://ws.geonorge.no/hoydedata/v1/punkt';
export const BATCH = 50;

/** Avstander (m) langs hver stråle – tett nær, glissent langt ute. */
export const SAMPLE_DISTANCES = [
  30, 60, 100, 150, 200, 300, 400, 500, 650, 800, 1000, 1250, 1500, 1800, 2200,
  2600, 3000, 3500, 4000, 5000, 6000, 7000, 8000, 9500, 11000, 13000, 15000,
  17500, 20000, 23000, 26000, 30000,
];

/** Punkt i gitt kurs og avstand (storsirkel). Returnerer [lon, lat]. */
export function destinationPoint(lat, lon, bearingDeg, distM) {
  const p1 = lat * D2R, l1 = lon * D2R, th = bearingDeg * D2R, dr = distM / EARTH_R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dr) * Math.cos(p1),
    Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return [l2 * R2D, p2 * R2D];
}

export function distanceBetween(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R;
  const dp = p2 - p1, dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/** Startkurs (grader fra sann nord) fra punkt 1 til punkt 2. */
export function bearingBetween(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * R2D) % 360 + 360) % 360;
}

/**
 * Høyeste vinkel langs én stråle.
 * @param {number} z0 terrenghøyde i observatørpunktet
 * @param {(number|null)[]} z terrenghøyder i hver avstand (null = hav/ingen data → 0)
 * @returns {{angle:number, distance:number}}
 */
export function horizonFromProfile(z0, z, dists, { eye = 1.6, k = 0.13 } = {}) {
  const h0 = (z0 ?? 0) + eye;
  let angle = -90, distance = 0;
  for (let i = 0; i < dists.length; i++) {
    const d = dists[i];
    const drop = d * d * (1 - k) / (2 * EARTH_R);
    const a = Math.atan(((z[i] ?? 0) - drop - h0) / d) * R2D;
    if (a > angle) { angle = a; distance = d; }
  }
  return { angle, distance };
}

/** Alle punkter som trengs: observatør først, så asimut for asimut. [lon,lat]. */
export function buildHorizonPoints(lat, lon, azStep, dists = SAMPLE_DISTANCES) {
  const pts = [[lon, lat]];
  for (let az = 0; az < 360; az += azStep) {
    for (const d of dists) pts.push(destinationPoint(lat, lon, az, d));
  }
  return pts;
}

export function parseElevations(json) {
  if (!json || !Array.isArray(json.punkter)) throw new Error('Uventet svar fra høyde-API (mangler «punkter»)');
  return json.punkter.map((p) => (typeof p.z === 'number' && p.z > -1000 ? p.z : null));
}

/**
 * Henter terrenghorisont rundt et punkt.
 * @returns {Promise<{lat,lon,azStep,angles:number[],distances:number[],observerElevation:number|null}>}
 */
export async function fetchHorizon(lat, lon, opts = {}) {
  const {
    fetchFn = globalThis.fetch.bind(globalThis), azStep = 3, concurrency = 4,
    onProgress = () => {}, eye = 1.6, signal,
  } = opts;
  const dists = SAMPLE_DISTANCES;
  const pts = buildHorizonPoints(lat, lon, azStep, dists);
  const batches = [];
  for (let i = 0; i < pts.length; i += BATCH) batches.push(pts.slice(i, i + BATCH));
  const z = new Array(pts.length);
  let done = 0, next = 0;

  const worker = async () => {
    while (next < batches.length) {
      const b = next++;
      const coords = batches[b].map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
      const url = `${API_URL}?koordsys=4326&geojson=false&punkter=${encodeURIComponent(JSON.stringify(coords))}`;
      const res = await fetchFn(url, { signal });
      if (!res.ok) throw new Error(`Høyde-API svarte med HTTP ${res.status}`);
      const vals = parseElevations(await res.json());
      vals.forEach((v, i) => { z[b * BATCH + i] = v; });
      done++;
      onProgress(done / batches.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

  const angles = [], distances = [];
  const n = dists.length;
  for (let a = 0, idx = 1; a < 360 / azStep; a++, idx += n) {
    const r = horizonFromProfile(z[0], z.slice(idx, idx + n), dists, { eye });
    angles.push(+r.angle.toFixed(3));
    distances.push(r.distance);
  }
  return { lat, lon, azStep, angles, distances, observerElevation: z[0] ?? null };
}

/** Horisontvinkel for vilkårlig asimut (lineær interpolasjon). Uten data: 0. */
export function horizonAt(h, azimuth) {
  if (!h || !h.angles?.length) return 0;
  const n = h.angles.length;
  const pos = ((((azimuth % 360) + 360) % 360) / h.azStep);
  const i = Math.floor(pos) % n, j = (i + 1) % n, f = pos - Math.floor(pos);
  return h.angles[i] * (1 - f) + h.angles[j] * f;
}

export function horizonCacheKey(lat, lon) {
  return `hz:${lat.toFixed(4)},${lon.toFixed(4)}`;
}
