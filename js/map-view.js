// Solblikk – kartmodus (Leaflet + leaflet-rotate + Kartverket topo)
import { pathSegments, polarPoint, rayPoint } from './mapgeo.js';
import { eventLabel } from './format.js';
import { createRotationGate } from './rotation.js';

const TOPO_URL = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
const COLORS = { sun: '#FFC233', summer: '#FF8A5B', winter: '#7FB7FF', terrain: '#6FCF97', text: '#E9EEF7', grey: '#9AA8C2' };

const sunSvg = (fill) => {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    return `<line x1="${20 + 12 * c}" y1="${20 + 12 * s}" x2="${20 + 18 * c}" y2="${20 + 18 * s}"/>`;
  }).join('');
  return `<svg viewBox="0 0 40 40"><g stroke="#101A2E" stroke-width="5" stroke-linecap="round">${rays}</g>`
    + `<g stroke="${fill}" stroke-width="2.6" stroke-linecap="round">${rays}</g>`
    + `<circle cx="20" cy="20" r="9.5" fill="${fill}" stroke="#101A2E" stroke-width="3"/></svg>`;
};

export function createMapView(el, { onLongPress, onTap, compassBtn, compassNeedle }) {
  const L = globalThis.L;
  if (!L) {
    el.innerHTML = '<p style="padding:16px">Kartbiblioteket kunne ikke lastes. Sjekk nettforbindelsen og last siden på nytt.</p>';
    return { update() {}, invalidate() {}, center() {} };
  }
  const map = L.map(el, {
    zoomControl: false, attributionControl: true,
    rotate: true, touchRotate: true, shiftKeyRotate: true, rotateControl: false, bearing: 0,
  }).setView([58.1467, 7.9956], 14);
  const canRotate = typeof map.setBearing === 'function' && typeof map.getBearing === 'function';
  if (!canRotate && compassBtn) compassBtn.hidden = true;

  // Dødsone: leaflet-rotate roterer fra første grad, også når du bare kniper for å zoome.
  // Vi fanger opp kursen gesten ber om og slipper den først gjennom etter 15° vridning.
  if (canRotate) {
    const gate = createRotationGate({ threshold: 15 });
    const rawSet = map.setBearing.bind(map);
    map.setBearing = (b, o) => rawSet(gate.filter(b), o);
    el.addEventListener('touchstart', (e) => {
      if (e.touches?.length === 2 && !gate.active) gate.start(map.getBearing());
    }, { capture: true, passive: true });
    const stop = (e) => { if (!e.touches || e.touches.length < 2) gate.end(); };
    el.addEventListener('touchend', stop, { capture: true, passive: true });
    el.addEventListener('touchcancel', stop, { capture: true, passive: true });
  }

  L.tileLayer(TOPO_URL, {
    maxZoom: 18, attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
  }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  // Egne kartlag over markørlaget (600): sola (640) og opp/ned-tidene (660).
  // Leaflet-rotate overstyrer zIndexOffset, så rekkefølgen styres med lag i stedet.
  const parent = map.getPane?.('norotatePane');
  for (const [name, z] of [['solblikkSol', 640], ['solblikkTider', 660]]) {
    const pane = map.createPane ? map.createPane(name, parent) : null;
    if (pane) pane.style.zIndex = String(z);
  }
  const hasPanes = !!map.getPane?.('solblikkTider');

  const layer = L.layerGroup().addTo(map);
  let last = null;

  map.on('contextmenu', (e) => onLongPress?.(e.latlng.lat, e.latlng.lng));
  map.on('click', (e) => onTap?.(e.latlng.lat, e.latlng.lng));
  map.on('zoomend', () => last && draw(last));

  // ---------- Kompass ----------
  // Nåla peker dit nord er på skjermen. Retningen leses fra kartet selv (to punkter i
  // samme lengdegrad), så den blir riktig uansett hvordan rotasjonen er implementert.
  let shownAngle = null;
  function northAngle() {
    const c = map.getCenter();
    const a = map.latLngToContainerPoint(c);
    const b = map.latLngToContainerPoint([c.lat + 0.01, c.lng]);
    return Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI;   // 0 = opp, med klokka
  }
  function updateCompass() {
    if (!compassNeedle) return;
    const ang = Math.round(northAngle() * 10) / 10;
    if (ang === shownAngle) return;
    shownAngle = ang;
    compassNeedle.style.transform = `rotate(${ang}deg)`;
    compassBtn?.classList.toggle('rotated', Math.abs(ang) > 0.5);
  }
  map.on('rotate move zoom viewreset resize', updateCompass);
  el.addEventListener('touchend', () => requestAnimationFrame(updateCompass));
  compassBtn?.addEventListener('click', () => {
    if (canRotate) map.setBearing(0);
    requestAnimationFrame(updateCompass);
  });

  /** Diagramradius: ~38 % av korteste side av kartet, i meter. */
  function radiusMeters(lat, lon) {
    const size = map.getSize();
    const px = Math.min(size.x, size.y) * 0.34;
    const c = map.latLngToContainerPoint([lat, lon]);
    return map.distance([lat, lon], map.containerPointToLatLng([c.x + px, c.y]));
  }

  // Lagrekkefølge: timetall (markørlaget) < sol < opp/ned-tider
  const label = (latlng, cls, text, pane) => L.marker(latlng, {
    interactive: false, keyboard: false, ...(pane && hasPanes ? { pane } : {}),
    icon: L.divIcon({ className: '', html: `<span class="${cls}">${text}</span>`, iconSize: [0, 0] }),
  }).addTo(layer);

  function draw(d) {
    layer.clearLayers();
    const { lat, lon } = d.pos;
    const R = radiusMeters(lat, lon);

    // Horisontring og 30°/60°-ringer
    for (const alt of [0, 30, 60]) {
      const ring = [];
      for (let az = 0; az <= 360; az += 5) ring.push(polarPoint(lat, lon, az, alt, R));
      L.polyline(ring, { color: '#14191f', weight: alt === 0 ? 1.5 : 0.8, opacity: alt === 0 ? 0.7 : 0.35, dashArray: alt ? '2 6' : null, interactive: false }).addTo(layer);
    }

    // Vintersolverv (stiplet). Sommersolverv og terrengflaten vises bare i kameraet.
    for (const seg of pathSegments(d.winterPath, lat, lon, R)) {
      L.polyline(seg, { color: '#4F8FE0', weight: 2, dashArray: '6 6', opacity: 0.9, interactive: false }).addTo(layer);
    }

    // Valgt dato
    for (const seg of pathSegments(d.path, lat, lon, R)) {
      L.polyline(seg, { color: '#000', weight: 7, opacity: 0.25, interactive: false }).addTo(layer);
      L.polyline(seg, { color: COLORS.sun, weight: 4, interactive: false }).addTo(layer);
    }

    // Opp-/nedgang: stråle og etikett med minutter
    const ev = d.events;
    for (const [e, prefix] of [[ev.sunrise ?? ev.flatSunrise, 'Opp'], [ev.sunset ?? ev.flatSunset, 'Ned']]) {
      if (!e) continue;
      L.polyline([[lat, lon], rayPoint(lat, lon, e.azimuth, R * 1.12)], { color: '#E0A800', weight: 2.5, opacity: 0.95, interactive: false }).addTo(layer);
      label(rayPoint(lat, lon, e.azimuth, R * 1.2), 'event-label', eventLabel(prefix, e.time), 'solblikkTider');
    }

    // Timeperler (bare timer)
    for (const p of d.path) {
      if (p.altitude < 0 || p.time.getMinutes() !== 0) continue;
      label(polarPoint(lat, lon, p.azimuth, p.altitude, R), 'hour-label', String(p.time.getHours()).padStart(2, '0'));
    }

    // Himmelretninger
    for (const [az, name] of [[0, 'N'], [90, 'Ø'], [180, 'S'], [270, 'V']]) {
      label(polarPoint(lat, lon, az, -9, R), 'dir-label', name);
    }

    // Kalibreringspunkt
    if (d.landmark) {
      L.polyline([[lat, lon], [d.landmark.lat, d.landmark.lon]], { color: COLORS.terrain, weight: 1.5, dashArray: '4 6', interactive: false }).addTo(layer);
      L.marker([d.landmark.lat, d.landmark.lon], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="lm-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(layer);
    }

    // Posisjon
    L.marker([lat, lon], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="pos-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(layer);

    // Sola på valgt klokkeslett (følger tidsglideren). Grå når den står bak terrenget.
    const s = d.sunAt;
    if (s.apparentAltitude > -0.83) {
      const at = polarPoint(lat, lon, s.azimuth, Math.max(s.apparentAltitude, 0), R);
      L.polyline([[lat, lon], at], { color: '#E0A800', weight: 1.5, dashArray: '3 5', interactive: false }).addTo(layer);
      L.marker(at, {
        interactive: false, keyboard: false, ...(hasPanes ? { pane: 'solblikkSol' } : {}),
        icon: L.divIcon({ className: '', html: `<span class="sun-icon">${sunSvg(s.visible ? COLORS.sun : COLORS.grey)}</span>`, iconSize: [0, 0] }),
      }).addTo(layer);
    }
    updateCompass();
  }

  return {
    update(d) { last = d; draw(d); },
    invalidate() { map.invalidateSize(); if (last) draw(last); },
    center(lat, lon) { map.setView([lat, lon], Math.max(map.getZoom(), 14)); },
  };
}
