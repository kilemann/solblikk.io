// Solblikk – solberegning
// Algoritme: NOAA Solar Calculator (basert på Jean Meeus, Astronomical Algorithms).
// Nøyaktighet ~0,01° for 1800–2100. Asimut måles fra sann nord, med klokka.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const SUN_SEMIDIAMETER = 0.2666;      // grader
const MS_MIN = 60000;

export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function core(date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
  const epsR = eps * D2R, lamR = lambda * D2R;
  const dec = Math.asin(Math.sin(epsR) * Math.sin(lamR)) * R2D;
  const ra = (Math.atan2(Math.cos(epsR) * Math.sin(lamR), Math.cos(lamR)) * R2D + 360) % 360;
  const y = Math.tan(epsR / 2) ** 2;
  const L0r = L0 * D2R;
  const eot = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr)
    + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { dec, ra, eot };
}

/** Tidslikningen i minutter (sann soltid − middelsoltid). */
export function equationOfTime(date) {
  return core(date).eot;
}

/** Atmosfærisk brytning (grader) for sann høyde h (Sæmundsson 1986). */
export function refraction(h) {
  if (h < -3) return 0;
  const hh = Math.max(h, -1.5);
  const r = 1.02 / Math.tan((hh + 10.3 / (hh + 5.11)) * D2R) / 60;
  return h < -1.5 ? r * (h + 3) / 1.5 : r;   // myk overgang til 0 under −1,5°
}

/**
 * Solposisjon for et tidspunkt og sted.
 * @returns {{azimuth:number, altitude:number, apparentAltitude:number,
 *            declination:number, rightAscension:number, equationOfTime:number}}
 */
export function solarPosition(date, lat, lon) {
  const { dec, ra, eot } = core(date);
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
    + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60000;
  const tst = minutes + eot + 4 * lon;               // sann soltid i minutter
  const ha = (tst / 4 - 180) * D2R;
  const latR = lat * D2R, decR = dec * D2R;
  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(ha);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * R2D;
  let azimuth = Math.atan2(Math.sin(ha),
    Math.cos(ha) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR)) * R2D + 180;
  azimuth = ((azimuth % 360) + 360) % 360;
  return {
    azimuth, altitude,
    apparentAltitude: altitude + refraction(altitude),
    declination: dec, rightAscension: ra, equationOfTime: eot,
  };
}

function localDayBounds(day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return [start, end];
}

/** Sann soltid kl. 12 (sola i sør) for den lokale datoen. */
export function solarNoon(day, lat, lon) {
  const base = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  let t = base + (720 - 4 * lon) * MS_MIN;
  for (let i = 0; i < 3; i++) t = base + (720 - 4 * lon - core(new Date(t)).eot) * MS_MIN;
  return new Date(t);
}

/** Solbane for en lokal dato, fra midnatt til midnatt. */
export function dayPath(day, lat, lon, stepMin = 10) {
  const [start, end] = localDayBounds(day);
  const n = Math.round((end - start) / (stepMin * MS_MIN));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const time = new Date(start.getTime() + i * stepMin * MS_MIN);
    const p = solarPosition(time, lat, lon);
    out.push({ time, azimuth: p.azimuth, altitude: p.altitude, apparentAltitude: p.apparentAltitude });
  }
  return out;
}

/**
 * Soloppgang, solnedgang og perioder med direkte sol for en lokal dato.
 * Sola regnes som synlig når øvre kant er over horisonten:
 *   tilsynelatende høyde + halv soldiameter > horisontvinkel(asimut).
 * @param {object} [opts]
 * @param {(az:number)=>number} [opts.horizon] horisontvinkel i grader (terreng). Standard 0.
 */
export function sunEvents(day, lat, lon, opts = {}) {
  const horizon = opts.horizon ?? (() => 0);
  const [start, end] = localDayBounds(day);
  const stepMs = 2 * MS_MIN;

  const fTerrain = (t) => {
    const p = solarPosition(new Date(t), lat, lon);
    return p.apparentAltitude + SUN_SEMIDIAMETER - horizon(p.azimuth);
  };
  const fFlat = (t) => {
    const p = solarPosition(new Date(t), lat, lon);
    return p.apparentAltitude + SUN_SEMIDIAMETER;
  };

  const crossings = (f) => {
    const list = [];
    let t0 = start.getTime(), f0 = f(t0);
    const first = f0;
    let anyAbove = f0 > 0, anyBelow = f0 <= 0;
    for (let t1 = t0 + stepMs; t1 <= end.getTime(); t1 += stepMs) {
      const f1 = f(t1);
      if (f1 > 0) anyAbove = true; else anyBelow = true;
      if ((f0 > 0) !== (f1 > 0)) {
        let a = t0, b = t1, fa = f0;
        while (b - a > 1000) {
          const m = (a + b) / 2, fm = f(m);
          if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else { b = m; }
        }
        list.push({ t: (a + b) / 2, rising: f1 > 0 });
      }
      t0 = t1; f0 = f1;
    }
    return { list, anyAbove, anyBelow, startsAbove: first > 0 };
  };

  const flat = crossings(fFlat);
  const terr = opts.horizon ? crossings(fTerrain) : flat;

  // Solperioder (terreng)
  const periods = [];
  let open = terr.startsAbove ? start.getTime() : null;
  for (const c of terr.list) {
    if (c.rising) open = c.t;
    else if (open !== null) { periods.push({ start: new Date(open), end: new Date(c.t) }); open = null; }
  }
  if (open !== null) periods.push({ start: new Date(open), end: new Date(end) });
  const sunHours = periods.reduce((s, p) => s + (p.end - p.start), 0) / 3.6e6;

  const event = (c) => {
    if (!c) return null;
    const time = new Date(c.t);
    const p = solarPosition(time, lat, lon);
    return { time, azimuth: p.azimuth, altitude: p.altitude };
  };
  const firstRise = (x) => x.list.find((c) => c.rising);
  const lastSet = (x) => [...x.list].reverse().find((c) => !c.rising);

  // Soloppgang/-nedgang over terreng: korte glimt gjennom smale skar (under minPeriod)
  // skal ikke flytte tidspunktet. De teller fortsatt med i soltimene.
  const minPeriod = (opts.minPeriodMin ?? 10) * MS_MIN;
  const dayStart = start.getTime(), dayEnd = end.getTime();
  const realRise = periods.filter((p) => p.start.getTime() > dayStart);
  const realSet = periods.filter((p) => p.end.getTime() < dayEnd);
  const longRise = realRise.find((p) => p.end - p.start >= minPeriod);
  const longSet = [...realSet].reverse().find((p) => p.end - p.start >= minPeriod);
  const terrRise = opts.horizon ? (longRise ? { t: longRise.start.getTime() } : firstRise(terr)) : firstRise(terr);
  const terrSet = opts.horizon ? (longSet ? { t: longSet.end.getTime() } : lastSet(terr)) : lastSet(terr);

  let type;
  if (!flat.anyAbove) type = 'polar-night';
  else if (!terr.anyAbove) type = 'no-sun';
  else if (!flat.anyBelow) type = 'polar-day';
  else type = 'normal';

  const noon = solarNoon(day, lat, lon);
  const noonPos = solarPosition(noon, lat, lon);

  return {
    type,
    sunrise: event(terrRise),
    sunset: event(terrSet),
    flatSunrise: event(firstRise(flat)),
    flatSunset: event(lastSet(flat)),
    periods,
    sunHours,
    noon: { time: noon, azimuth: noonPos.azimuth, altitude: noonPos.altitude },
    maxAltitude: noonPos.altitude,
  };
}
