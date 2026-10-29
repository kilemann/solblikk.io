// Solblikk – geometri for kartmodus.
// Solbanediagram i polarprojeksjon rundt valgt punkt: retning = asimut,
// avstand fra sentrum = radius · (90 − høyde)/90. Horisonten er ytterringen.
import { destinationPoint } from './horizon.js';

/** [lat, lon] for et punkt i diagrammet. */
export function polarPoint(lat, lon, azimuth, altitude, radiusM) {
  const r = radiusM * (90 - Math.max(0, Math.min(90, altitude))) / 90;
  if (r < 1e-6) return [lat, lon];
  const [plon, plat] = destinationPoint(lat, lon, azimuth, r);
  return [plat, plon];
}

/** [lat, lon] i gitt asimut og avstand. */
export function rayPoint(lat, lon, azimuth, distM) {
  const [plon, plat] = destinationPoint(lat, lon, azimuth, distM);
  return [plat, plon];
}

/** Deler en solbane i sammenhengende biter over horisonten. */
export function pathSegments(path, lat, lon, radiusM, minAlt = 0) {
  const segs = [];
  let cur = null;
  for (const p of path) {
    if (p.altitude >= minAlt) {
      if (!cur) { cur = []; segs.push(cur); }
      cur.push(polarPoint(lat, lon, p.azimuth, p.altitude, radiusM));
    } else cur = null;
  }
  return segs;
}

// ---------- Zoom ----------
/** Kartverkets topo-fliser hentes til og med dette nivået, deretter forstørres de. */
export const TILE_MAX_NATIVE_ZOOM = 18;
/** Høyeste zoom: gir målestokk på 5 m eller mindre i hele Norge. */
export const MAP_MAX_ZOOM = 20;

/** Meter per skjermpiksel i Web Mercator. */
export function metersPerPixel(lat, zoom) {
  return 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** zoom;
}

/** Lengden Leaflets målestokk viser (maks 100 px, avrundet ned til 1/2/3/5 × 10ⁿ). */
export function scaleBarMeters(mPerPx, maxWidth = 100) {
  const max = mPerPx * maxWidth;
  const pow10 = 10 ** Math.floor(Math.log10(max));
  const d = max / pow10;
  return pow10 * (d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1);
}
