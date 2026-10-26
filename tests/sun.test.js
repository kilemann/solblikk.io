// Solberegning – referanseverdier fra Meeus (Astronomical Algorithms, 2. utg.)
// og standard sfærisk astronomi. Toleransene er satt etter NOAA/Meeus-algoritmens
// kjente nøyaktighet (~0,01° i perioden 1800–2100).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  julianDay, solarPosition, refraction, equationOfTime,
  sunEvents, dayPath, solarNoon,
} from '../js/sun.js';

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} forventet ${b} ± ${tol}, fikk ${a}`);

const KRS = { lat: 58.1467, lon: 7.9956 };   // Kristiansand
const TROMSO = { lat: 69.6492, lon: 18.9553 };

test('julianDay: J2000.0 = 2451545.0', () => {
  near(julianDay(new Date(Date.UTC(2000, 0, 1, 12))), 2451545.0, 1e-9);
});

test('julianDay: Meeus eksempel 7.a (1957-10-04 19:26:24 UTC) = 2436116.31', () => {
  near(julianDay(new Date(Date.UTC(1957, 9, 4, 19, 26, 24))), 2436116.31, 1e-6);
});

test('solarPosition: Meeus eksempel 25.a – tilsynelatende deklinasjon og RA', () => {
  // 1992-10-13 00:00 TD. ΔT ≈ 59 s, så vi bruker UTC = TD − 59 s.
  const d = new Date(Date.UTC(1992, 9, 12, 23, 59, 1));
  const p = solarPosition(d, 0, 0);
  near(p.declination, -7.78507, 0.01, 'deklinasjon');
  near(p.rightAscension, 198.38083, 0.01, 'rektascensjon');
});

test('solarPosition: deklinasjon ved sommersolverv 2026 (21. juni 08:24 UTC) ≈ +23,436°', () => {
  near(solarPosition(new Date(Date.UTC(2026, 5, 21, 8, 24)), 0, 0).declination, 23.436, 0.02);
});

test('solarPosition: deklinasjon ved vårjevndøgn 2026 (20. mars 14:46 UTC) ≈ 0°', () => {
  near(solarPosition(new Date(Date.UTC(2026, 2, 20, 14, 46)), 0, 0).declination, 0, 0.05);
});

test('equationOfTime: ~ −14,2 min 11. feb og ~ +16,4 min 3. nov', () => {
  near(equationOfTime(new Date(Date.UTC(2026, 1, 11, 12))), -14.2, 0.3, 'feb');
  near(equationOfTime(new Date(Date.UTC(2026, 10, 3, 12))), 16.4, 0.3, 'nov');
});

test('solarNoon: Kristiansand 21. juni – sola i sør, høyde = 90 − φ + δ', () => {
  const noon = solarNoon(new Date(2026, 5, 21), KRS.lat, KRS.lon);
  const p = solarPosition(noon, KRS.lat, KRS.lon);
  near(p.azimuth, 180, 0.2, 'asimut');
  near(p.altitude, 90 - KRS.lat + 23.436, 0.1, 'høyde');
  // Sann soltid: middag ≈ 12:00 − 4 min/° · lon − likningen. Rundt 11:29 UTC.
  near(noon.getUTCHours() + noon.getUTCMinutes() / 60, 12 - KRS.lon / 15 + 0.03, 0.05, 'klokkeslett UTC');
});

test('refraction: ved sann høyde −0,567° løfter brytningen sola til ≈ 0°', () => {
  near(refraction(-0.567), 0.57, 0.02);
  near(refraction(45), 0.0162, 0.002);  // ~1′ ved 45°
  assert.equal(refraction(-5), 0);
});

test('sunEvents: Kristiansand 21. juni, flat horisont – oppgang i NØ (~39°) og dag ≈ 18,23 t', () => {
  const ev = sunEvents(new Date(2026, 5, 21), KRS.lat, KRS.lon);
  assert.equal(ev.type, 'normal');
  near(ev.sunrise.azimuth, 39.0, 0.5, 'oppgangsasimut');
  near(ev.sunset.azimuth, 321.0, 0.5, 'nedgangsasimut');
  const hours = (ev.sunset.time - ev.sunrise.time) / 3.6e6;
  near(hours, 18.23, 0.05, 'daglengde');
  near(ev.maxAltitude, 55.29, 0.1, 'maks høyde');
});

test('sunEvents: Tromsø har midnattssol 21. juni og mørketid 21. desember', () => {
  assert.equal(sunEvents(new Date(2026, 5, 21), TROMSO.lat, TROMSO.lon).type, 'polar-day');
  assert.equal(sunEvents(new Date(2026, 11, 21), TROMSO.lat, TROMSO.lon).type, 'polar-night');
});

test('sunEvents: terrenghorisont på 10° gir senere oppgang og tidligere nedgang', () => {
  const day = new Date(2026, 4, 20);
  const flat = sunEvents(day, KRS.lat, KRS.lon);
  const hilly = sunEvents(day, KRS.lat, KRS.lon, { horizon: () => 10 });
  assert.equal(hilly.type, 'normal');
  assert.ok(hilly.sunrise.time > flat.sunrise.time, 'oppgang senere');
  assert.ok(hilly.sunset.time < flat.sunset.time, 'nedgang tidligere');
  assert.ok(hilly.sunHours < flat.sunHours, 'færre soltimer');
});

test('sunEvents: fjellvegg på 60° rundt Kristiansand gir ingen direkte sol i juni', () => {
  const ev = sunEvents(new Date(2026, 5, 21), KRS.lat, KRS.lon, { horizon: () => 60 });
  assert.equal(ev.type, 'no-sun');
  assert.equal(ev.sunHours, 0);
});

test('sunEvents: fjell bare i øst – sola kan gå opp, bak og fram igjen (flere perioder)', () => {
  // Smal topp på 50° ved asimut 100–120° (sola står 34–44° der) skygger om formiddagen.
  const horizon = (az) => (az >= 100 && az <= 120 ? 50 : 0);
  const ev = sunEvents(new Date(2026, 5, 21), KRS.lat, KRS.lon, { horizon });
  assert.ok(ev.periods.length >= 2, `forventet ≥2 solperioder, fikk ${ev.periods.length}`);
});

test('dayPath: punkter fra midnatt til midnatt, asimut 0–360 og kontinuerlig tid', () => {
  const path = dayPath(new Date(2026, 4, 20), KRS.lat, KRS.lon, 10);
  assert.equal(path.length, 24 * 6 + 1);
  for (const p of path) {
    assert.ok(p.azimuth >= 0 && p.azimuth < 360);
    assert.ok(p.altitude > -90 && p.altitude < 90);
  }
  assert.equal(path[1].time - path[0].time, 10 * 60000);
});
