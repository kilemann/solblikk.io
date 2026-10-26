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
