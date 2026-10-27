// Solblikk – dødsone for tofinger-rotasjon av kartet (som i Google Maps).
// Kartet står stille til fingrene har vridd seg mer enn terskelen. Deretter følger det
// vridningen, men uten å hoppe: terskelen trekkes fra, så rotasjonen starter mykt.

const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const norm = (d) => ((d % 360) + 360) % 360;

export function createRotationGate({ threshold = 15 } = {}) {
  let active = false, startBearing = 0, unlocked = false, sign = 1;
  return {
    start(bearing) { active = true; startBearing = bearing; unlocked = false; },
    end() { active = false; },
    get active() { return active; },
    /** Gjør om ønsket kurs (fra gesten) til faktisk kurs. Utenfor en gest slippes alt gjennom. */
    filter(requested) {
      if (!active) return requested;
      const delta = wrap180(requested - startBearing);
      if (!unlocked) {
        if (Math.abs(delta) <= threshold) return startBearing;
        unlocked = true;
        sign = Math.sign(delta);
      }
      return norm(startBearing + delta - sign * threshold);
    },
  };
}
