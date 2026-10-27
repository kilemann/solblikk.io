// Solblikk – app
import { VERSION } from './version.js';
import { dayPath, sunEvents, solarPosition } from './sun.js';
import { fetchHorizon, horizonAt, horizonCacheKey, bearingBetween, distanceBetween } from './horizon.js';
import {
  fmtTime, fmtDuration, compassName, fmtDateShort, toDateInput, fromDateInput, fmtDeg,
  dayOfYear, dateFromDayOfYear, daysInYear, monthLengths, sunNowText,
} from './format.js';
import { createMapView } from './map-view.js';
import { createCameraView } from './camera-view.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lagring utilgjengelig */ } },
};

const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const nowMinutes = () => { const n = new Date(); return Math.floor((n.getHours() * 60 + n.getMinutes()) / 5) * 5; };

const state = {
  date: today(),
  minutes: nowMinutes(),
  pos: store.get('pos', { lat: 58.1467, lon: 7.9956, source: 'standard' }),
  horizon: null,
  hzStatus: { kind: 'idle', text: '' },
  landmark: store.get('landmark', null),
  pickLandmark: false,
};
const settings = Object.assign({ headingOffset: 0, calibrated: false, longFov: 65 }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

let data = null;
let solsticeCache = { key: '', summer: null, winter: null };

function solstices(y, lat, lon) {
  const key = `${y}:${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (solsticeCache.key !== key) {
    solsticeCache = { key, summer: dayPath(new Date(y, 5, 21), lat, lon, 10), winter: dayPath(new Date(y, 11, 21), lat, lon, 10) };
  }
  return solsticeCache;
}

function compute() {
  const { lat, lon } = state.pos;
  const hz = state.horizon ? (az) => horizonAt(state.horizon, az) : undefined;
  const y = state.date.getFullYear();
  const t = new Date(state.date.getTime() + state.minutes * 60000);
  const sp = solarPosition(t, lat, lon);
  data = {
    pos: state.pos,
    horizon: state.horizon,
    path: dayPath(state.date, lat, lon, 5),
    summerPath: solstices(y, lat, lon).summer,
    winterPath: solstices(y, lat, lon).winter,
    events: sunEvents(state.date, lat, lon, { horizon: hz }),
    sunAt: { ...sp, time: t, visible: sp.apparentAltitude + 0.27 > horizonAt(state.horizon, sp.azimuth) },
    landmark: state.landmark,
    landmarkBearing: state.landmark ? bearingBetween(lat, lon, state.landmark.lat, state.landmark.lon) : null,
  };
  renderSheet();
  mapView.update(data);
}

function renderSheet() {
  const d = data, ev = d.events;
  $('dateLabel').textContent = fmtDateShort(state.date);
  $('dateInput').value = toDateInput(state.date);
  $('timeSlider').value = state.minutes;
  $('timeOut').textContent = fmtTime(d.sunAt.time);

  const s = d.sunAt;
  $('sunNow').textContent = sunNowText(s, s.visible);
  renderDaySlider();

  const hasT = !!state.horizon;
  $('rowTerrain').hidden = !hasT;
  const special = { 'polar-day': 'Midnattssol', 'polar-night': 'Mørketid', 'no-sun': 'Ingen sol' };
  if (hasT) {
    $('tRiseT').textContent = ev.sunrise ? fmtTime(ev.sunrise.time) : (special[ev.type] ?? '–');
    $('tSetT').textContent = ev.sunset ? fmtTime(ev.sunset.time) : '–';
  }
  $('tRiseF').textContent = ev.flatSunrise ? fmtTime(ev.flatSunrise.time) : (ev.type === 'polar-night' ? 'Mørketid' : ev.type === 'polar-day' ? 'Midnattssol' : '–');
  $('tSetF').textContent = ev.flatSunset ? fmtTime(ev.flatSunset.time) : '–';
  const r = ev.sunrise ?? ev.flatSunrise, st = ev.sunset ?? ev.flatSunset;
  $('tRiseAz').textContent = r ? `${compassName(r.azimuth)} ${Math.round(r.azimuth)}°` : '–';
  $('tSetAz').textContent = st ? `${compassName(st.azimuth)} ${Math.round(st.azimuth)}°` : '–';
  $('fSunHours').textContent = fmtDuration(ev.sunHours);
  $('fNoon').textContent = fmtTime(ev.noon.time);
  $('fMaxAlt').textContent = fmtDeg(ev.maxAltitude, 1);

  const src = { gps: 'GPS-posisjon', kart: 'Valgt i kartet', standard: 'Kristiansand (standard)' }[state.pos.source] ?? '';
  $('posStatus').textContent = `${src}: ${state.pos.lat.toFixed(5)}, ${state.pos.lon.toFixed(5)}`
    + (state.horizon?.observerElevation != null ? `, ${Math.round(state.horizon.observerElevation)} moh.` : '');
  const hz = $('hzStatus');
  hz.textContent = state.hzStatus.text;
  hz.classList.toggle('warn', state.hzStatus.kind === 'error');
}

// ---------- Dagsglider ----------
let monthsYear = null;
function renderDaySlider() {
  const y = state.date.getFullYear();
  const sl = $('daySlider');
  sl.max = daysInYear(y);
  sl.value = dayOfYear(state.date);
  if (monthsYear !== y) {
    monthsYear = y;
    const lens = monthLengths(y);
    const m = $('months');
    m.style.gridTemplateColumns = lens.map((n) => `${n}fr`).join(' ');
    m.innerHTML = 'JFMAMJJASOND'.split('').map((c) => `<span>${c}</span>`).join('');
  }
}

// Glideren tegner på nytt maks én gang per skjermbilde, så den føles rask.
let pending = 0;
function scheduleCompute() {
  if (pending) return;
  pending = requestAnimationFrame(() => { pending = 0; compute(); });
}

// ---------- Terreng ----------
let hzAbort = null;
async function loadHorizon() {
  const { lat, lon } = state.pos;
  const key = horizonCacheKey(lat, lon);
  const cached = store.get(key, null);
  hzAbort?.abort();
  if (cached) {
    state.horizon = cached;
    state.hzStatus = { kind: 'ok', text: 'Terrenghorisont fra Kartverket (lagret).' };
    compute();
    return;
  }
  state.horizon = null;
  state.hzStatus = { kind: 'busy', text: 'Henter terreng fra Kartverket… 0 %' };
  compute();
  const ctrl = new AbortController(); hzAbort = ctrl;
  try {
    const h = await fetchHorizon(lat, lon, {
      signal: ctrl.signal,
      onProgress: (f) => { state.hzStatus.text = `Henter terreng fra Kartverket… ${Math.round(f * 100)} %`; $('hzStatus').textContent = state.hzStatus.text; },
    });
    if (ctrl.signal.aborted) return;
    state.horizon = h;
    store.set(key, h);
    state.hzStatus = { kind: 'ok', text: 'Terrenghorisont fra Kartverket (radius 30 km).' };
  } catch (err) {
    if (ctrl.signal.aborted || err?.name === 'AbortError') return;
    state.horizon = null;
    state.hzStatus = { kind: 'error', text: `Terrengdata kunne ikke hentes (${err.message}). Viser flat horisont.` };
  }
  compute();
}

function setPosition(lat, lon, source) {
  // Små GPS-hopp (< 30 m) gir samme horisont – unngå ny nedlasting.
  const hzReady = state.horizon || state.hzStatus.kind === 'busy';
  if (source === 'gps' && hzReady && distanceBetween(lat, lon, state.pos.lat, state.pos.lon) < 30) {
    state.pos = { ...state.pos, source };
    store.set('pos', state.pos);
    compute();
    return;
  }
  state.pos = { lat, lon, source };
  store.set('pos', state.pos);
  loadHorizon();
}

function locate(center = true) {
  if (!navigator.geolocation) {
    state.hzStatus = { kind: 'error', text: 'Posisjon er ikke tilgjengelig i denne nettleseren.' };
    renderSheet();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      setPosition(p.coords.latitude, p.coords.longitude, 'gps');
      if (center) mapView.center(p.coords.latitude, p.coords.longitude);
    },
    (err) => {
      $('posStatus').textContent = err.code === 1
        ? 'Posisjonstilgang er avslått. Hold inne i kartet for å velge punkt.'
        : 'Fant ikke posisjonen. Hold inne i kartet for å velge punkt.';
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
}

// ---------- Visninger ----------
const mapView = createMapView($('map'), {
  compassBtn: $('compassBtn'),
  compassNeedle: $('compassNeedle'),
  onLongPress: (lat, lon) => setPosition(lat, lon, 'kart'),
  onTap: (lat, lon) => {
    if (!state.pickLandmark) return;
    state.landmark = { lat, lon };
    store.set('landmark', state.landmark);
    setPickLandmark(false);
    compute();
  },
});

const cameraView = createCameraView({
  video: $('video'), canvas: $('overlay'), hudRead: $('hudRead'), hudWarn: $('hudWarn'), camMsg: $('camMsg'),
  getData: () => data, getSettings: () => settings,
});

function setPickLandmark(on) {
  state.pickLandmark = on;
  $('landmarkBtn').classList.toggle('on', on);
  const hint = $('mapHint');
  hint.classList.toggle('active', on);
  hint.textContent = on
    ? 'Trykk på et tydelig landemerke, f.eks. en fjelltopp, et tårn eller en kirke.'
    : 'Hold inne for å flytte punktet.';
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === id));
  if (id === 'cameraView') cameraView.start(); else { cameraView.stop(); mapView.invalidate(); }
}

// ---------- Hendelser ----------
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
$('sheetHandle').addEventListener('click', () => $('sheet').classList.toggle('open'));
// Mål arkets sammenslåtte høyde så visningene ikke skjules bak det
new ResizeObserver(() => {
  const sheet = $('sheet');
  if (sheet.classList.contains('open')) return;
  const hpx = Math.round(sheet.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--sheet-h', `${hpx}px`);
  mapView.invalidate();
}).observe($('sheet'));
$('timeSlider').addEventListener('input', (e) => { state.minutes = +e.target.value; scheduleCompute(); });
$('daySlider').addEventListener('input', (e) => {
  state.date = dateFromDayOfYear(state.date.getFullYear(), +e.target.value);
  scheduleCompute();
});
$('dateInput').addEventListener('change', (e) => { if (e.target.value) { state.date = fromDateInput(e.target.value); compute(); } });
const shiftDay = (n) => { state.date = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate() + n); compute(); };
$('prevDay').addEventListener('click', () => shiftDay(-1));
$('nextDay').addEventListener('click', () => shiftDay(1));
$('todayBtn').addEventListener('click', () => { state.date = today(); state.minutes = nowMinutes(); compute(); });
$('locateBtn').addEventListener('click', () => locate(true));
$('landmarkBtn').addEventListener('click', () => setPickLandmark(!state.pickLandmark));

// Kalibrering
const dlg = $('calibDialog');
function openCalib() {
  const sunNow = solarPosition(new Date(), state.pos.lat, state.pos.lon);
  const sunUp = sunNow.apparentAltitude > 1;
  $('calSun').disabled = !sunUp;
  $('calSunNote').textContent = sunUp
    ? `Sola står nå i ${Math.round(sunNow.azimuth)}° ${compassName(sunNow.azimuth)}, ${fmtDeg(sunNow.apparentAltitude, 1)} over horisonten.`
    : 'Sola er under horisonten nå. Bruk et kalibreringspunkt.';
  $('calLandmark').disabled = data.landmarkBearing == null;
  $('calLmNote').textContent = data.landmarkBearing == null
    ? 'Velg et landemerke i kartet først (knappen med nålen).'
    : `Landemerket ligger i ${Math.round(data.landmarkBearing)}° ${compassName(data.landmarkBearing)}.`;
  $('fovSlider').value = settings.longFov;
  $('fovOut').textContent = `${settings.longFov}°`;
  dlg.showModal();
}
function applyCalibration(trueAz) {
  settings.headingOffset = cameraView.calibrateTo(trueAz);
  settings.calibrated = true;
  saveSettings();
  dlg.close();
}
$('calibBtn').addEventListener('click', openCalib);
$('calSun').addEventListener('click', () => applyCalibration(solarPosition(new Date(), state.pos.lat, state.pos.lon).azimuth));
$('calLandmark').addEventListener('click', () => applyCalibration(data.landmarkBearing));
$('calReset').addEventListener('click', () => { settings.headingOffset = 0; settings.calibrated = false; saveSettings(); dlg.close(); });
$('fovSlider').addEventListener('input', (e) => { settings.longFov = +e.target.value; $('fovOut').textContent = `${settings.longFov}°`; saveSettings(); });

// ---------- Oppstart ----------
$('version').textContent = `v${VERSION}`;
mapView.center(state.pos.lat, state.pos.lon);
loadHorizon();
locate(true);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
