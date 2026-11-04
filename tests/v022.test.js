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

// ---------- v0.2.3 ----------
import { timeOnDate } from '../js/format.js';
import { fetchHorizon, SAMPLE_DISTANCES } from '../js/horizon.js';
import { readFileSync } from 'node:fs';

test('timeOnDate: glideren viser riktig klokkeslett også når klokka stilles', () => {
  for (const d of [new Date(2026, 2, 29), new Date(2026, 9, 25), new Date(2026, 4, 20)]) {
    const t = timeOnDate(d, 720);
    assert.equal(t.getHours(), 12); assert.equal(t.getMinutes(), 0); assert.equal(t.getDate(), d.getDate());
  }
  assert.equal(timeOnDate(new Date(2026, 9, 25), 23 * 60 + 55).getHours(), 23);
});

const okRes = (url) => {
  const n = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('punkter'))).length;
  return { ok: true, status: 200, json: async () => ({ punkter: Array.from({ length: n }, () => ({ z: 0 })) }) };
};

test('fetchHorizon: prøver på nytt ved nettfeil og 503, og lykkes', async () => {
  const tries = new Map();
  const fetchFn = async (url) => {
    const k = (tries.get(url) ?? 0) + 1; tries.set(url, k);
    if (k === 1) throw new TypeError('Failed to fetch');
    if (k === 2) return { ok: false, status: 503 };
    return okRes(url);
  };
  const h = await fetchHorizon(58.15, 8.0, { fetchFn, azStep: 90, retryDelays: [1, 1] });
  assert.equal(h.angles.length, 4);
  assert.ok([...tries.values()].every((n) => n === 3));
});

test('fetchHorizon: gir opp etter siste forsøk, og prøver ikke igjen ved 400', async () => {
  let calls = 0;
  await assert.rejects(fetchHorizon(58.15, 8.0, { fetchFn: async () => { calls++; return { ok: false, status: 503 }; }, azStep: 90, concurrency: 1, retryDelays: [1, 1] }), /503/);
  const batches = Math.ceil((1 + 4 * SAMPLE_DISTANCES.length) / 50);
  assert.ok(calls <= 3 * batches && calls >= 3);
  calls = 0;
  await assert.rejects(fetchHorizon(58.15, 8.0, { fetchFn: async () => { calls++; return { ok: false, status: 400 }; }, azStep: 90, concurrency: 1, retryDelays: [1, 1] }), /400/);
  assert.equal(calls, 1);
});

test('fetchHorizon: avbrytes under venting på nytt forsøk', async () => {
  const ctrl = new AbortController();
  const p = fetchHorizon(58.15, 8.0, { fetchFn: async () => ({ ok: false, status: 503 }), azStep: 90, concurrency: 1, signal: ctrl.signal, retryDelays: [5000] });
  setTimeout(() => ctrl.abort(), 20);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('service worker: henter fliser med CORS og faller tilbake, og skallet hentes ferskt', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /mode: 'cors'/);
  assert.match(sw, /return fetch\(request\);/);
  assert.match(sw, /cache: 'reload'/);
  assert.match(sw, /cache: 'no-cache'/);
});
