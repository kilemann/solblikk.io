// v0.2.2: zoom helt inn til 5 m-målestokk i kartmodus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metersPerPixel, scaleBarMeters, MAP_MAX_ZOOM, TILE_MAX_NATIVE_ZOOM } from '../js/mapgeo.js';
import { createMapView } from '../js/map-view.js';

const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m ?? ''} forventet ${b} ± ${tol}, fikk ${a}`);

test('metersPerPixel: Web Mercator, 156543 m/px ved ekvator på zoom 0', () => {
  near(metersPerPixel(0, 0), 156543.03, 0.01);
  near(metersPerPixel(60, 18), 156543.03 * 0.5 / 2 ** 18, 1e-6);
});

test('scaleBarMeters: samme avrunding som Leaflets målestokk (maks 100 px, 1/2/3/5 × 10ⁿ)', () => {
  assert.equal(scaleBarMeters(0.0788), 5);    // 7,88 m på 100 px → «5 m»
  assert.equal(scaleBarMeters(0.316), 30);    // 31,6 m → «30 m»
  assert.equal(scaleBarMeters(1.2), 100);
  assert.equal(scaleBarMeters(0.21), 20);
});

test('maks zoom gir målestokk på 5 m eller mindre overalt i Norge (58°–71° N)', () => {
  for (let lat = 58; lat <= 71; lat += 0.5) {
    const m = scaleBarMeters(metersPerPixel(lat, MAP_MAX_ZOOM));
    assert.ok(m <= 5, `${lat}° N: ${m} m`);
  }
  assert.equal(scaleBarMeters(metersPerPixel(58.1467, MAP_MAX_ZOOM)), 5, 'Kristiansand: «5 m»');
});

test('kartflisene hentes på nivå 18 og forstørres videre (Kartverket-flisene finnes til 18)', () => {
  assert.equal(TILE_MAX_NATIVE_ZOOM, 18);
  assert.ok(MAP_MAX_ZOOM > TILE_MAX_NATIVE_ZOOM);
});

test('kartet bruker maks zoom på både kart og fliselag', () => {
  const calls = {};
  const map = {
    setView() { return this; }, on() { return this; }, getSize: () => ({ x: 400, y: 600 }),
    getCenter: () => ({ lat: 58, lng: 8 }), latLngToContainerPoint: () => ({ x: 0, y: 0 }),
    containerPointToLatLng: () => [58, 8], distance: () => 1, invalidateSize() {}, getZoom: () => 14,
  };
  const chain = { addTo() { return this; } };
  const prev = globalThis.L;
  globalThis.L = {
    map: (el, o) => { calls.map = o; return map; },
    tileLayer: (u, o) => { calls.tile = o; return chain; },
    control: { scale: () => chain }, layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
  };
  try { createMapView({ addEventListener() {} }, {}); } finally { globalThis.L = prev; }
  assert.equal(calls.map.maxZoom, MAP_MAX_ZOOM);
  assert.equal(calls.tile.maxZoom, MAP_MAX_ZOOM);
  assert.equal(calls.tile.maxNativeZoom, TILE_MAX_NATIVE_ZOOM);
});
