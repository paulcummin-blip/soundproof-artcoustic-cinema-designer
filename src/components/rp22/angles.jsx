/**
 * RP22 angular metrics and equalisation helpers (pure, side-effect free).
 * JS implementation with JSDoc typedefs for clarity and editor help.
 */

/**
 * @typedef {{ x: number; y: number }} Vec2
 * @typedef {{ x: number; y: number }} MLP
 * @typedef {{ width: number; length: number; height?: number }} RoomDims
 * @typedef {"FL"|"FR"|"FC"|"SUB"|"FWL"|"FWR"|"SL"|"SR"|"LS"|"RS"|"LSS"|"RSS"|"SLR"|"SRR"|"SBL"|"SBR"|"LR"|"RR"|"LRS"|"RRS"|"TOP_ANY"|"UNKNOWN"} SpeakerRole
 * @typedef {{ id: string; role: string; label?: string; position: Vec2 & { z?: number } }} Speaker
 * @typedef {{ x:number; y:number; width:number; height:number; key:"Front L"|"Front R"|"Front Wide"|"Side Surround"|"Rear Surround"; orientation:"front"|"left"|"right"|"back" }} PadConstraint
 * @typedef {{ role: SpeakerRole; id: string; angleDeg: number; absDeg: number; quadrant:"front"|"left"|"right"|"back"; pos: Vec2 }} AngleSample
 * @typedef {{ ordered: AngleSample[]; gaps: number[]; meanGap: number; stdGap: number }} SurroundRing
 * @typedef {{ frontWideDeg?: number; sideDeg?: number; rearDeg?: number; equaliseWeight: number }} RP22Targets
 * @typedef {{ mlp: MLP; samples: AngleSample[]; ring: SurroundRing | null; score: number; notes: string[] }} RP22Metrics
 * @typedef {{ id: string; role: SpeakerRole; target: Vec2; targetAngleDeg: number }} NudgeProposal
 * @typedef {{ metricsBefore: RP22Metrics; metricsAfter: RP22Metrics; nudges: NudgeProposal[] }} EqualiseResult
 */

const TAU = Math.PI * 2;

/**
 * Normalise common raw role strings to a compact set.
 * @param {string} raw
 * @returns {SpeakerRole}
 */
export function normaliseRole(raw) {
  const r = (raw || "").toUpperCase();
  if (r === "L") return "FL";
  if (r === "R") return "FR";
  if (r === "C" || r === "FC") return "FC";
  if (r.includes("SUB")) return "SUB";
  if (["FWL","LW"].includes(r)) return "FWL";
  if (["FWR","RW"].includes(r)) return "FWR";
  if (["SL","LS","LSS"].includes(r)) return "SL";
  if (["SR","RS","RSS"].includes(r)) return "SR";
  if (["LRS","SBL","LR"].includes(r)) return "LRS";
  if (["RRS","SBR","RR"].includes(r)) return "RRS";
  return "UNKNOWN";
}

/**
 * 0° straight ahead (towards -y), left negative, right positive.
 * @param {MLP} mlp
 * @param {Vec2} p
 */
export function angleDegFromMLP(mlp, p) {
  const dx = p.x - mlp.x;
  const dy = p.y - mlp.y;
  const a = Math.atan2(dx, -dy);
  return (a * 180) / Math.PI;
}

/**
 * @param {number} deg
 */
export function wrap360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * @param {number} deg
 * @returns {"front"|"left"|"right"|"back"}
 */
export function quadrantFromAngle(deg) {
  const a = wrap360(deg);
  if (a > 315 || a <= 45) return "front";
  if (a > 45 && a <= 135) return "right";
  if (a > 135 && a <= 225) return "back";
  return "left";
}

/**
 * Compute RP22 metrics for current speakers.
 * Pure function.
 * @param {MLP} mlp
 * @param {Speaker[]} speakers
 * @param {RP22Targets} targets
 * @returns {RP22Metrics}
 */
