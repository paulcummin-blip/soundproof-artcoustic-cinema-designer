/**
 * Equalise bed-layer azimuth spacing by sliding speakers along their pad axes.
 * Pure and side-effect free.
 *
 * Types (JSDoc):
 * @typedef {"FWL"|"FWR"|"LS"|"RS"|"SL"|"SR"|"LRS"|"RRS"} BedRole
 * @typedef {{ width:number; length:number }} Dims
 * @typedef {{ id:string; role:BedRole; position:{x:number;y:number} }} BedSpeaker
 * @typedef {{ axis:"x"|"y"; min:number; max:number }} PadAxis
 * @typedef {{ [k in BedRole]?: PadAxis }} PadsMap
 */

/**
 * @param {{dimensions:Dims, mlp:{x:number;y:number}, speakers:BedSpeaker[], pads:PadsMap, targets?:number[], weights?:{evenness?:number; pad?:number; target?:number}, steps?:number}} opts
 * @returns {BedSpeaker[]}
 */
export function equalizeBedAngles(opts) {
  const dims = opts?.dimensions || { width: 4.5, length: 6.0 };
  const mlp = opts?.mlp || { x: dims.width / 2, y: Math.min(dims.length * 0.58, dims.length - 1.2) };
  const speakersIn = Array.isArray(opts?.speakers) ? opts.speakers : [];
  const pads = opts?.pads || {};
  const targets = Array.isArray(opts?.targets) && opts.targets.length ? opts.targets.slice() : [];
  const weights = { evenness: 1, pad: 5, target: 0.5, ...(opts?.weights || {}) };
  const steps = Math.max(10, Math.min(2000, opts?.steps || 200));

  // Clone and clamp to pad extents
  const normRole = (r) => {
    const R = String(r || "").toUpperCase();
    if (R === "SL" || R === "LS" || R === "LSS") return "SL";
    if (R === "SR" || R === "RS" || R === "RSS") return "SR";
    if (R === "LW" || R === "FWL") return "FWL";
    if (R === "RW" || R === "FWR") return "FWR";
    if (R === "LR" || R === "LRS" || R === "SBL") return "LRS";
    if (R === "RR" || R === "RRS" || R === "SBR") return "RRS";
    return R;
  };
  const clampToPad = (sp) => {
    const r = normRole(sp.role);
    const p = pads[r];
    if (!p) return { ...sp };
    if (p.axis === "y") {
      const y = Math.max(p.min, Math.min(p.max, sp.position.y));
      return { ...sp, position: { ...sp.position, y } };
    } else {
      const x = Math.max(p.min, Math.min(p.max, sp.position.x));
      return { ...sp, position: { ...sp.position, x } };
    }
  };

  let current = speakersIn.map(clampToPad);

  // Angle helpers
  const wrap360 = (deg) => ((deg % 360) + 360) % 360;
  const circularDiff = (a, b) => {
    const d = Math.abs(wrap360(a) - wrap360(b));
    return Math.min(d, 360 - d);
    };
  const angleDeg = (p) => {
    const dx = p.x - mlp.x;
    const dy = p.y - mlp.y;
    // 0° = straight ahead (-y), left negative, right positive
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  const cost = (arr) => {
    // Only consider bed-layer speakers given
    const ordered = arr
      .map((sp) => ({ id: sp.id, role: normRole(sp.role), deg: angleDeg(sp.position) }))
      .sort((a, b) => wrap360(a.deg) - wrap360(b.deg));

    // Gap variance (evenness)
    let gaps = [];
    if (ordered.length >= 2) {
      for (let i = 0; i < ordered.length; i++) {
        const a = wrap360(ordered[i].deg);
        const b = wrap360(ordered[(i + 1) % ordered.length].deg);
        gaps.push(wrap360(b - a));
      }
    }
    const mean = gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : 0;
    const varGap = gaps.length ? gaps.reduce((s, v) => s + (v - mean) * (v - mean), 0) / gaps.length : 0;

    // Target proximity
    let targetPenalty = 0;
    if (targets.length) {
      for (const s of ordered) {
        const absDeg = wrap360(s.deg);
        let best = 0;
        if (targets.length) {
          let minD = 180;
          for (const t of targets) {
            const d = circularDiff(absDeg, t);
            if (d < minD) minD = d;
          }
          best = minD;
        }
        targetPenalty += best;
      }
      targetPenalty = targetPenalty / Math.max(1, ordered.length);
    }

    // Pad penalty (we clamp moves so residual is 0)
    const padPenalty = 0;

    return weights.evenness * varGap + weights.pad * padPenalty + weights.target * targetPenalty;
  };

  // Coordinate descent along pad axis
  let bestCost = cost(current);
  for (let s = 0; s < steps; s++) {
    let improved = false;
    for (let i = 0; i < current.length; i++) {
      const sp = current[i];
      const r = normRole(sp.role);
      const pad = pads[r];
      if (!pad) continue;

      const padSpan = Math.max(0.001, Math.abs(pad.max - pad.min));
      const stepSize = padSpan / 50; // 2% of span

      const tryMove = (delta) => {
        const copy = current.map((x, idx) => (idx === i ? { ...x, position: { ...x.position } } : x));
        if (pad.axis === "y") {
          copy[i].position.y = Math.max(pad.min, Math.min(pad.max, copy[i].position.y + delta));
        } else {
          copy[i].position.x = Math.max(pad.min, Math.min(pad.max, copy[i].position.x + delta));
        }
        const c = cost(copy);
        return { copy, c };
      };

      const down = tryMove(-stepSize);
      const up = tryMove(stepSize);

      if (down.c < bestCost && down.c <= up.c) {
        current = down.copy;
        bestCost = down.c;
        improved = true;
      } else if (up.c < bestCost) {
        current = up.copy;
        bestCost = up.c;
        improved = true;
      }
    }
    if (!improved) break;
  }

  // Return updated positions; keep original role strings
  const out = current.map((sp) => ({ id: sp.id, role: sp.role, position: { x: sp.position.x, y: sp.position.y } }));
  return out;
}

export default { equalizeBedAngles };