// v0.2.1: rolig rotasjon, stabile opp/ned-tider, etiketter foran timetall, færre sirkler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunEvents } from '../js/sun.js';
import { createRotationGate } from '../js/rotation.js';
import { createMapView } from '../js/map-view.js';

const KRS = { lat: 58.1467, lon: 7.9956 };
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m ?? ''} forventet ${b} ± ${tol}, fikk ${a}`);

// ---------- Soloppgang/-nedgang: korte glimt teller ikke ----------
test('sunEvents: et kort glimt gjennom et smalt skar flytter ikke soloppgangen', () => {
  // Høy ås (30°) rundt hele horisonten, med et 1,5° bredt skar i nordøst der sola lavt over horisonten
  // titter fram noen minutter tidlig om morgenen.
  const horizon = (az) => (az >= 60 && az <= 61.5 ? 0 : 30);
  const ev = sunEvents(new Date(2026, 4, 20), KRS.lat, KRS.lon, { horizon });
  assert.ok(ev.periods.length >= 2, 'skal ha en kort periode i skaret og en lang midt på dagen');
  const glimt = ev.periods[0];
  assert.ok((glimt.end - glimt.start) < 10 * 60000, 'første periode er et kort glimt');
  assert.ok(ev.sunrise.time >= ev.periods[1].start, `soloppgang ${ev.sunrise.time.toTimeString()} skal være hovedperioden, ikke glimtet`);
  assert.ok(ev.sunrise.altitude > 25, 'sola står over åsen ved soloppgang');
});

test('sunEvents: kort glimt om kvelden flytter ikke solnedgangen', () => {
  const horizon = (az) => (az >= 298 && az <= 299.5 ? 0 : 30);
  const ev = sunEvents(new Date(2026, 4, 20), KRS.lat, KRS.lon, { horizon });
  const last = ev.periods.at(-1);
  assert.ok((last.end - last.start) < 10 * 60000);
  assert.ok(ev.sunset.time <= ev.periods.at(-2).end, 'solnedgang skal være slutten av hovedperioden');
});

test('sunEvents: glimtene teller fortsatt med i timer med direkte sol', () => {
  const horizon = (az) => (az >= 60 && az <= 61.5 ? 0 : 30);
  const ev = sunEvents(new Date(2026, 4, 20), KRS.lat, KRS.lon, { horizon });
  const total = ev.periods.reduce((s, p) => s + (p.end - p.start), 0) / 3.6e6;
  near(ev.sunHours, total, 1e-9);
});

test('sunEvents: bare korte glimt hele dagen gir likevel opp/ned (første og siste)', () => {
  const horizon = (az) => ((az >= 100 && az <= 101) || (az >= 250 && az <= 251) ? 0 : 89);
  const ev = sunEvents(new Date(2026, 4, 20), KRS.lat, KRS.lon, { horizon });
  assert.ok(ev.periods.length >= 1);
  assert.ok(ev.sunrise && ev.sunset);
  assert.ok(ev.sunrise.time < ev.sunset.time);
});

test('sunEvents: flat horisont er uendret', () => {
  const ev = sunEvents(new Date(2026, 5, 21), KRS.lat, KRS.lon);
  near(ev.sunrise.azimuth, 39.0, 0.5);
  near((ev.sunset.time - ev.sunrise.time) / 3.6e6, 18.23, 0.05);
});

// ---------- Rotasjon med dødsone ----------
test('rotasjon: under 15° vridning roterer ikke kartet', () => {
  const g = createRotationGate({ threshold: 15 });
  g.start(0);
  assert.equal(g.filter(5), 0);
  assert.equal(g.filter(-14), 0);
  assert.equal(g.filter(355), 0);       // −5° via 0/360
});

test('rotasjon: etter terskelen følger kartet uten hopp', () => {
  const g = createRotationGate({ threshold: 15 });
  g.start(100);
  assert.equal(g.filter(114), 100);
  near(g.filter(116), 101, 1e-9);       // låst opp: 1° etter terskelen
  near(g.filter(130), 115, 1e-9);
  near(g.filter(110), 95, 1e-9);        // tilbake: følger fortsatt, uten ny terskel
});

test('rotasjon: mot klokka fungerer likt', () => {
  const g = createRotationGate({ threshold: 15 });
  g.start(10);
  assert.equal(g.filter(0), 10);
  near(g.filter(350), 5, 1e-9);         // −20° vridning → −5° etter terskel → 10 − 5 = 5°
  near(g.filter(330), 345, 1e-9);       // −40° vridning → −25° → 10 − 25 = 345°
});

test('rotasjon: ny gest starter med ny terskel', () => {
  const g = createRotationGate({ threshold: 15 });
  g.start(0); g.filter(40); g.end();
  g.start(25);
  assert.equal(g.filter(35), 25);
});

test('rotasjon: utenfor gest slippes verdien rett gjennom (kompassknappen)', () => {
  const g = createRotationGate({ threshold: 15 });
  assert.equal(g.filter(0), 0);
  assert.equal(g.filter(123), 123);
});

// ---------- Kartet: falsk Leaflet ----------
function fakeLeaflet() {
  const added = [];
  const layer = (kind, args) => {
    const l = { kind, args, addTo() { added.push(this); return this; } };
    return l;
  };
  const handlers = {};
  const calls = { setBearing: [] };
  let bearing = 0;
  const map = {
    setView() { return this; }, on(ev, fn) { for (const e of ev.split(' ')) (handlers[e] ??= []).push(fn); return this; },
    getSize: () => ({ x: 400, y: 600 }), getCenter: () => ({ lat: 58.1467, lng: 7.9956 }),
    latLngToContainerPoint: (ll) => { const [la, lo] = Array.isArray(ll) ? ll : [ll.lat, ll.lng]; return { x: 200 + (lo - 7.9956) * 5e4, y: 300 - (la - 58.1467) * 1e5 }; },
    containerPointToLatLng: ([x, y]) => [58.1467 - (y - 300) / 1e5, 7.9956 + (x - 200) / 5e4],
    distance: () => 1000, invalidateSize() {}, getZoom: () => 14,
    setBearing(b) { calls.setBearing.push(b); bearing = b; }, getBearing: () => bearing,
    _panes: { markerPane: { style: { zIndex: '600' } }, norotatePane: { style: {} } },
    createPane(name, parent) { this._panes[name] = { style: {}, parent }; return this._panes[name]; },
    getPane(name) { return this._panes[name]; },
  };
  const L = {
    map: () => map,
    tileLayer: (...a) => layer('tile', a), control: { scale: (...a) => layer('scale', a) },
    layerGroup: () => ({ addTo() { return this; }, clearLayers() { added.length = 0; } }),
    polyline: (...a) => layer('polyline', a), polygon: (...a) => layer('polygon', a),
    marker: (...a) => layer('marker', a), circleMarker: (...a) => layer('circle', a),
    divIcon: (o) => o,
  };
  return { L, added, map, calls, handlers };
}
function fakeEl() {
  const ls = {};
  return { addEventListener(t, f) { (ls[t] ??= []).push(f); }, fire(t, ev) { (ls[t] || []).forEach((f) => f(ev)); }, innerHTML: '' };
}
function sampleData() {
  const day = new Date(2026, 4, 20);
  const path = []; for (let h = 0; h <= 24; h++) path.push({ time: new Date(2026, 4, 20, h), azimuth: (h * 15 + 180) % 360, altitude: h > 5 && h < 21 ? 20 : -5, apparentAltitude: 20 });
  return {
    pos: KRS, horizon: { azStep: 90, angles: [5, 5, 5, 5] }, path,
    summerPath: path.map((p) => ({ ...p, altitude: p.altitude + 5 })), winterPath: path.map((p) => ({ ...p, altitude: p.altitude - 10 })),
    events: sunEvents(day, KRS.lat, KRS.lon), sunAt: { azimuth: 200, altitude: 30, apparentAltitude: 30, visible: true }, landmark: null,
  };
}
function withFake(fn) {
  const f = fakeLeaflet();
  const prevL = globalThis.L, prevRaf = globalThis.requestAnimationFrame;
  globalThis.L = f.L; globalThis.requestAnimationFrame = (cb) => cb();
  try { return fn(f); } finally { globalThis.L = prevL; globalThis.requestAnimationFrame = prevRaf; }
}

test('kart: ingen rødstiplet sommersolvervsirkel', () => withFake((f) => {
  const v = createMapView(fakeEl(), {});
  v.update(sampleData());
  const red = f.added.filter((l) => l.kind === 'polyline' && l.args[1]?.color === '#FF8A5B');
  assert.equal(red.length, 0);
}));

test('kart: ingen grønn terrengsirkel', () => withFake((f) => {
  const v = createMapView(fakeEl(), {});
  v.update(sampleData());
  assert.equal(f.added.filter((l) => l.kind === 'polygon').length, 0);
  const green = f.added.filter((l) => /^#(2E9E5E|6FCF97)$/i.test(l.args[1]?.color ?? '') && l.kind !== 'marker' && !l.args[1]?.dashArray);
  assert.equal(green.length, 0);
}));

test('kart: opp/ned-etikettene ligger foran timetallene og sola (egne kartlag)', () => withFake((f) => {
  const v = createMapView(fakeEl(), {});
  v.update(sampleData());
  const paneOf = (cls) => f.added.filter((l) => l.kind === 'marker' && String(l.args[1]?.icon?.html).includes(cls)).map((l) => l.args[1].pane ?? 'markerPane');
  const z = (pane) => +f.map.getPane(pane).style.zIndex;
  const ev = paneOf('event-label'), hrs = paneOf('hour-label'), sun = paneOf('sun-icon');
  assert.equal(ev.length, 2);
  assert.ok(hrs.length > 0 && sun.length === 1);
  assert.ok(Math.min(...ev.map(z)) > Math.max(...hrs.map(z)), 'opp/ned over timetall');
  assert.ok(Math.min(...ev.map(z)) > Math.max(...sun.map(z)), 'opp/ned over sola');
  assert.ok(Math.min(...sun.map(z)) > Math.max(...hrs.map(z)), 'sola over timetall');
  assert.equal(f.map.getPane(ev[0]).parent, f.map.getPane('norotatePane'), 'laget følger markørene (står rett ved rotasjon)');
}));

test('kart: tofinger-rotasjon har dødsone, kompasset går rett mot nord', () => withFake((f) => {
  const el = fakeEl();
  createMapView(el, {});
  el.fire('touchstart', { touches: [{}, {}] });
  f.map.setBearing(10);
  assert.equal(f.map.getBearing(), 0, 'små vridninger roterer ikke');
  f.map.setBearing(40);
  near(f.map.getBearing(), 25, 1e-9);
  el.fire('touchend', { touches: [] });
  f.map.setBearing(0);
  assert.equal(f.map.getBearing(), 0, 'kompassknappen går rett gjennom');
}));
