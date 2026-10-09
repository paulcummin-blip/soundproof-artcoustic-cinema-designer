/**
 * p9SideSectionGeometry
 * ---------------------
 * Pure geometry for the RP22 Parameter 9 (overhead speaker spacing) side
 * section — the RSP design illustration only.
 *
 * It reads the published P9 snapshot's own geometry and nothing else:
 *   - the RSP at its real room position and ear height
 *   - each overhead row at its real ceiling position (a row centre is the
 *     average of that row's installed speakers' own coordinates)
 * and returns side-section drawing primitives:
 *   - one ray per overhead row, every ray originating at the RSP
 *   - one angular arc per ADJACENT row pair, every arc centred on the RSP and
 *     drawn inside the real triangle formed by the two rays it spans
 *
 * Nothing is moved, projected or invented to make an angle readable, and no
 * decorative radius is used: every arc starts and ends on the real rays, so the
 * drawn gap IS the angle measured from the RSP.
 *
 * P9 itself remains seat-scoped. This module never grades anything, never
 * changes a threshold and never replaces the per-seat authority. Pure: no
 * React, no SDK, no writes.
 */

export const P9_SIDE_SVG_W = 760;
export const P9_SIDE_PADDING_M = 0.6;

// Arc radius, as a fraction of the shorter of the two rays it spans: the arc
// always sits inside the real triangle formed by those rays.
export const P9_SIDE_ARC_RADIUS_FRACTION = 0.55;
export const P9_SIDE_ARC_LABEL_OFFSET_PX = 16;
export const P9_SIDE_PAIR_LABEL_OFFSET_PX = 32;
export const P9_SIDE_CHIP_OFFSET_PX = 66;

export const P9_SIDE_FONT_FAMILY = "Didact Gothic, Century Gothic, sans-serif";

export const P9_SIDE_ROW_COLORS = {
  front: "#625143",
  mid: "#213428",
  rear: "#4A230F",
};

export const P9_SIDE_ROW_ROLE_LABELS = {
  front: "TFL / TFR",
  mid: "TML / TMR",
  rear: "TRL / TRR",
};

export const P9_SIDE_ROW_DISPLAY = {
  front: "FRONT",
  mid: "MIDDLE",
  rear: "REAR",
};

const isNum = (v) => Number.isFinite(Number(v));

/**
 * The overhead row a canonical role belongs to. Identical rule to the RP22
 * upper-seat metric engine, so the drawing and the assessment agree on which
 * speakers form which row.
 */
export function p9SideRowNameForRole(role) {
  const r = String(role || "").toUpperCase();
  if (r.startsWith("TF")) return "front";
  if (r.startsWith("TM")) return "mid";
  if (r.startsWith("TR") || r.startsWith("TB")) return "rear";
  return null;
}

/** Polar → SVG point, elevation measured from the horizontal plane at the RSP. */
export function p9SidePolarPoint(cx, cy, radiusPx, elevationDeg) {
  const rad = (elevationDeg * Math.PI) / 180;
  return {
    x: cx + radiusPx * Math.cos(rad),
    y: cy - radiusPx * Math.sin(rad),
  };
}

/**
 * SVG arc between two elevations, centred on the RSP. Increasing elevation
 * appears counter-clockwise on screen (SVG y axis points down), so a decreasing
 * sweep takes sweep-flag 1.
 */
