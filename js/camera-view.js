// Solblikk – live kameramodus
import {
  rotationMatrix, cameraDirection, projectToScreen, smoothMatrix,
  effectiveHfov, calibrationOffset, normAz,
} from './projection.js';
import { horizonAt } from './horizon.js';
import { compassName, fmtTime, fmtDeg } from './format.js';

const C = { sun: '#FFC233', summer: '#FF8A5B', winter: '#7FB7FF', terrain: '#6FCF97', text: '#E9EEF7', night: '#101A2E' };
const LABELS = { 0: 'N', 45: 'NØ', 90: 'Ø', 135: 'SØ', 180: 'S', 225: 'SV', 270: 'V', 315: 'NV' };

export function createCameraView({ video, canvas, hudRead, hudWarn, camMsg, getData, getSettings }) {
  const ctx = canvas.getContext('2d');
  let R = null;                 // glattet rotasjonsmatrise
  let sensor = 'none';          // 'absolute' | 'manual' | 'none'
  let running = false, raf = 0, stream = null, sensorTimer = 0;
  let manual = { alpha: 0, beta: 90 };   // brukes uten kompass (f.eks. PC)

  const onAbs = (e) => {
    if (e.alpha == null) return;
    sensor = 'absolute';
    R = smoothMatrix(R, rotationMatrix(e.alpha, e.beta, e.gamma), 0.25);
  };
  const onRel = (e) => {
    if (e.absolute && e.alpha != null && sensor !== 'absolute') {
      sensor = 'absolute';
      R = smoothMatrix(R, rotationMatrix(e.alpha, e.beta, e.gamma), 0.25);
    }
  };

  // Dra for å panorere når kompass mangler
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (sensor !== 'absolute') drag = { x: e.clientX, y: e.clientY, ...manual }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const hfov = currentHfov();
    const k = hfov / canvas.clientWidth;
    // Dra mot venstre = se mot høyre (alpha er mot klokka)
    manual.alpha = normAz(drag.alpha + (e.clientX - drag.x) * k);
    manual.beta = Math.max(10, Math.min(170, drag.beta + (e.clientY - drag.y) * k));
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function currentHfov() {
    return effectiveHfov(getSettings().longFov, video.videoWidth, video.videoHeight, canvas.clientWidth, canvas.clientHeight);
  }

  function matrix() {
    if (sensor === 'absolute' && R) return R;
    return rotationMatrix(manual.alpha, manual.beta, 0);
  }

  async function startCamera() {
    camMsg.hidden = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      showMsg('Kameraet er ikke tilgjengelig i denne nettleseren. Overlegget vises uten kamerabilde.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
    } catch (err) {
      showMsg(err?.name === 'NotAllowedError'
        ? 'Kameratilgang er avslått. Gi Solblikk tilgang til kamera i nettleserens innstillinger for nettstedet.'
        : `Kameraet kunne ikke startes (${err?.name ?? 'ukjent feil'}). Overlegget vises uten kamerabilde.`);
    }
  }

  function showMsg(text) { camMsg.textContent = text; camMsg.hidden = false; }

  function start() {
    if (running) return;
    running = true;
    window.addEventListener('deviceorientationabsolute', onAbs);
    window.addEventListener('deviceorientation', onRel);
    clearTimeout(sensorTimer);
    sensorTimer = setTimeout(() => {
      if (sensor !== 'absolute') {
        sensor = 'manual';
        showMsg('Fant ingen kompassdata. Dra i bildet for å se deg rundt.');
      }
    }, 1500);
    startCamera();
    loop();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    clearTimeout(sensorTimer);
    window.removeEventListener('deviceorientationabsolute', onAbs);
    window.removeEventListener('deviceorientation', onRel);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  /** Kamerakurs uten kalibrering – grunnlaget for ny kalibrering. */
  function rawDirection() { return cameraDirection(matrix()); }

  function calibrateTo(trueAz) {
    return calibrationOffset(trueAz, rawDirection().azimuth);
  }

  function loop() {
    if (!running) return;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const d = getData();
    const s = getSettings();
    if (!d) return;
    const M = matrix();
    const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) || 0;
    const view = { width: w, height: h, hfov: currentHfov(), headingOffset: s.headingOffset, screenAngle };
    const P = (az, alt) => projectToScreen(M, az, alt, view);

    const polyline = (pts, style) => {
      ctx.save();
      Object.assign(ctx, style.ctx ?? {});
      ctx.setLineDash(style.dash ?? []);
      ctx.beginPath();
      let prev = null;
      for (const pt of pts) {
        if (!pt || (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) > w)) { prev = null; if (!pt) continue; }
        if (prev) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y);
        prev = pt;
      }
      ctx.stroke();
      ctx.restore();
    };

    // Matematisk horisont (0°) med kompassmerker
    const ring = [];
    for (let az = 0; az <= 360; az += 1) ring.push(P(az, 0));
    polyline(ring, { ctx: { strokeStyle: 'rgba(233,238,247,.55)', lineWidth: 1 }, dash: [4, 6] });
    ctx.font = '600 13px "Barlow Semi Condensed", sans-serif';
    ctx.textAlign = 'center';
    for (let az = 0; az < 360; az += 5) {
      const p = P(az, 0);
      if (!p || p.x < -20 || p.x > w + 20) continue;
      const big = az % 45 === 0, mid = az % 15 === 0;
      const len = big ? 14 : mid ? 9 : 5;
      ctx.strokeStyle = C.text; ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - len); ctx.lineTo(p.x, p.y + len); ctx.stroke();
      if (big || mid) {
        const label = LABELS[az] ?? `${az}°`;
        ctx.fillStyle = big ? C.text : 'rgba(233,238,247,.75)';
        ctx.strokeStyle = 'rgba(16,26,46,.85)'; ctx.lineWidth = 3;
        ctx.strokeText(label, p.x, p.y + len + 14); ctx.fillText(label, p.x, p.y + len + 14);
      }
    }

    // Terrenghorisont
    if (d.horizon) {
      const terr = [];
      for (let az = 0; az <= 360; az += 1) terr.push(P(az, horizonAt(d.horizon, az)));
      polyline(terr, { ctx: { strokeStyle: C.terrain, lineWidth: 2 } });
    }

    // Solverv
    const pathPts = (path) => path.map((p) => (p.altitude > -8 ? P(p.azimuth, p.apparentAltitude) : null));
    polyline(pathPts(d.summerPath), { ctx: { strokeStyle: C.summer, lineWidth: 2 }, dash: [8, 7] });
    polyline(pathPts(d.winterPath), { ctx: { strokeStyle: C.winter, lineWidth: 2 }, dash: [8, 7] });

    // Valgt dato: glødende bane
    const main = pathPts(d.path);
    polyline(main, { ctx: { strokeStyle: 'rgba(255,194,51,.35)', lineWidth: 9, lineCap: 'round' } });
    polyline(main, { ctx: { strokeStyle: C.sun, lineWidth: 3, lineCap: 'round' } });

    // Timeperler
    ctx.font = '600 12px "Barlow Semi Condensed", sans-serif';
    for (const p of d.path) {
      if (p.time.getMinutes() !== 0 || p.altitude < -8) continue;
      const q = P(p.azimuth, p.apparentAltitude);
      if (!q || q.x < -20 || q.x > w + 20 || q.y < -20 || q.y > h + 20) continue;
      const hidden = p.apparentAltitude + 0.27 < horizonAt(d.horizon, p.azimuth);
      ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = hidden ? 'rgba(16,26,46,.85)' : C.sun; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = hidden ? C.sun : C.night; ctx.stroke();
      ctx.fillStyle = hidden ? C.sun : C.night;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.time.getHours()).padStart(2, '0'), q.x, q.y + 0.5);
      ctx.textBaseline = 'alphabetic';
    }

    // Opp-/nedgang (terreng hvis tilgjengelig)
    const ev = d.events;
    for (const [e, txt] of [[ev.sunrise, 'Opp'], [ev.sunset, 'Ned']]) {
      if (!e) continue;
      const q = P(e.azimuth, horizonAt(d.horizon, e.azimuth));
      if (!q) continue;
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.moveTo(q.x, q.y - 2); ctx.lineTo(q.x - 8, q.y + 12); ctx.lineTo(q.x + 8, q.y + 12); ctx.closePath(); ctx.fill();
      const label = `${txt} ${fmtTime(e.time)}`;
      ctx.font = '600 14px "Barlow Semi Condensed", sans-serif';
      ctx.strokeStyle = 'rgba(16,26,46,.9)'; ctx.lineWidth = 4;
      ctx.strokeText(label, q.x, q.y + 28); ctx.fillText(label, q.x, q.y + 28);
    }

    // Sola på valgt tidspunkt
    const sa = d.sunAt;
    const sp = P(sa.azimuth, sa.apparentAltitude);
    if (sp) {
      const g = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 40);
      g.addColorStop(0, sa.visible ? 'rgba(255,194,51,.75)' : 'rgba(255,194,51,.25)');
      g.addColorStop(1, 'rgba(255,194,51,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sp.x, sp.y, 40, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = sa.visible ? C.sun : 'rgba(16,26,46,.6)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = sa.visible ? '#fff6dc' : C.sun; ctx.stroke();
    }

    // Kalibreringspunkt
    if (d.landmarkBearing != null) {
      const q = P(d.landmarkBearing, 0);
      if (q) {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = C.terrain; ctx.fillRect(-7, -7, 14, 14);
        ctx.restore();
      }
    }

    // Trådkors
    ctx.strokeStyle = C.text; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - 28, h / 2); ctx.lineTo(w / 2 - 18, h / 2);
    ctx.moveTo(w / 2 + 18, h / 2); ctx.lineTo(w / 2 + 28, h / 2);
    ctx.moveTo(w / 2, h / 2 - 28); ctx.lineTo(w / 2, h / 2 - 18);
    ctx.moveTo(w / 2, h / 2 + 18); ctx.lineTo(w / 2, h / 2 + 28);
    ctx.stroke();

    // HUD
    const dir = cameraDirection(M);
    const az = normAz(dir.azimuth + s.headingOffset);
    hudRead.textContent = `Kurs ${Math.round(az)}° ${compassName(az)}   Høyde ${dir.altitude >= 0 ? '+' : ''}${fmtDeg(dir.altitude)}`;
    const warn = sensor === 'manual' ? 'Uten kompass: dra i bildet for å se deg rundt.'
      : !s.calibrated ? 'Kompasset er ikke kalibrert. Retningene kan bomme med flere grader.' : '';
    hudWarn.textContent = warn; hudWarn.hidden = !warn;
  }

  return { start, stop, calibrateTo, rawDirection, get sensor() { return sensor; } };
}
