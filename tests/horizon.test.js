// Terrenghorisont fra Kartverkets høyde-API (punkt, koordsys=4326).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  destinationPoint, distanceBetween, bearingBetween, SAMPLE_DISTANCES,
  horizonFromProfile, buildHorizonPoints, fetchHorizon, horizonAt,
  parseElevations, horizonCacheKey,
} from '../js/horizon.js';

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} forventet ${b} ± ${tol}, fikk ${a}`);

test('destinationPoint: 1° breddegrad nordover ≈ 111,195 km', () => {
  const [lon, lat] = destinationPoint(60, 10, 0, 111195);
  near(lat, 61, 1e-3); near(lon, 10, 1e-9);
});

test('destinationPoint og distanceBetween er inverse', () => {
  const [lon, lat] = destinationPoint(58.15, 8.0, 137, 12345);
  near(distanceBetween(58.15, 8.0, lat, lon), 12345, 0.5);
});

test('bearingBetween: ekvator østover = 90°, meridian nordover = 0°', () => {
  near(bearingBetween(0, 0, 0, 1), 90, 1e-9);
  near(bearingBetween(0, 0, 1, 0), 0, 1e-9);
  near(bearingBetween(60, 10, 59, 10), 180, 1e-9);
});

test('horizonFromProfile: flatt hav – kimmingsdukkert for 1,6 m øyehøyde ≈ −0,038°', () => {
  const z = SAMPLE_DISTANCES.map(() => 0);
  const a = horizonFromProfile(0, z, SAMPLE_DISTANCES, { eye: 1.6 });
  near(a.angle, -0.038, 0.006);
});

test('horizonFromProfile: 500 m høy topp 2 km unna gir ≈ 14°', () => {
  const dists = [500, 1000, 2000, 4000];
  const z = [0, 0, 500, 0];
  const a = horizonFromProfile(0, z, dists, { eye: 0 });
  near(a.angle, Math.atan((500 - 2000 * 2000 * 0.87 / (2 * 6371000)) / 2000) * 180 / Math.PI, 1e-9);
  assert.equal(a.distance, 2000);
});

test('horizonFromProfile: manglende høyder (null) teller som havnivå', () => {
  const a = horizonFromProfile(10, [null, null], [1000, 2000], { eye: 0 });
  assert.ok(a.angle < 0);
});

test('buildHorizonPoints: observatør + asimuter × avstander, [lon,lat]-rekkefølge', () => {
  const pts = buildHorizonPoints(58.15, 8.0, 30);
  assert.equal(pts.length, 1 + 12 * SAMPLE_DISTANCES.length);
  assert.deepEqual(pts[0], [8.0, 58.15]);
});

test('parseElevations: leser z fra {punkter:[{z}]}', () => {
  assert.deepEqual(parseElevations({ punkter: [{ x: 1, y: 2, z: 12.5 }, { z: null }] }), [12.5, null]);
  assert.throws(() => parseElevations({}), /punkter/);
});

test('fetchHorizon: deler opp i forespørsler på ≤ 50 punkter med riktig URL', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    const n = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('punkter'))).length;
    return { ok: true, json: async () => ({ punkter: Array.from({ length: n }, () => ({ z: 0 })) }) };
  };
  const progress = [];
  const h = await fetchHorizon(58.15, 8.0, { fetchFn, azStep: 30, onProgress: (f) => progress.push(f) });
  const totalPts = 1 + 12 * SAMPLE_DISTANCES.length;
  assert.equal(urls.length, Math.ceil(totalPts / 50));
  const u = new URL(urls[0]);
  assert.equal(u.origin + u.pathname, 'https://ws.geonorge.no/hoydedata/v1/punkt');
  assert.equal(u.searchParams.get('koordsys'), '4326');
  assert.equal(u.searchParams.get('geojson'), 'false');
  assert.equal(h.angles.length, 12);
  assert.equal(h.azStep, 30);
  assert.equal(progress.at(-1), 1);
  h.angles.forEach((a) => assert.ok(a < 0 && a > -0.1));
});

test('fetchHorizon: HTTP-feil gir forståelig feilmelding', async () => {
  const fetchFn = async () => ({ ok: false, status: 503 });
  await assert.rejects(fetchHorizon(58.15, 8.0, { fetchFn, azStep: 90 }), /503/);
});

test('horizonAt: lineær interpolasjon og sømløs overgang 359° → 0°', () => {
  const h = { azStep: 90, angles: [10, 20, 30, 40] };   // N, Ø, S, V
  near(horizonAt(h, 45), 15, 1e-9);
  near(horizonAt(h, 315), 25, 1e-9);                     // mellom V(40) og N(10)
  near(horizonAt(h, 360), 10, 1e-9);
  near(horizonAt(null, 123), 0, 1e-9);                   // ingen data → flat horisont
});

test('horizonCacheKey: avrunder til ~10 m', () => {
  assert.equal(horizonCacheKey(58.146712, 7.995634), horizonCacheKey(58.14674, 7.99561));
});
