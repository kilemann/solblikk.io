// Solblikk – kartmodus (Leaflet + Kartverket topo)
import { pathSegments, polarPoint, rayPoint } from './mapgeo.js';
import { horizonAt } from './horizon.js';

const TOPO_URL = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
const COLORS = { sun: '#FFC233', summer: '#FF8A5B', winter: '#7FB7FF', terrain: '#6FCF97', text: '#E9EEF7' };

export function createMapView(el, { onLongPress, onTap }) {
  const L = globalThis.L;
  if (!L) {
    el.innerHTML = '<p style="padding:16px">Kartbiblioteket kunne ikke lastes. Sjekk nettforbindelsen og last siden på nytt.</p>';
    return { update() {}, invalidate() {}, center() {} };
  }
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([58.1467, 7.9956], 14);
  L.tileLayer(TOPO_URL, {
    maxZoom: 18, attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
  }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  const layer = L.layerGroup().addTo(map);
  let last = null;

  map.on('contextmenu', (e) => onLongPress?.(e.latlng.lat, e.latlng.lng));
  map.on('click', (e) => onTap?.(e.latlng.lat, e.latlng.lng));
  map.on('zoomend', () => last && draw(last));

  /** Diagramradius: ~42 % av korteste side av kartet, i meter. */
  function radiusMeters(lat, lon) {
    const size = map.getSize();
    const px = Math.min(size.x, size.y) * 0.42;
    const c = map.latLngToContainerPoint([lat, lon]);
    return map.distance([lat, lon], map.containerPointToLatLng([c.x + px, c.y]));
  }

  function draw(d) {
    layer.clearLayers();
    const { lat, lon } = d.pos;
    const R = radiusMeters(lat, lon);

    // Horisontring og 30°/60°-ringer
    for (const alt of [0, 30, 60]) {
      const ring = [];
      for (let az = 0; az <= 360; az += 5) ring.push(polarPoint(lat, lon, az, alt, R));
      L.polyline(ring, { color: COLORS.text, weight: alt === 0 ? 1.5 : 0.8, opacity: alt === 0 ? 0.7 : 0.35, dashArray: alt ? '2 6' : null, interactive: false }).addTo(layer);
    }
    // Himmelretninger
    for (const [az, name] of [[0, 'N'], [90, 'Ø'], [180, 'S'], [270, 'V']]) {
      L.marker(polarPoint(lat, lon, az, -6, R), {
        interactive: false,
        icon: L.divIcon({ className: '', html: `<span class="hour-label" style="background:#E9EEF7">${name}</span>`, iconSize: [0, 0] }),
      }).addTo(layer);
    }

    // Terreng: horisontvinkel som polygon (sola innenfor = synlig)
    if (d.horizon) {
      const poly = [];
      for (let az = 0; az <= 360; az += 2) poly.push(polarPoint(lat, lon, az, Math.max(0, horizonAt(d.horizon, az)), R));
      L.polygon(poly, { color: COLORS.terrain, weight: 2, fillColor: COLORS.terrain, fillOpacity: 0.08, interactive: false }).addTo(layer);
    }

    // Solverv (stiplet)
    for (const [path, color] of [[d.summerPath, COLORS.summer], [d.winterPath, COLORS.winter]]) {
      for (const seg of pathSegments(path, lat, lon, R)) {
        L.polyline(seg, { color, weight: 2, dashArray: '6 6', opacity: 0.9, interactive: false }).addTo(layer);
      }
    }

    // Valgt dato
    for (const seg of pathSegments(d.path, lat, lon, R)) {
      L.polyline(seg, { color: '#000', weight: 7, opacity: 0.25, interactive: false }).addTo(layer);
      L.polyline(seg, { color: COLORS.sun, weight: 4, interactive: false }).addTo(layer);
    }
    // Timeperler
    for (const p of d.path) {
      if (p.altitude < 0 || p.time.getMinutes() !== 0) continue;
      L.marker(polarPoint(lat, lon, p.azimuth, p.altitude, R), {
        interactive: false,
        icon: L.divIcon({ className: '', html: `<span class="hour-label">${String(p.time.getHours()).padStart(2, '0')}</span>`, iconSize: [0, 0] }),
      }).addTo(layer);
    }

    // Oppgang/nedgang-stråler (terreng hvis tilgjengelig)
    const ev = d.events;
    for (const e of [ev.sunrise, ev.sunset]) {
      if (!e) continue;
      L.polyline([[lat, lon], rayPoint(lat, lon, e.azimuth, R * 1.15)], { color: COLORS.sun, weight: 2.5, opacity: 0.9, interactive: false }).addTo(layer);
    }

    // Sola på valgt klokkeslett
    const s = d.sunAt;
    if (s.altitude > -6) {
      L.polyline([[lat, lon], rayPoint(lat, lon, s.azimuth, R)], { color: COLORS.sun, weight: 1.5, dashArray: '3 5', interactive: false }).addTo(layer);
      L.circleMarker(polarPoint(lat, lon, s.azimuth, Math.max(s.altitude, 0), R), {
        radius: 11, color: '#101A2E', weight: 3, fillColor: s.visible ? COLORS.sun : '#5b6a86', fillOpacity: 1, interactive: false,
      }).addTo(layer);
    }

    // Kalibreringspunkt
    if (d.landmark) {
      L.polyline([[lat, lon], [d.landmark.lat, d.landmark.lon]], { color: COLORS.terrain, weight: 1.5, dashArray: '4 6', interactive: false }).addTo(layer);
      L.marker([d.landmark.lat, d.landmark.lon], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="lm-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(layer);
    }

    // Posisjon
    L.marker([lat, lon], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="pos-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(layer);
  }

  return {
    update(d) { last = d; draw(d); },
    invalidate() { map.invalidateSize(); if (last) draw(last); },
    center(lat, lon) { map.setView([lat, lon], Math.max(map.getZoom(), 14)); },
  };
}
