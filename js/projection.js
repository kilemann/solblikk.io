// Solblikk – orientering og projeksjon til kamerabildet.
// Rotasjonsmatrisen følger W3C DeviceOrientation Event (Z-X'-Y''):
// R = Rz(alpha) · Rx(beta) · Ry(gamma), enhet → jord. Jordramme: x=øst, y=nord, z=opp.
// Matriser lagres radvis som flate arrays med 9 elementer.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const normAz = (a) => ((a % 360) + 360) % 360;

/** Kompasskurs (med klokka fra nord) fra W3C alpha (mot klokka). */
export const compassFromAlpha = (alpha) => normAz(360 - alpha);

export function rotationMatrix(alpha, beta, gamma) {
  const a = alpha * D2R, b = beta * D2R, g = gamma * D2R;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return [
    cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB,
    cG * sA + cA * sB * sG,  cA * cB, sA * sG - cA * cG * sB,
    -cB * sG,                sB,      cB * cG,
  ];
}

/** Retning bakkameraet peker (enhetens −Z i jordramme). */
export function cameraDirection(R) {
  const x = -R[2], y = -R[5], z = -R[8];
  return {
    azimuth: normAz(Math.atan2(x, y) * R2D),
    altitude: Math.asin(Math.max(-1, Math.min(1, z))) * R2D,
  };
}

/** Enhetsvektor i jordramme for asimut/høyde. */
export function worldVector(azimuth, altitude) {
  const az = azimuth * D2R, alt = altitude * D2R;
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
}

/** Brennvidde i piksler for gitt bredde og horisontalt synsfelt. */
export function focalLength(width, hfovDeg) {
  return (width / 2) / Math.tan((hfovDeg * D2R) / 2);
}

/**
 * Projiserer asimut/høyde til skjermpiksler.
 * view: { width, height, hfov, headingOffset=0, screenAngle=0 }
 *  - headingOffset: grader som legges til sensorens kurs (kalibrering/misvisning).
 *  - screenAngle: screen.orientation.angle (0, 90, 180, 270).
 * Returnerer {x, y} eller null hvis punktet er bak kameraet.
 */
export function projectToScreen(R, azimuth, altitude, view) {
  const { width, height, hfov, headingOffset = 0, screenAngle = 0 } = view;
  // Kalibrering: sensoren måler kurs + offset = sann kurs. Flytt målet tilbake.
  const v = worldVector(azimuth - headingOffset, altitude);
  // Jord → enhet: d = Rᵀ · v
  const dx = R[0] * v[0] + R[3] * v[1] + R[6] * v[2];
  const dy = R[1] * v[0] + R[4] * v[1] + R[7] * v[2];
  const dz = R[2] * v[0] + R[5] * v[1] + R[8] * v[2];
  const depth = -dz;
  if (depth <= 1e-6) return null;
  const xp = dx / depth, yp = dy / depth;              // portrett: høyre=+X, opp=+Y
  const th = screenAngle * D2R;
  const xs = xp * Math.cos(th) - yp * Math.sin(th);
  const ys = xp * Math.sin(th) + yp * Math.cos(th);
  const f = focalLength(width, hfov);
  return { x: width / 2 + f * xs, y: height / 2 - f * ys };
}

/**
 * Horisontalt synsfelt (grader) slik det faktisk vises på skjermen.
 * longFov: kameraets synsfelt langs bildets lange side. Videoen vises med
 * object-fit: cover, så bildet skaleres til å fylle boksen og beskjæres.
 * Uten videomål (0) antas 4:3-sensor med lang side langs boksens lange side.
 */
export function effectiveHfov(longFov, videoW, videoH, boxW, boxH) {
  if (!videoW || !videoH) {
    if (boxH >= boxW) { videoW = 1440; videoH = 1920; } else { videoW = 1920; videoH = 1440; }
  }
  const longPx = Math.max(videoW, videoH);
  const fVideo = (longPx / 2) / Math.tan((longFov * D2R) / 2);
  const scale = Math.max(boxW / videoW, boxH / videoH);
  return 2 * Math.atan((boxW / 2) / (fVideo * scale)) * R2D;
}

/** Kalibrering: hvor mye sensorens kurs må justeres (sann − målt), i (−180, 180]. */
export function calibrationOffset(trueAz, measuredAz) {
  let d = normAz(trueAz - measuredAz);
  if (d > 180) d -= 360;
  return d;
}

/** Gram–Schmidt på kolonnene (enhetens akser i jordramme). */
export function orthonormalize(M) {
  const col = (j) => [M[j], M[3 + j], M[6 + j]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b, k) => [a[0] - k * b[0], a[1] - k * b[1], a[2] - k * b[2]];
  const norm = (a) => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  // Behold Z (kamera-aksen) mest nøyaktig, deretter Y.
  const z = norm(col(2));
  const y = norm(sub(col(1), z, dot(col(1), z)));
  const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

/** Eksponentiell glatting av rotasjonsmatriser (fri for 0/360-hopp og gimbal lock). */
export function smoothMatrix(prev, next, k) {
  if (!prev) return next;
  return orthonormalize(prev.map((p, i) => p + (next[i] - p) * k));
}
