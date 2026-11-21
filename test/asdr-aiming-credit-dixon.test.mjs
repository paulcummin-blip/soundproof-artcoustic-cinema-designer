// asdr-aiming-credit-dixon.test.mjs
// Comprehensive Dixon validation for the ASDR speaker-aiming credit correction.
//
// Computes P17 per-speaker entries from Dixon's actual saved geometry using the
// same formulas as the P17 engine (angleFromTo, resolveSpeakerYaw, coverage
// windows), then feeds them through the full ASDR rating adapter to produce
// complete primary and secondary DPI.
//
// The import.meta.glob in the measured-dataset registry prevents running
// computeP17ForAllSeats directly in Node, so the geometry is computed here
// using the same pure-math formulas. Bed-layer speakers use Q4-3 declared
// dispersion windows (l4=38, l3=54, l2=72). Overheads use estimated family-
// default windows (l4=45, l3=55, l2≈62) with the 22° built-in tilt toward RSP.
//
// Verifies:
//  - Net pair improvement (not max-of-pair): deterioration in one speaker
//    cannot conceal improvement in the other.
//  - The adverse deterioration case (SBL/SBR at seat C1) earns ZERO credit.
//  - Monotonicity: more improvement never lowers the score.
//  - No speaker-count inflation.
//  - Complete primary and secondary DPI for all five configurations.
//  - Continuous P17 coverage points and aiming credit are reported.
//
// Run: node --import ./test/_mount-loader.mjs test/asdr-aiming-credit-dixon.test.mjs

