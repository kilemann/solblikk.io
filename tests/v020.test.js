// v0.2.0: dagsglider, kartrotasjon, etiketter og solteksten på én linje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dayOfYear, dateFromDayOfYear, daysInYear, monthLengths, eventLabel, sunNowText,
} from '../js/format.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('daysInYear: skuddår har 366 dager', () => {
  assert.equal(daysInYear(2026), 365);
  assert.equal(daysInYear(2028), 366);
  assert.equal(daysInYear(2100), 365);
  assert.equal(daysInYear(2000), 366);
});

test('dayOfYear: 1. jan = 1, 20. mai = 140, 31. des = 365/366', () => {
  assert.equal(dayOfYear(new Date(2026, 0, 1)), 1);
  assert.equal(dayOfYear(new Date(2026, 4, 20)), 140);
  assert.equal(dayOfYear(new Date(2026, 11, 31)), 365);
  assert.equal(dayOfYear(new Date(2028, 11, 31)), 366);
});

test('dayOfYear er upåvirket av sommertid (29. mars og 25. okt. 2026)', () => {
  assert.equal(dayOfYear(new Date(2026, 2, 30)) - dayOfYear(new Date(2026, 2, 29)), 1);
  assert.equal(dayOfYear(new Date(2026, 9, 26)) - dayOfYear(new Date(2026, 9, 25)), 1);
});

test('dateFromDayOfYear er inversen av dayOfYear og gir lokal midnatt', () => {
  for (const y of [2026, 2028]) {
    for (let d = 1; d <= daysInYear(y); d++) {
      const dt = dateFromDayOfYear(y, d);
      assert.equal(dayOfYear(dt), d);
      assert.equal(dt.getFullYear(), y);
      assert.equal(dt.getHours(), 0);
    }
  }
});

test('dateFromDayOfYear klemmer verdier utenfor året', () => {
  assert.equal(dayOfYear(dateFromDayOfYear(2026, 0)), 1);
  assert.equal(dayOfYear(dateFromDayOfYear(2026, 400)), 365);
});

test('monthLengths: tolv måneder som summerer til årets dager', () => {
  assert.deepEqual(monthLengths(2026), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  assert.equal(monthLengths(2028)[1], 29);
  assert.equal(monthLengths(2028).reduce((a, b) => a + b), 366);
});

test('eventLabel: opp/ned med timer og minutter', () => {
  assert.equal(eventLabel('Opp', new Date(2026, 4, 20, 4, 57)), 'Opp 04:57');
  assert.equal(eventLabel('Ned', new Date(2026, 4, 20, 21, 53)), 'Ned 21:53');
  assert.equal(eventLabel('Opp', null), null);
});

test('sunNowText: kort tekst for sol over, bak terreng og under horisonten', () => {
  assert.equal(sunNowText({ azimuth: 215.2, apparentAltitude: 48.13, altitude: 48.1 }, true),
    'Sola i SV 215°, 48,1° over horisonten');
  assert.equal(sunNowText({ azimuth: 285, apparentAltitude: 14.44, altitude: 14.4 }, false),
    'Sola i V 285°, 14,4° over horisonten, bak terrenget');
  assert.equal(sunNowText({ azimuth: 5, apparentAltitude: -12.3, altitude: -12.3 }, false),
    'Sola under horisonten (−12,3°), N 5°');
});

test('sunNowText: lengste variant holder seg på én linje (≤ 52 tegn)', () => {
  const t = sunNowText({ azimuth: 315, apparentAltitude: 89.94, altitude: 89.9 }, false);
  assert.ok(t.length <= 52, `${t.length}: ${t}`);
});

test('index.html: dagsglider under logo og dato, kompassknapp og leaflet-rotate', () => {
  const html = read('index.html');
  assert.match(html, /<input type="range" id="daySlider"/);
  assert.ok(html.indexOf('id="daySlider"') < html.indexOf('</header>'), 'dagsglideren skal ligge i toppfeltet');
  assert.ok(html.indexOf('id="dateLabel"') < html.indexOf('id="daySlider"'), 'glideren skal ligge under dato');
  assert.match(html, /id="compassBtn"/);
  assert.match(html, /https:\/\/unpkg\.com\/leaflet-rotate@\d+\.\d+\.\d+\/dist\/leaflet-rotate\.js/);
  assert.ok(html.indexOf('leaflet.js') < html.indexOf('leaflet-rotate.js'), 'leaflet-rotate må lastes etter Leaflet');
});

test('service worker lagrer leaflet-rotate offline', () => {
  const m = read('index.html').match(/https:\/\/unpkg\.com\/leaflet-rotate@[\d.]+\/dist\/leaflet-rotate\.js/)[0];
  assert.ok(read('sw.js').includes(`'${m}'`));
});

test('CSS: solteksten bryter aldri over to linjer', () => {
  const css = read('css/app.css');
  const rule = css.match(/\.sun-now\s*\{[^}]*\}/)[0];
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /text-overflow:\s*ellipsis/);
});

test('CSS: ikonstørrelsen gjelder bare egne ikoner, ikke Leaflets tegneflate (svg)', () => {
  const css = read('css/app.css');
  assert.doesNotMatch(css, /(^|\n|\})\s*svg\s*\{/, 'en generell «svg { … }»-regel krymper kartets linjer til 22 px');
});

test('Kart-hintet er kort nok til én linje', () => {
  const html = read('index.html');
  const hint = html.match(/<p class="map-hint" id="mapHint">([^<]*)<\/p>/)[1];
  assert.ok(hint.length <= 34, `${hint.length}: ${hint}`);
});
