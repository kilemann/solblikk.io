// Solblikk – formatering (norsk)
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli',
  'august', 'september', 'oktober', 'november', 'desember'];
const POINTS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];

export const fmtTime = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '–');

export function fmtDuration(hours) {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)} t ${total % 60} min`;
}

export const compassName = (az) => POINTS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

export const fmtDateLong = (d) =>
  `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export const fmtDateShort = (d) => `${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`;

export const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromDateInput(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const fmtDeg = (v, digits = 0) => `${v.toFixed(digits).replace('.', ',')}°`;

// ---------- v0.2.0 ----------
export const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

export const monthLengths = (y) => [31, daysInYear(y) === 366 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Dag i året (1 = 1. januar), uavhengig av sommertid. */
export function dayOfYear(d) {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
}

/** Lokal midnatt for dag nr. n i året (klemmes til 1 … årets lengde). */
export function dateFromDayOfYear(y, n) {
  const d = Math.max(1, Math.min(daysInYear(y), Math.round(n)));
  return new Date(y, 0, d);
}

/** «Opp 04:57» – opp- og nedgang vises med minutter. */
export const eventLabel = (prefix, time) => (time ? `${prefix} ${fmtTime(time)}` : null);

/** Kort, énlinjes beskrivelse av sola på valgt klokkeslett. */
export function sunNowText(s, visible) {
  if (s.apparentAltitude < -0.83) {
    return `Sola under horisonten (${fmtDeg(s.altitude, 1).replace('-', '−')}), ${compassName(s.azimuth)} ${Math.round(s.azimuth)}°`;
  }
  return `Sola i ${compassName(s.azimuth)} ${Math.round(s.azimuth)}°, ${fmtDeg(s.apparentAltitude, 1)} over horisonten${visible ? '' : ', bak terrenget'}`;
}