export function p9SideArcPath(cx, cy, radiusPx, fromDeg, toDeg) {
  const start = p9SidePolarPoint(cx, cy, radiusPx, fromDeg);
  const end = p9SidePolarPoint(cx, cy, radiusPx, toDeg);
  const sweepDeg = Math.abs(toDeg - fromDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  const sweep = toDeg < fromDeg ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radiusPx} ${radiusPx} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

/**
 * The row's installed speakers, de-duplicated to unique positions: a left and a
 * right speaker of the same row share one position in side section, so they are
 * drawn once — never shifted to separate them. Roles are kept for the label.
 */
function collectRowSpeakers(speakers) {
  const seen = new Map();
  for (const spk of speakers) {
    const key = `${spk.y.toFixed(2)}|${spk.z.toFixed(2)}`;
    if (!seen.has(key)) {
      seen.set(key, { y: spk.y, z: spk.z, roles: [] });
    }
    seen.get(key).roles.push(spk.role);
  }
  return [...seen.values()];
}

/**
 * Build the whole side section from the published P9 snapshot.
 *
 * Returns null when there is not enough real geometry to draw one (no RSP, or
 * fewer than two overhead rows) — the caller then shows the per-seat result
 * without a drawing rather than inventing geometry.
 */
export function buildP9SideSection({ p9Snapshot, roomDims }) {
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const heightM = Number(roomDims?.heightM) || 2.4;

  const rsp = p9Snapshot?.rsp;
  const rspY = Number(rsp?.y);
  const rspZ = isNum(rsp?.z)
    ? Number(rsp.z)
    : (isNum(p9Snapshot?.earHeightM) ? Number(p9Snapshot.earHeightM) : 1.2);

  const rows = (Array.isArray(p9Snapshot?.representativeRows) ? p9Snapshot.representativeRows : [])
    .filter((row) => isNum(row?.avgY) && isNum(row?.avgZ) && P9_SIDE_ROW_DISPLAY[row?.rowName])
    .slice()
    .sort((a, b) => (Number(a.rowIndex) || 0) - (Number(b.rowIndex) || 0));

  if (!isNum(rspY) || rows.length < 2) return null;

  const paddingM = P9_SIDE_PADDING_M;
  const totalW = lengthM + paddingM * 2;
  const totalH = heightM + paddingM * 2;
  const svgW = P9_SIDE_SVG_W;
  const svgH = Math.round(svgW * (totalH / totalW));
  const scale = svgW / totalW;

  // Section coordinates: horizontal = distance from the screen plane (front of
  // the room at 0), vertical = height above the floor.
  const toPx = (y, z) => ({
    px: (Number(y) + paddingM) * scale,
    py: svgH - (Number(z) + paddingM) * scale,
  });

  const installedByRow = { front: [], mid: [], rear: [] };
  for (const spk of Array.isArray(p9Snapshot?.upperSpeakers) ? p9Snapshot.upperSpeakers : []) {
    const pos = spk?.position;
    if (!isNum(pos?.y) || !isNum(pos?.z)) continue;
    const rowName = p9SideRowNameForRole(spk?.role);
    if (!rowName) continue;
    installedByRow[rowName].push({
      y: Number(pos.y),
      z: Number(pos.z),
      role: String(spk.role || "").toUpperCase(),
    });
  }

  const rspPx = toPx(rspY, rspZ);

  const rays = rows.map((row) => {
    const rowName = row.rowName;
    const point = { y: Number(row.avgY), z: Number(row.avgZ) };
    const px = toPx(point.y, point.z);
    const dy = point.y - rspY;
    const dz = point.z - rspZ;
    return {
      rowName,
      displayName: P9_SIDE_ROW_DISPLAY[rowName],
      roleLabel: P9_SIDE_ROW_ROLE_LABELS[rowName] || "",
      color: P9_SIDE_ROW_COLORS[rowName] || "#625143",
      point,
      px,
      lengthM: Math.hypot(dy, dz),
      elevDeg: (Math.atan2(dz, dy) * 180) / Math.PI,
      speakers: collectRowSpeakers(installedByRow[rowName] || []).map((spk) => ({
        ...spk,
        px: toPx(spk.y, spk.z),
      })),
    };
  });

  const gaps = [];
  for (let i = 1; i < rays.length; i++) {
    const from = rays[i - 1];
    const to = rays[i];
    const radiusPx = P9_SIDE_ARC_RADIUS_FRACTION * Math.min(from.lengthM, to.lengthM) * scale;
    const midDeg = (from.elevDeg + to.elevDeg) / 2;
    gaps.push({
      fromRowName: from.rowName,
      toRowName: to.rowName,
      label: `${from.displayName} ↔ ${to.displayName}`,
      deg: Math.abs(to.elevDeg - from.elevDeg),
      fromDeg: from.elevDeg,
      toDeg: to.elevDeg,
      radiusPx,
      path: p9SideArcPath(rspPx.px, rspPx.py, radiusPx, from.elevDeg, to.elevDeg),
      degreesPx: p9SidePolarPoint(rspPx.px, rspPx.py, radiusPx + P9_SIDE_ARC_LABEL_OFFSET_PX, midDeg),
      pairPx: p9SidePolarPoint(rspPx.px, rspPx.py, radiusPx + P9_SIDE_PAIR_LABEL_OFFSET_PX, midDeg),
      chipPx: p9SidePolarPoint(rspPx.px, rspPx.py, radiusPx + P9_SIDE_CHIP_OFFSET_PX, midDeg),
      isLimiting: false,
    });
  }

  // The largest adjacent-row separation is the P9 quantity — mark it so the
  // limiting pair is unmistakable.
  let limitingIndex = 0;
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i].deg > gaps[limitingIndex].deg) limitingIndex = i;
  }
  if (gaps.length > 0) gaps[limitingIndex].isLimiting = true;

  return {
    svgW,
    svgH,
    scale,
    paddingM,
    lengthM,
    heightM,
    toPx,
    rsp: { x: Number(rsp?.x), y: rspY, z: rspZ, px: rspPx },
    rays,
    gaps,
    limitingGap: gaps[limitingIndex] || null,
    // Published P9 level for the same page; never derived here.
    level: p9Snapshot?.level ?? null,
    publishedWorstGapDeg: isNum(p9Snapshot?.worstGapDeg) ? Number(p9Snapshot.worstGapDeg) : null,
  };
}