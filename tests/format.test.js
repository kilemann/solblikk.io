import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTime, fmtDuration, compassName, fmtDateLong, toDateInput, fromDateInput } from '../js/format.js';
import { effectiveHfov } from '../js/projection.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `forventet ${b} ± ${tol}, fikk ${a}`);

test('fmtTime: 24-timers klokke med ledende null', () => {
  assert.equal(fmtTime(new Date(2026, 4, 20, 4, 7)), '04:07');
  assert.equal(fmtTime(null), '–');
});

test('fmtDuration: timer og minutter', () => {
  assert.equal(fmtDuration(18.2333), '18 t 14 min');
  assert.equal(fmtDuration(0), '0 t 0 min');
  assert.equal(fmtDuration(24), '24 t 0 min');
});

test('compassName: åtte hovedretninger på norsk', () => {
  assert.equal(compassName(0), 'N');
  assert.equal(compassName(44), 'NØ');
  assert.equal(compassName(90), 'Ø');
  assert.equal(compassName(225), 'SV');
  assert.equal(compassName(338), 'N');
  assert.equal(compassName(337), 'NV');
});

test('fmtDateLong: norsk dato', () => {
  assert.equal(fmtDateLong(new Date(2026, 4, 20)), 'onsdag 20. mai 2026');
});

test('toDateInput / fromDateInput: lokal dato uten tidssoneforskyvning', () => {
  assert.equal(toDateInput(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  const d = fromDateInput('2026-05-20');
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 4); assert.equal(d.getDate(), 20);
});

test('effectiveHfov: portrettvideo 3:4 beskåret til høy skjerm', () => {
  // Lang side (1920 px, vertikal) har 65° synsfelt. Skjerm 400×866, object-fit: cover.
  const scale = Math.max(400 / 1440, 866 / 1920);
  const f = (960 / Math.tan(32.5 * Math.PI / 180)) * scale;
  const expected = 2 * Math.atan(200 / f) * 180 / Math.PI;
  near(effectiveHfov(65, 1440, 1920, 400, 866), expected, 1e-9);
  near(expected, 32.8, 0.2);
});

test('effectiveHfov: uten videomål antas 4:3-sensor langs skjermens lange side', () => {
  near(effectiveHfov(65, 0, 0, 400, 866), effectiveHfov(65, 1440, 1920, 400, 866), 1e-9);
  near(effectiveHfov(65, 0, 0, 866, 400), effectiveHfov(65, 1920, 1440, 866, 400), 1e-9);
});