export function computeRP22Metrics(mlp, speakers, targets) {
  const samples = (Array.isArray(speakers) ? speakers : []).map((sp) => {
    const role = normaliseRole(sp.role);
    const angleDeg = angleDegFromMLP(mlp, sp.position);
    return {
      id: sp.id,
      role,
      angleDeg,
      absDeg: Math.abs(angleDeg),
      quadrant: quadrantFromAngle(angleDeg),
      pos: { x: sp.position.x, y: sp.position.y },
    };
  });

  const surroundRoles = new Set(["FWL","FWR","SL","SR","LRS","RRS"]);
  const ringCandidates = samples.filter((s) => surroundRoles.has(s.role));
  let ring = null;

  if (ringCandidates.length >= 2) {
    const ordered = [...ringCandidates].sort((a, b) => wrap360(a.angleDeg) - wrap360(b.angleDeg));
    const gaps = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = wrap360(ordered[i].angleDeg);
      const b = wrap360(ordered[(i + 1) % ordered.length].angleDeg);
      gaps.push(wrap360(b - a));
    }
    const meanGap = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    const stdGap = Math.sqrt(gaps.reduce((s, v) => s + (v - meanGap) * (v - meanGap), 0) / gaps.length);
    ring = { ordered, gaps, meanGap, stdGap };
  }

  let score = 100;
  const notes = [];

  if (ring) {
    const eqPenalty = Math.min(1, ring.stdGap / 20);
    score -= eqPenalty * 40;
    if (eqPenalty > 0.5) notes.push("Surround spacing uneven; consider equalising gaps.");
  }

  const checkTarget = (role, want, label) => {
    if (!want) return;
    const found = samples.filter((s) => s.role === role);
    found.forEach((s) => {
      const err = Math.abs(s.absDeg - want);
      const p = Math.min(1, err / 20);
      score -= p * 10;
      if (err > 12) notes.push(`${label || role} ~${Math.round(s.absDeg)}° (target ${want}°)`);
    });
  };

  checkTarget("FWR", targets.frontWideDeg, "Front Wide (R)");
  checkTarget("FWL", targets.frontWideDeg, "Front Wide (L)");
  checkTarget("SR", targets.sideDeg, "Side (R)");
  checkTarget("SL", targets.sideDeg, "Side (L)");
  checkTarget("RRS", targets.rearDeg, "Rear (R)");
  checkTarget("LRS", targets.rearDeg, "Rear (L)");

  score = Math.max(0, Math.min(100, score));

  return { mlp, samples, ring, score, notes };
}

/**
 * Propose equal-gap nudges along walls, clamped to pad rectangles.
 * Pure function. Does not mutate inputs.
 * @param {{ mlp: MLP; speakers: Speaker[]; padsById: Record<string, PadConstraint|undefined>; targets: RP22Targets }} params
 * @returns {EqualiseResult}
 */
export function proposeEqualisedNudges(params) {
  const { mlp, speakers, padsById, targets } = params;

  const before = computeRP22Metrics(mlp, speakers, targets);

  if (!before.ring) {
    return { metricsBefore: before, metricsAfter: before, nudges: [] };
  }

  const N = before.ring.ordered.length;
  const desiredGap = 360 / Math.max(1, N);

  const firstAng = wrap360(before.ring.ordered[0].angleDeg);
  const desiredAngles = [];
  for (let i = 0; i < N; i++) desiredAngles.push(wrap360(firstAng + i * desiredGap));

  const nudges = before.ring.ordered.map((s, idx) => {
    const want = desiredAngles[idx];

    const pad = padsById[s.id];
    const current = speakers.find((sp) => sp.id === s.id);
    let target = current ? { x: current.position.x, y: current.position.y } : { x: mlp.x, y: mlp.y };

    const a = (want * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (pad) {
      if (pad.orientation === "front") {
        const yWall = pad.y;
        const t = dy === 0 ? 0 : (yWall - mlp.y) / dy;
        const x = mlp.x + dx * t;
        target = { x: clamp(x, pad.x, pad.x + pad.width), y: yWall };
      } else if (pad.orientation === "left") {
        const xWall = pad.x;
        const t = dx === 0 ? 0 : (xWall - mlp.x) / dx;
        const y = mlp.y + dy * t;
        target = { x: xWall, y: clamp(y, pad.y, pad.y + pad.height) };
      } else if (pad.orientation === "right") {
        const xWall = pad.x + pad.width;
        const t = dx === 0 ? 0 : (xWall - mlp.x) / dx;
        const y = mlp.y + dy * t;
        target = { x: xWall, y: clamp(y, pad.y, pad.y + pad.height) };
      } else if (pad.orientation === "back") {
        const yWall = pad.y + pad.height;
        const t = dy === 0 ? 0 : (yWall - mlp.y) / dy;
        const x = mlp.x + dx * t;
        target = { x: clamp(x, pad.x, pad.x + pad.width), y: yWall };
      }
    }

    return { id: s.id, role: s.role, target, targetAngleDeg: want };
  });

  const movedSpeakers = speakers.map((sp) => {
    const n = nudges.find((x) => x.id === sp.id);
    return n ? { ...sp, position: { x: n.target.x, y: n.target.y } } : sp;
  });

  const after = computeRP22Metrics(mlp, movedSpeakers, targets);
  return { metricsBefore: before, metricsAfter: after, nudges };
}