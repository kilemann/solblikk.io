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