import {
  buildArtcousticDesignRatingAuthority,
  calculateScopedRoomDesignRating,
} from "../src/components/report/technical/artcousticSystemDesignRating.js";
import { computeSeatAimingPoints } from "../src/components/report/technical/asdrAimingCredit.js";
import {
  computeP17CoveragePoints,
  continuousSpeakerQuality,
  P17_COVERAGE_CONSTANTS,
} from "../src/components/report/technical/p17ContinuousCoverageBonus.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
let failures = 0;
function check(label, condition, detail) {
  const ok = !!condition;
  console.log(`    ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── Dixon geometry ────────────────────────────────────────────────────
const ROOM = { widthM: 5.6, lengthM: 6.69, heightM: 2.7 };
const RSP = { x: 0, y: 3.3298474443630526, z: 1.2 };
const EAR_Z = 1.2;

const SEATS = [
  { id: "seat-r1-c1", x: 1.6, y: 3.3298474443630526, priority: "secondary" },
  { id: "seat-r1-c2", x: 2.2, y: 3.3298474443630526, priority: "primary" },
  { id: "seat-r1-c3", x: 2.8, y: 3.3298474443630526, priority: "primary" },
  { id: "seat-r1-c4", x: 3.4, y: 3.3298474443630526, priority: "primary" },
  { id: "seat-r1-c5", x: 4.0, y: 3.3298474443630526, priority: "secondary" },
];

// Bed-layer speakers (Q4-3): dispersion minus1p5dB=38, minus3dB=54, minus5dB=72
const Q43_WINDOWS = { l4Deg: 38, l3Deg: 54, l2Deg: 72, usableDb: 5.0 };

// Overheads (Spitfire Cloud): no declared dispersion → family default
// l4Deg=45, l3Deg=55, l2Deg=implied(45,55)=55+1/(1.5/10)≈61.67
const OVERHEAD_WINDOWS = { l4Deg: 45, l3Deg: 55, l2Deg: 62, usableDb: 4.0 };
const OVERHEAD_TILT = 22;

const BED_SPEAKERS = [
  { role: "SL",  x: 0.065, y: 3.324 },
  { role: "SR",  x: 5.535, y: 3.324 },
  { role: "SBL", x: 0.909, y: 6.625 },
  { role: "SBR", x: 4.691, y: 6.625 },
  { role: "LW",  x: 0.139, y: 1.265 },
  { role: "RW",  x: 5.461, y: 1.265 },
];

const OVERHEADS = [
  { role: "TFL", x: 1.401, y: 2.105 },
  { role: "TFR", x: 4.199, y: 2.105 },
  { role: "TML", x: 1.401, y: 3.325 },
  { role: "TMR", x: 4.199, y: 3.325 },
  { role: "TRL", x: 1.401, y: 4.545 },
  { role: "TRR", x: 4.199, y: 4.545 },
];

const WALL_NORMAL = { SL: -90, SR: 90, LW: -90, RW: 90, SBL: 180, SBR: 180 };

const PRIMARY_IDS = SEATS.filter((s) => s.priority === "primary").map((s) => s.id);
const SECONDARY_IDS = SEATS.filter((s) => s.priority === "secondary").map((s) => s.id);

// ── Geometry helpers (same conventions as rp22HfOffAxis.jsx) ──────────

// 0° = +Y (into room), clockwise positive. Matches yawFromToPlan.
function angleFromTo(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!isNum(dx) || !isNum(dy)) return null;
  return -(Math.atan2(dx, dy) * 180) / Math.PI;
}

// _yawFromTo: aim direction from speaker position toward target
function yawFromTo(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!isNum(dx) || !isNum(dy)) return null;
  return -(Math.atan2(dx, dy) * 180) / Math.PI;
}

// Shortest angular distance between two headings (0..180)
function shortestAngleDeg(a, b) {
  let diff = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(diff);
}

// ── Resolve speaker yaw for a given aim configuration ─────────────────
function resolveYaw(role, pos, aim) {
  const r = String(role).toUpperCase();
  const wallFlat = WALL_NORMAL[r];
  if (wallFlat == null) return 0;

  const isFW = r === "LW" || r === "RW";
  const isSide = r === "SL" || r === "SR" || /^SL\d+$/.test(r) || /^SR\d+$/.test(r);
  const isRear = r === "SBL" || r === "SBR";

  if (isFW && aim.frontWides) return yawFromTo(pos, RSP) ?? wallFlat;
  if (isSide && aim.sideSurrounds) return yawFromTo(pos, RSP) ?? wallFlat;
  if (isRear && aim.rearSurrounds) return yawFromTo(pos, RSP) ?? wallFlat;
  return wallFlat;
}

// ── Compute bed-layer per-speaker entry for one seat ──────────────────
function bedSpeakerEntry(spk, seat, aim) {
  const pos = { x: spk.x, y: spk.y };
  const seatPos = { x: seat.x, y: seat.y };
  const seatAz = angleFromTo(pos, seatPos);
  if (!isNum(seatAz)) return null;

  const yaw = resolveYaw(spk.role, pos, aim);
  const wallFlat = WALL_NORMAL[spk.role];

  const offAxisRaw = shortestAngleDeg(seatAz, yaw);
  const wallFlatRaw = isNum(wallFlat) ? shortestAngleDeg(seatAz, wallFlat) : null;

  const offAxis = Math.max(0, Math.floor(offAxisRaw + 1e-9));
  const wallFlatOffAxis = isNum(wallFlatRaw) ? Math.max(0, Math.floor(wallFlatRaw + 1e-9)) : null;

  // Window level from off-axis angle vs windows
  const level = gradeAngle(offAxis, Q43_WINDOWS);
  const wallFlatLevel = isNum(wallFlatOffAxis) ? gradeAngle(wallFlatOffAxis, Q43_WINDOWS) : null;

  return {
    role: spk.role,
    angleDeg: offAxis,
    offAxisDeg: offAxis,
    wallFlatOffAxisDeg: wallFlatOffAxis,
    windows: Q43_WINDOWS,
    windowLevel: level.label,
    windowLevelNumber: level.number,
    windowDb: level.db,
    // Quality values for diagnostics
    qCurrent: continuousSpeakerQuality({ angleDeg: offAxis, windows: Q43_WINDOWS }),
    qWallFlat: isNum(wallFlatOffAxis) ? continuousSpeakerQuality({ angleDeg: wallFlatOffAxis, windows: Q43_WINDOWS }) : null,
  };
}

// ── Compute overhead per-speaker entry for one seat ──────────────────
function overheadEntry(spk, seat) {
  const spkZ = ROOM.heightM;
  const seatZ = EAR_Z;
  const pos3 = { x: spk.x, y: spk.y, z: spkZ };
  const seatPos = { x: seat.x, y: seat.y, z: seatZ };

  // Speaker→seat vector
  const seatVec = { x: seatPos.x - pos3.x, y: seatPos.y - pos3.y, z: seatPos.z - pos3.z };
  const magSeat = Math.sqrt(seatVec.x ** 2 + seatVec.y ** 2 + seatVec.z ** 2);
  if (magSeat < 0.01) return null;

  // Straight-down axis
  const downAxis = { x: 0, y: 0, z: -1 };

  // Raw angle between down axis and speaker→seat
  const dotRaw = downAxis.z * seatVec.z; // downAxis.x=0, downAxis.y=0
  const rawAngle = Math.acos(Math.max(-1, Math.min(1, dotRaw / magSeat))) * 180 / Math.PI;

  // Aimed axis: tilt down axis toward RSP by OVERHEAD_TILT degrees
  const rspX = RSP.x - pos3.x;
  const rspY = RSP.y - pos3.y;
  const rspHorizMag = Math.sqrt(rspX ** 2 + rspY ** 2);

  let effAngle;
  if (rspHorizMag < 0.01) {
    effAngle = rawAngle;
  } else {
    const hx = rspX / rspHorizMag;
    const hy = rspY / rspHorizMag;
    const tiltRad = (OVERHEAD_TILT * Math.PI) / 180;
    const aimedAxis = { x: Math.sin(tiltRad) * hx, y: Math.sin(tiltRad) * hy, z: -Math.cos(tiltRad) };
    const dotEff = aimedAxis.x * seatVec.x + aimedAxis.y * seatVec.y + aimedAxis.z * seatVec.z;
    const magAimed = Math.sqrt(aimedAxis.x ** 2 + aimedAxis.y ** 2 + aimedAxis.z ** 2);
    effAngle = Math.acos(Math.max(-1, Math.min(1, dotEff / (magAimed * magSeat)))) * 180 / Math.PI;
  }

  const offAxis = Math.max(0, Math.floor(effAngle + 1e-9));
  const level = gradeAngle(offAxis, OVERHEAD_WINDOWS);

  return {
    role: spk.role,
    angleDeg: offAxis,
    offAxisDeg: offAxis,
    wallFlatOffAxisDeg: null, // overheads: no wall-flat reference
    windows: OVERHEAD_WINDOWS,
    windowLevel: level.label,
    windowLevelNumber: level.number,
    windowDb: level.db,
    qCurrent: continuousSpeakerQuality({ angleDeg: offAxis, windows: OVERHEAD_WINDOWS }),
    qWallFlat: null,
  };
}

// ── Grade an off-axis angle against coverage windows ──────────────────
function gradeAngle(angleDeg, windows) {
  const a = Math.abs(angleDeg);
  if (a <= windows.l4Deg) return { label: "L4", number: 4, db: 1.5 };
  if (a <= windows.l3Deg) return { label: "L3", number: 3, db: 3.0 };
  if (a <= windows.l2Deg) return { label: "L2", number: 2, db: 4.0 };
  // Beyond usable: L1, floored to L2 by the engine
  return { label: "L2", number: 2, db: 4.0 }; // engine floors L1→L2
}

// ── Build per-speaker array for one seat under one aim config ────────
function buildPerSpeaker(seat, aim) {
  const entries = [];
  for (const spk of BED_SPEAKERS) {
    const e = bedSpeakerEntry(spk, seat, aim);
    if (e) entries.push(e);
  }
  for (const spk of OVERHEADS) {
    const e = overheadEntry(spk, seat);
    if (e) entries.push(e);
  }
  return entries;
}

// ── Build P17 seat metric (worst-covered channel limits the seat) ─────
function buildP17SeatMetric(perSpeaker) {
  if (!perSpeaker.length) return null;
  let worstLevel = 5;
  let worstEntry = null;
  for (const e of perSpeaker) {
    if (e.windowLevelNumber == null) continue;
    if (e.windowLevelNumber < worstLevel ||
        (e.windowLevelNumber === worstLevel && e.angleDeg > (worstEntry?.angleDeg ?? -Infinity))) {
      worstLevel = e.windowLevelNumber;
      worstEntry = e;
    }
  }
  if (!worstEntry) return null;
  // Engine floors L1 to L2
  const seatLevel = Math.max(2, worstLevel);
  const seatDb = seatLevel === 4 ? 1.5 : seatLevel === 3 ? 3.0 : 4.0;
  return {
    p17Db: seatDb,
    windowLevel: `L${seatLevel}`,
    windowLevelNumber: seatLevel,
    windows: worstEntry.windows,
    perSpeaker,
  };
}

// ── Build rating input for all seats under one aim config ────────────
function buildRatingInput(aim) {
  const p17 = {};
  for (const seat of SEATS) {
    const perSpeaker = buildPerSpeaker(seat, aim);
    const metric = buildP17SeatMetric(perSpeaker);
    if (!metric || !isNum(metric.p17Db)) {
      p17[seat.id] = null;
    } else {
      p17[seat.id] = {
        rawValue: metric.p17Db,
        p17PerSpeaker: metric.perSpeaker,
      };
    }
  }
  return {
    seats: SEATS.map((s) => ({ id: s.id, priority: s.priority })),
    p17,
  };
}

// ── Compute DPI for one configuration ──────────────────────────────────
function computeDpi(aim) {
  const input = buildRatingInput(aim);
  const authority = buildArtcousticDesignRatingAuthority(input);
  const primary = calculateScopedRoomDesignRating(authority, PRIMARY_IDS);
  const secondary = calculateScopedRoomDesignRating(authority, SECONDARY_IDS);
  return { input, authority, primary, secondary };
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 1: Adverse deterioration case — EXACT values from Work's diagnosis
// ═══════════════════════════════════════════════════════════════════════
// At Dixon's secondary seat C1 with rear surrounds aimed:
//   SBL: q 0.92763 → 0.56250  (gain −0.36513, angle 11° → 50°)
//   SBR: q 0.67188 → 0.91447  (gain +0.24259, angle 43° → 13°)
//   Combined: 0.79975 → 0.73849 (net −0.06126)
//   Existing algorithm awarded +7.27796 raw points (the bug).
// The corrected method must award ZERO.
console.log("\n=== ASDR AIMING CREDIT — DIXON VALIDATION ===\n");
console.log("1. Adverse deterioration case (exact values from Work diagnosis):");
{
  // Construct entries with the EXACT angles that produce the user's quality values
  // with Q4-3 windows (l4=38, l3=54, l2=72):
  //   q(11°) = 1.0 - 0.25*(11/38) = 0.92763
  //   q(50°) = 0.75 - 0.25*(50-38)/16 = 0.56250
  //   q(43°) = 0.75 - 0.25*(43-38)/16 = 0.67188
  //   q(13°) = 1.0 - 0.25*(13/38) = 0.91447
  const adversePerSpeaker = [
    {
      role: "SBL",
      angleDeg: 50,             // aimed (current) — q = 0.56250
      wallFlatOffAxisDeg: 11,   // wall-flat — q = 0.92763
      windows: Q43_WINDOWS,
      windowLevelNumber: 3,
    },
    {
      role: "SBR",
      angleDeg: 13,             // aimed (current) — q = 0.91447
      wallFlatOffAxisDeg: 43,   // wall-flat — q = 0.67188
      windows: Q43_WINDOWS,
      windowLevelNumber: 4,
    },
  ];

  // Verify the quality values match the user's exact numbers
  const qSBLcur = continuousSpeakerQuality({ angleDeg: 50, windows: Q43_WINDOWS });
  const qSBLflat = continuousSpeakerQuality({ angleDeg: 11, windows: Q43_WINDOWS });
  const qSBRcur = continuousSpeakerQuality({ angleDeg: 13, windows: Q43_WINDOWS });
  const qSBRflat = continuousSpeakerQuality({ angleDeg: 43, windows: Q43_WINDOWS });

  console.log(`    SBL: q(50°)=${qSBLcur?.toFixed(5)}, q(11°)=${qSBLflat?.toFixed(5)}, gain=${(qSBLcur - qSBLflat).toFixed(5)}`);
  console.log(`    SBR: q(13°)=${qSBRcur?.toFixed(5)}, q(43°)=${qSBRflat?.toFixed(5)}, gain=${(qSBRcur - qSBRflat).toFixed(5)}`);

  const netGain = ((qSBLcur - qSBLflat) + (qSBRcur - qSBRflat)) / 2;
  console.log(`    Net pair gain: ${netGain.toFixed(5)}`);

  check("SBL quality matches 0.56250", Math.abs(qSBLcur - 0.56250) < 0.001, `q=${qSBLcur?.toFixed(5)}`);
  check("SBL wall-flat quality matches 0.92763", Math.abs(qSBLflat - 0.92763) < 0.001, `q=${qSBLflat?.toFixed(5)}`);
  check("SBR quality matches 0.91447", Math.abs(qSBRcur - 0.91447) < 0.001, `q=${qSBRcur?.toFixed(5)}`);
  check("SBR wall-flat quality matches 0.67188", Math.abs(qSBRflat - 0.67188) < 0.001, `q=${qSBRflat?.toFixed(5)}`);
  check("net pair gain ≤ 0 (deterioration)", netGain <= 0, `net=${netGain.toFixed(5)}`);

  const aimingPts = computeSeatAimingPoints(adversePerSpeaker, "secondary");
  check("adverse case aiming credit = 0 (net deterioration)", aimingPts === 0, `got ${aimingPts}`);
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 2: Complete DPI for all five configurations
// ═══════════════════════════════════════════════════════════════════════
console.log("\n2. Complete DPI for all five aim configurations:");
{
  const configs = [
    { label: "All wall-flat",        frontWides: false, sideSurrounds: false, rearSurrounds: false },
    { label: "Front wides aimed",    frontWides: true,  sideSurrounds: false, rearSurrounds: false },
    { label: "Rear surrounds aimed", frontWides: false, sideSurrounds: false, rearSurrounds: true  },
    { label: "Wides + rears aimed",   frontWides: true,  sideSurrounds: false, rearSurrounds: true  },
    { label: "Side surrounds aimed",  frontWides: false, sideSurrounds: true,  rearSurrounds: false },
  ];

  const results = [];
  for (const cfg of configs) {
    const { primary, secondary, input } = computeDpi(cfg);
    const primDpi = primary.designPerformanceIndex;
    const secDpi = secondary.designPerformanceIndex;
    const primRaw = primary.actualPoints;
    const secRaw = secondary.actualPoints;

    const p17cPrim = primary.contributions?.find((c) => c.key === "p17");
    const p17cSec = secondary.contributions?.find((c) => c.key === "p17");

    // Per-seat details
    const seatDetails = {};
    for (const seat of SEATS) {
      const p17Seat = input.p17?.[seat.id];
      const perSpeaker = p17Seat?.p17PerSpeaker || [];
      const aiming = computeSeatAimingPoints(perSpeaker, seat.priority);
      const coverage = computeP17CoveragePoints(p17Seat?.rawValue != null ? `L${Math.max(2, Math.min(4, perSpeaker.filter(s => s.windowLevelNumber).reduce((min, s) => Math.min(min, s.windowLevelNumber), 5)))}` : "L2", perSpeaker);

      // Per-group net gains
      const groups = { frontWide: [], sideSurround: [], rearSurround: [] };
      for (const entry of perSpeaker) {
        const r = String(entry.role || "").toUpperCase();
        if (r === "LW" || r === "RW") groups.frontWide.push(entry);
        else if (r === "SBL" || r === "SBR") groups.rearSurround.push(entry);
        else if (r === "SL" || r === "SR" || /^SL\d+$/.test(r) || /^SR\d+$/.test(r)) groups.sideSurround.push(entry);
      }
      const groupGains = {};
      for (const [gName, spkrs] of Object.entries(groups)) {
        if (spkrs.length === 0) continue;
        let sum = 0, cnt = 0;
        for (const spk of spkrs) {
          if (spk.qCurrent != null && spk.qWallFlat != null) {
            sum += spk.qCurrent - spk.qWallFlat;
            cnt += 1;
          }
        }
        groupGains[gName] = cnt > 0 ? sum / cnt : null;
      }

      seatDetails[seat.id] = {
        level: perSpeaker.filter(s => s.windowLevelNumber).reduce((min, s) => Math.min(min, s.windowLevelNumber), 5),
        aiming: Number(aiming.toFixed(2)),
        coverage: Number(coverage.toFixed(2)),
        groupGains,
      };
    }

    results.push({
      label: cfg.label,
      primDpi, secDpi, primRaw, secRaw,
      primAiming: p17cPrim?.aimingPoints ?? 0,
      secAiming: p17cSec?.aimingPoints ?? 0,
      primContinuous: p17cPrim?.continuousPoints ?? 0,
      secContinuous: p17cSec?.continuousPoints ?? 0,
      seatDetails,
    });

    console.log(`\n    ${cfg.label}:`);
    console.log(`      Primary:   DPI=${primDpi} (raw ${primRaw?.toFixed(1)}), aiming=${(p17cPrim?.aimingPoints ?? 0).toFixed(2)}, coverage=${(p17cPrim?.continuousPoints ?? 0).toFixed(2)}`);
    console.log(`      Secondary: DPI=${secDpi} (raw ${secRaw?.toFixed(1)}), aiming=${(p17cSec?.aimingPoints ?? 0).toFixed(2)}, coverage=${(p17cSec?.continuousPoints ?? 0).toFixed(2)}`);
    for (const seat of SEATS) {
      const d = seatDetails[seat.id];
      if (!d) continue;
      const gains = Object.entries(d.groupGains)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}:${v?.toFixed(3)}`)
        .join(", ");
      console.log(`        ${seat.id} (${seat.priority}): L=${d.level}, aim=${d.aiming}, cov=${d.coverage}, gains=[${gains}]`);
    }
  }

  // DPI deltas
  const [flat, fw, rs, both, ss] = results;
  console.log("\n    DPI deltas vs all wall-flat:");
  console.log(`      Front wides:    primary Δ=${fw.primDpi - flat.primDpi}, secondary Δ=${fw.secDpi - flat.secDpi}`);
  console.log(`      Rear surrounds:  primary Δ=${rs.primDpi - flat.primDpi}, secondary Δ=${rs.secDpi - flat.secDpi}`);
  console.log(`      Wides+rears:     primary Δ=${both.primDpi - flat.primDpi}, secondary Δ=${both.secDpi - flat.secDpi}`);
  console.log(`      Side surrounds:  primary Δ=${ss.primDpi - flat.primDpi}, secondary Δ=${ss.secDpi - flat.secDpi}`);

  // Sanity checks
  check("all wall-flat DPI is finite", isNum(flat.primDpi) && isNum(flat.secDpi), `prim=${flat.primDpi}, sec=${flat.secDpi}`);
  check("front wides aimed: DPI changed", fw.primDpi !== flat.primDpi || fw.secDpi !== flat.secDpi, `Δprim=${fw.primDpi - flat.primDpi}, Δsec=${fw.secDpi - flat.secDpi}`);
  check("wides+rears ≥ front wides only (primary)", both.primDpi >= fw.primDpi, `both=${both.primDpi}, fw=${fw.primDpi}`);
  check("wides+rears ≥ rear surrounds only (primary)", both.primDpi >= rs.primDpi, `both=${both.primDpi}, rs=${rs.primDpi}`);
  check("side surrounds aimed: DPI ≤ wall-flat", ss.primDpi <= flat.primDpi && ss.secDpi <= flat.secDpi, `Δprim=${ss.primDpi - flat.primDpi}, Δsec=${ss.secDpi - flat.secDpi}`);
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 3: Monotonicity
// ═══════════════════════════════════════════════════════════════════════
console.log("\n3. Monotonicity (wides+rears ≥ wides-only ≥ wall-flat):");
{
  const flat = computeDpi({ frontWides: false, sideSurrounds: false, rearSurrounds: false });
  const fw = computeDpi({ frontWides: true, sideSurrounds: false, rearSurrounds: false });
  const both = computeDpi({ frontWides: true, sideSurrounds: false, rearSurrounds: true });

  check("primary: both ≥ fw ≥ flat",
    both.primary.designPerformanceIndex >= fw.primary.designPerformanceIndex &&
    fw.primary.designPerformanceIndex >= flat.primary.designPerformanceIndex,
    `flat=${flat.primary.designPerformanceIndex}, fw=${fw.primary.designPerformanceIndex}, both=${both.primary.designPerformanceIndex}`);
  check("secondary: both ≥ fw ≥ flat",
    both.secondary.designPerformanceIndex >= fw.secondary.designPerformanceIndex &&
    fw.secondary.designPerformanceIndex >= flat.secondary.designPerformanceIndex,
    `flat=${flat.secondary.designPerformanceIndex}, fw=${fw.secondary.designPerformanceIndex}, both=${both.secondary.designPerformanceIndex}`);
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 4: No speaker-count inflation
// ═══════════════════════════════════════════════════════════════════════
console.log("\n4. No speaker-count inflation (1 vs 2 front wides, same gain):");
{
  const oneFw = [{ role: "LW", angleDeg: 13, wallFlatOffAxisDeg: 43, windows: Q43_WINDOWS }];
  const twoFw = [
    { role: "LW", angleDeg: 13, wallFlatOffAxisDeg: 43, windows: Q43_WINDOWS },
    { role: "RW", angleDeg: 13, wallFlatOffAxisDeg: 43, windows: Q43_WINDOWS },
  ];
  const pts1 = computeSeatAimingPoints(oneFw, "secondary");
  const pts2 = computeSeatAimingPoints(twoFw, "secondary");
  check("2 front wides earn same as 1 (average, not sum)", Math.abs(pts2 - pts1) < 0.01, `1×: ${pts1.toFixed(3)}, 2×: ${pts2.toFixed(3)}`);
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 5: Identical orientations → identical scores
// ═══════════════════════════════════════════════════════════════════════
console.log("\n5. Identical orientations → identical DPI:");
{
  const a = computeDpi({ frontWides: false, sideSurrounds: false, rearSurrounds: false });
  const b = computeDpi({ frontWides: false, sideSurrounds: false, rearSurrounds: false });
  check("same config → same primary DPI", a.primary.designPerformanceIndex === b.primary.designPerformanceIndex, `${a.primary.designPerformanceIndex} vs ${b.primary.designPerformanceIndex}`);
  check("same config → same secondary DPI", a.secondary.designPerformanceIndex === b.secondary.designPerformanceIndex, `${a.secondary.designPerformanceIndex} vs ${b.secondary.designPerformanceIndex}`);
}

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);