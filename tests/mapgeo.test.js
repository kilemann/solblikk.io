import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polarPoint, pathSegments, rayPoint } from '../js/mapgeo.js';
import { distanceBetween, bearingBetween } from '../js/horizon.js';

const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m ?? ''} forventet ${b} ± ${tol}, fikk ${a}`);
const C = { lat: 58.15, lon: 8.0 };

test('polarPoint: høyde 90° = sentrum, høyde 0° = full radius i riktig retning', () => {
  const top = polarPoint(C.lat, C.lon, 123, 90, 1000);
  near(distanceBetween(C.lat, C.lon, top[0], top[1]), 0, 0.01);
  const east = polarPoint(C.lat, C.lon, 90, 0, 1000);
  near(distanceBetween(C.lat, C.lon, east[0], east[1]), 1000, 0.5);
  near(bearingBetween(C.lat, C.lon, east[0], east[1]), 90, 0.01);
  const mid = polarPoint(C.lat, C.lon, 180, 45, 1000);
  near(distanceBetween(C.lat, C.lon, mid[0], mid[1]), 500, 0.5);
});

test('pathSegments: deler banen der sola går under horisonten', () => {
  const path = [
    { azimuth: 10, altitude: -5 }, { azimuth: 40, altitude: 1 }, { azimuth: 90, altitude: 20 },
    { azimuth: 180, altitude: 40 }, { azimuth: 270, altitude: 20 }, { azimuth: 320, altitude: -1 },
  ];
  const segs = pathSegments(path, C.lat, C.lon, 1000);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].length, 4);
});

test('pathSegments: midnattssol gir én sammenhengende bane', () => {
  const path = Array.from({ length: 25 }, (_, i) => ({ azimuth: i * 15, altitude: 5 + i }));
  assert.equal(pathSegments(path, C.lat, C.lon, 1000).length, 1);
});

test('rayPoint: stråle i gitt asimut og lengde', () => {
  const p = rayPoint(C.lat, C.lon, 39, 2000);
  near(distanceBetween(C.lat, C.lon, p[0], p[1]), 2000, 0.5);
  near(bearingBetween(C.lat, C.lon, p[0], p[1]), 39, 0.01);
});
