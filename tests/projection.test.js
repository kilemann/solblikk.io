// Orientering og projeksjon. Rotasjonsmatrisen følger W3C DeviceOrientation
// (Z-X'-Y'', alpha mot klokka sett ovenfra), jordramme x=øst, y=nord, z=opp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rotationMatrix, cameraDirection, worldVector, projectToScreen,
  focalLength, orthonormalize, smoothMatrix, compassFromAlpha, normAz,
} from '../js/projection.js';

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} forventet ${b} ± ${tol}, fikk ${a}`);
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('rotationMatrix(0,0,0) er identitet', () => {
  const R = rotationMatrix(0, 0, 0);
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  R.forEach((v, i) => near(v, I[i], 1e-12));
});

test('cameraDirection: telefon oppreist, toppen mot himmelen, kamera mot nord', () => {
  const d = cameraDirection(rotationMatrix(0, 90, 0));
  assert.ok(angDiff(d.azimuth, 0) < 1e-6, `asimut ${d.azimuth}`);
  near(d.altitude, 0, 1e-6);
});

test('cameraDirection: alpha=270 (snudd mot klokka 270°) peker mot øst', () => {
  const d = cameraDirection(rotationMatrix(270, 90, 0));
  near(d.azimuth, 90, 1e-6);
});

test('cameraDirection: beta=135 – kamera vippet 45° opp', () => {
  const d = cameraDirection(rotationMatrix(0, 135, 0));
  near(d.altitude, 45, 1e-6);
  assert.ok(angDiff(d.azimuth, 0) < 1e-6);
});

test('compassFromAlpha: kompasskurs = 360 − alpha', () => {
  near(compassFromAlpha(0), 0, 1e-12);
  near(compassFromAlpha(270), 90, 1e-12);
  near(compassFromAlpha(90), 270, 1e-12);
});

test('normAz holder vinkler i [0, 360)', () => {
  assert.equal(normAz(-10), 350);
  assert.equal(normAz(370), 10);
  assert.equal(normAz(360), 0);
});

test('worldVector: asimut 90, høyde 0 = (1,0,0)', () => {
  const v = worldVector(90, 0);
  near(v[0], 1, 1e-12); near(v[1], 0, 1e-12); near(v[2], 0, 1e-12);
});

test('focalLength: 60° horisontalt synsfelt på 400 px bredde', () => {
  near(focalLength(400, 60), 200 / Math.tan(Math.PI / 6), 1e-9);
});

test('projectToScreen: punkt rett fram havner midt på skjermen', () => {
  const R = rotationMatrix(0, 90, 0);
  const s = projectToScreen(R, 0, 0, { width: 400, height: 800, hfov: 60 });
  near(s.x, 200, 1e-6); near(s.y, 400, 1e-6);
});

test('projectToScreen: 10° opp havner f·tan(10°) over midten', () => {
  const R = rotationMatrix(0, 90, 0);
  const view = { width: 400, height: 800, hfov: 60 };
  const s = projectToScreen(R, 0, 10, view);
  near(s.y, 400 - focalLength(400, 60) * Math.tan(10 * Math.PI / 180), 1e-6);
  near(s.x, 200, 1e-6);
});

test('projectToScreen: 10° til høyre (øst) havner til høyre for midten', () => {
  const R = rotationMatrix(0, 90, 0);
  const s = projectToScreen(R, 10, 0, { width: 400, height: 800, hfov: 60 });
  assert.ok(s.x > 200);
  near(s.y, 400, 1e-6);
});

test('projectToScreen: punkt bak kameraet gir null', () => {
  const R = rotationMatrix(0, 90, 0);
  assert.equal(projectToScreen(R, 180, 0, { width: 400, height: 800, hfov: 60 }), null);
});

test('projectToScreen: kalibrering – headingOffset flytter verden', () => {
  // Sensoren tror kamera peker mot nord, men egentlig mot 5° (misvisning +5°).
  // Med offset +5 skal et mål på asimut 5° havne midt på skjermen.
  const R = rotationMatrix(0, 90, 0);
  const s = projectToScreen(R, 5, 0, { width: 400, height: 800, hfov: 60, headingOffset: 5 });
  near(s.x, 200, 1e-6);
});

test('projectToScreen: liggende skjerm (90°) roterer bildet', () => {
  // Telefon dreid 90° mot klokka (landskap): enhetens +X peker opp, toppen mot nord.
  // Alpha=0, beta=0, gamma=−90 → kamera (−Z) peker horisontalt mot øst.
  const R = rotationMatrix(0, 0, -90);
  const d = cameraDirection(R);
  near(d.altitude, 0, 1e-6);
  const view = { width: 800, height: 400, hfov: 60, screenAngle: 90 };
  const up = projectToScreen(R, d.azimuth, 10, view);
  near(up.x, 400, 1e-6);
  assert.ok(up.y < 200, `punkt over horisonten skal være over midten, y=${up.y}`);
});

test('orthonormalize gir ortonormal matrise', () => {
  const M = orthonormalize([1.1, 0.1, 0, 0.05, 0.9, 0.02, 0, 0.03, 1.05]);
  const col = (j) => [M[j], M[3 + j], M[6 + j]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let i = 0; i < 3; i++) {
    near(dot(col(i), col(i)), 1, 1e-9);
    for (let j = i + 1; j < 3; j++) near(dot(col(i), col(j)), 0, 1e-9);
  }
});

test('smoothMatrix: glatter mot ny matrise uten å hoppe ved 0/360-overgang', () => {
  const a = rotationMatrix(359, 90, 0);
  const b = rotationMatrix(1, 90, 0);
  const m = smoothMatrix(a, b, 0.5);
  const d = cameraDirection(m);
  assert.ok(angDiff(d.azimuth, 0) < 0.01, `asimut ${d.azimuth}`);
});

import { calibrationOffset } from '../js/projection.js';

test('calibrationOffset: sann asimut − målt asimut, normalisert til (−180, 180]', () => {
  near(calibrationOffset(185, 180), 5, 1e-12);
  near(calibrationOffset(2, 358), 4, 1e-12);
  near(calibrationOffset(358, 2), -4, 1e-12);
  near(calibrationOffset(90, 270), 180, 1e-12);
});

test('calibrationOffset + projectToScreen: kalibrert mål havner i midten', () => {
  const R = rotationMatrix(20, 95, 3);        // vilkårlig holdning
  const cam = cameraDirection(R);
  const sunAz = 213.4;                         // sola står egentlig her
  const off = calibrationOffset(sunAz, cam.azimuth);
  const s = projectToScreen(R, sunAz, cam.altitude, { width: 400, height: 800, hfov: 60, headingOffset: off });
  near(s.x, 200, 1e-6); near(s.y, 400, 1e-6);
});
