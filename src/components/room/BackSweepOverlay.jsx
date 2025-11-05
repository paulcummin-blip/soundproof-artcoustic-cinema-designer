import React, { useMemo } from "react";

/** Brand colours (no “lego” colours) */
const BRAND = {
  ink: "#213428",
  subtle: "#625143",
  clay: "#C1B6AD",
  rust: "#4A230F",
  slate: "#3E4349",
};

/* ---------- Geometry helpers (CW, 0° = forward) ---------- */
const RAD2DEG = 180 / Math.PI;

function azimuthCW(mlp, p) {
  const dx = p.x - mlp.x;
  const dyForward = mlp.y - p.y; // +y forward
  let deg = Math.atan2(dx, dyForward) * RAD2DEG;
  if (deg < 0) deg += 360;
  return deg; // [0,360)
}

function cwDelta(a, b) {
  return (b - a + 360) % 360; // directed CW
}

/** Strict, symmetric MLP = centre of front row (odd = middle seat, even = midpoint) */
function computeFrontRowCenter(seats, W, L) {
  const valid = (Array.isArray(seats) ? seats : [])
    .filter(s => Number.isFinite(s?.x) && Number.isFinite(s?.y));
  if (!valid.length) return { x: W/2, y: Math.min(L*0.58, L-1.2) };

  const yFront = Math.min(...valid.map(s => s.y));
  const EPS = Math.max(0.01, Math.min(0.12, L * 0.01));
  const row = valid.filter(s => Math.abs(s.y - yFront) <= EPS).sort((a,b)=>a.x-b.x);

  if (!row.length) return { x: W/2, y: yFront };
  const n = row.length;
  if (n % 2 === 1) return { x: row[(n-1)/2].x, y: row[(n-1)/2].y };
  const a = row[n/2 - 1], b = row[n/2];
  return { x: (a.x + b.x)/2, y: a.y };
}

/* ---------- Surround ring ordering (back‑sweep CW) ---------- */
const BED_ROLES = new Set([
  "FWL","FWR","LW","RW",  // wides
  "SL","SR","LS","RS",    // sides
  "SBL","SBR","LRS","RRS","LR","RR" // rears
]);

function rolePriority(role) {
  const r = String(role || "").toUpperCase();
  if (r === "FWR" || r === "RW" || r === "FWL" || r === "LW") return 0; // most forward
  if (r === "SR"  || r === "RS" || r === "SL"  || r === "LS") return 1;
  return 2; // rears
}

function orderBackSweepCW(speakers, mlp) {
  const bed = (Array.isArray(speakers) ? speakers : [])
    .filter(s => BED_ROLES.has(String(s.role || "").toUpperCase())
      && Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y));

  if (!bed.length) return [];

  const withAz = bed.map(s => ({ s, az: azimuthCW(mlp, s.position) }))
                    .sort((a,b)=>a.az - b.az);

  // choose start = the most forward RIGHT‑hand surround (0<az<180),
  // tie‑break by role priority then azimuth
  const right = withAz.filter(x => x.az > 0 && x.az < 180);
  let startIdx = 0;
  if (right.length) {
    right.sort((a,b)=>{
      const pa = rolePriority(a.s.role), pb = rolePriority(b.s.role);
      if (pa !== pb) return pa - pb;
      return a.az - b.az;
    });
    const chosen = right[0].az;
    startIdx = withAz.findIndex(x => x.az === chosen);
  }

  // rotate so sequence starts at the chosen start and goes CW
  return withAz.slice(startIdx).concat(withAz.slice(0,startIdx)).map(x=>x.s);
}

/* ---------- SVG overlay ---------- */
export default function BackSweepOverlay({
  dimensions,
  seatingPositions,
  speakers,
  scale = 1,
  padding = 0,
  visible = true,
}) {
  if (!visible) return null;

  const W = Number(dimensions?.width)  || 4.5;
  const L = Number(dimensions?.length) || 6.0;

  const mlp = useMemo(() => computeFrontRowCenter(seatingPositions, W, L),
    [seatingPositions, W, L]);

  const ordered = useMemo(() => orderBackSweepCW(speakers, mlp),
    [speakers, mlp]);

  if (ordered.length < 2) return null;

  // map metres → SVG px
  const px = (m) => padding + m*scale;

  // back‑sweep lines: connect each speaker to the next, but
  // EXCLUDE the wrap segment that jumps across the screen/front.
  // We treat a segment as “wrap” if its CW delta > 180° or it's the wrap index.
  const segments = [];
  const az = ordered.map(s => azimuthCW(mlp, s.position));
  for (let i = 0; i < ordered.length; i++) {
    const j = (i + 1) % ordered.length;
    const d = cwDelta(az[i], az[j]);
    if (j === 0 || d > 180) continue; // drop wrap
    const a = ordered[i].position, b = ordered[j].position;
    segments.push({ a, b });
  }

  const STROKE = BRAND.ink;          // #213428
  const DOTS   = "6 6";              // dotted
  const WIDTH  = 2;

  return (
    <g data-overlay="angles-back-sweep" style={{ pointerEvents:"none" }}>
      {segments.map((seg, idx) => (
        <line
          key={`seg-${idx}`}
          x1={px(seg.a.x)} y1={px(seg.a.y)}
          x2={px(seg.b.x)} y2={px(seg.b.y)}
          stroke={STROKE}
          strokeWidth={WIDTH}
          strokeDasharray={DOTS}
          strokeLinecap="round"
          opacity={0.9}
        />
      ))}
    </g>
  );
}