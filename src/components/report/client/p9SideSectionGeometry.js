/**
 * p9SideSectionGeometry
 * ---------------------
 * Pure geometry for the RP22 Parameter 9 (overhead speaker spacing) side
 * section — the "how P9 is measured" drawing.
 *
 * P9 is SEAT-scoped. Each seat's result is the largest vertical angle between
 * ADJACENT overhead rows as seen from that seat, so the drawing has two real
 * listening points — one in the front seating row and one in the rear seating
 * row — and draws, for each of them, the adjacent-row wedges in one shared
 * section:
 *
 *   - each overhead row at its real installed acoustic centre (never moved and
 *     never projected to make an angle read better)
 *   - each listening point at a real seat's own depth (y) and ear height (z)
 *   - one ray from that listening point to each overhead row
 *   - one translucent wedge per ADJACENT row pair, spanning exactly the two real
 *     rays it compares, so the drawn wedge IS that row's adjacent-row angle
 *
 * The reference seating position is not drawn and no RSP fan exists: P9 is not
 * an RSP-scoped result. Every DISPLAYED value comes from the published per-seat
 * results (p9SeatScopeAuthority); this module supplies drawing primitives only.
 * Pure: no React, no SDK, no writes.
 */

export const P9_SIDE_SVG_W = 760;
export const P9_SIDE_PADDING_M = 0.6;

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

// The two adjacent-gap wedges: one tone per adjacent pair, in row order. The
// pair starting at the front row is the soft warm taupe, the pair starting at
// the middle row the deeper warm brown, so the two gaps read apart at a glance
// while both staying inside the report palette.
export const P9_WEDGE_FILLS = ["#C1B6AD", "#625143"];
export const P9_WEDGE_FILL_OPACITY = 0.16;
// The limiting (largest) adjacent gap for a row is the only wedge given a solid,
// heavier outline.
export const P9_WEDGE_LIMITING_INK = "#4A230F";

// Arc radius as a fraction of the shorter of the two rays it spans: every arc
// and every wedge stays inside the real triangle formed by those two rays.
export const P9_SIDE_ARC_RADIUS_FRACTION = 0.5;
export const P9_SIDE_WEDGE_CAPTION_OFFSET_PX = 14;

// Row result chip metrics, shared with the drawing so both agree on placement.
export const P9_VIEW_CHIP_W = 132;
export const P9_VIEW_CHIP_H = 40;
export const P9_VIEW_CHIP_OFFSET_PX = 52;

const isNum = (v) => Number.isFinite(Number(v));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

/** Polar → SVG point, elevation measured from the horizontal plane at the listening point. */
export function p9SidePolarPoint(cx, cy, radiusPx, elevationDeg) {
  const rad = (elevationDeg * Math.PI) / 180;
  return {
    x: cx + radiusPx * Math.cos(rad),
    y: cy - radiusPx * Math.sin(rad),
  };
}

/**
 * SVG arc between two elevations, centred on the listening point. Increasing
 * elevation appears counter-clockwise on screen (SVG y axis points down), so a
 * decreasing sweep takes sweep-flag 1.
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
 * The filled wedge for one adjacent pair: from the listening point out along the
 * two real rays, closed by the arc of that pair's own angle. Nothing is drawn
 * outside the rays it compares.
 */
export function p9SideSectorPath(cx, cy, radiusPx, fromDeg, toDeg) {
  const start = p9SidePolarPoint(cx, cy, radiusPx, fromDeg);
  const end = p9SidePolarPoint(cx, cy, radiusPx, toDeg);
  const sweepDeg = Math.abs(toDeg - fromDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  const sweep = toDeg < fromDeg ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radiusPx} ${radiusPx} 0 ${largeArc} ${sweep} ${end.x} ${end.y} Z`;
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
 * Place each row's result chip under its own listening point, inside the
 * drawing. A second chip is stepped down when two listening points sit close
 * together horizontally, so two labels can never land on top of each other.
 */
function placeChips(views, svgW, svgH) {
  const minY = P9_VIEW_CHIP_H / 2 + 8;
  const maxY = svgH - P9_VIEW_CHIP_H / 2 - 8;
  const placed = [];
  for (const view of views) {
    const x = clamp(view.px.px, P9_VIEW_CHIP_W / 2 + 8, svgW - P9_VIEW_CHIP_W / 2 - 8);
    let y = clamp(view.px.py + P9_VIEW_CHIP_OFFSET_PX, minY, maxY);
    for (const previous of placed) {
      const overlapsX = Math.abs(previous.x - x) < P9_VIEW_CHIP_W + 10;
      const overlapsY = Math.abs(previous.y - y) < P9_VIEW_CHIP_H + 8;
      if (overlapsX && overlapsY) y = clamp(previous.y + P9_VIEW_CHIP_H + 8, minY, maxY);
    }
    placed.push({ x, y });
    view.chip = { x, y };
  }
}

/**
 * Build the seat-scoped P9 section from the published P9 snapshot geometry and
 * the published seat scope.
 *
 * Returns null when there is not enough real geometry to draw one (fewer than
 * two overhead rows, or no seating row carrying a published result) — the caller
 * then shows the results without a drawing rather than inventing geometry.
 */
export function buildP9SeatScopeSection({ p9Snapshot, seatScope, roomDims }) {
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const heightM = Number(roomDims?.heightM) || 2.4;

  const overheadRows = (Array.isArray(p9Snapshot?.representativeRows) ? p9Snapshot.representativeRows : [])
    .filter((row) => isNum(row?.avgY) && isNum(row?.avgZ) && P9_SIDE_ROW_DISPLAY[row?.rowName])
    .slice()
    .sort((a, b) => (Number(a.rowIndex) || 0) - (Number(b.rowIndex) || 0));

  // Two adjacent rows are the minimum P9 can be measured between.
  if (overheadRows.length < 2) return null;

  const totalW = lengthM + P9_SIDE_PADDING_M * 2;
  const totalH = heightM + P9_SIDE_PADDING_M * 2;
  const svgW = P9_SIDE_SVG_W;
  const svgH = Math.round(svgW * (totalH / totalW));
  const scale = svgW / totalW;

  // Section coordinates: horizontal = distance from the screen plane (front of
  // the room at 0), vertical = height above the floor.
  const toPx = (y, z) => ({
    px: (Number(y) + P9_SIDE_PADDING_M) * scale,
    py: svgH - (Number(z) + P9_SIDE_PADDING_M) * scale,
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

  const rows = overheadRows.map((row) => {
    const rowName = row.rowName;
    const point = { y: Number(row.avgY), z: Number(row.avgZ) };
    return {
      rowName,
      displayName: P9_SIDE_ROW_DISPLAY[rowName],
      roleLabel: P9_SIDE_ROW_ROLE_LABELS[rowName] || "",
      color: P9_SIDE_ROW_COLORS[rowName] || "#625143",
      point,
      px: toPx(point.y, point.z),
      speakers: collectRowSpeakers(installedByRow[rowName] || []).map((spk) => ({
        ...spk,
        px: toPx(spk.y, spk.z),
      })),
    };
  });

  // The front and rear seating rows: the two rows whose own listening points
  // explain why the row results differ. Every seat's result is listed beneath
  // the drawing, so no row is ever hidden from the report.
  const listeningRows = (Array.isArray(seatScope?.rows) ? seatScope.rows : [])
    .filter((row) => isNum(row?.listening?.y) && isNum(row?.listening?.z))
    .slice()
    .sort((a, b) => a.rowIndex - b.rowIndex);
  if (listeningRows.length === 0) return null;

  const shownRows = listeningRows.length <= 2
    ? listeningRows
    : [listeningRows[0], listeningRows[listeningRows.length - 1]];

  const views = shownRows.map((row) => {
    const listening = { y: Number(row.listening.y), z: Number(row.listening.z) };
    const point = toPx(listening.y, listening.z);

    const rays = rows.map((overhead) => {
      const dy = overhead.point.y - listening.y;
      const dz = overhead.point.z - listening.z;
      return {
        rowName: overhead.rowName,
        displayName: overhead.displayName,
        color: overhead.color,
        point: overhead.point,
        px: overhead.px,
        lengthM: Math.hypot(dy, dz),
        elevDeg: (Math.atan2(dz, dy) * 180) / Math.PI,
      };
    });

    const wedges = [];
    for (let i = 1; i < rays.length; i++) {
      const from = rays[i - 1];
      const to = rays[i];
      const radiusPx = P9_SIDE_ARC_RADIUS_FRACTION * Math.min(from.lengthM, to.lengthM) * scale;
      if (!(radiusPx > 0)) continue;
      const midDeg = (from.elevDeg + to.elevDeg) / 2;
      wedges.push({
        fromRowName: from.rowName,
        toRowName: to.rowName,
        label: `${from.displayName} ↔ ${to.displayName}`,
        deg: Math.abs(to.elevDeg - from.elevDeg),
        fromDeg: from.elevDeg,
        toDeg: to.elevDeg,
        radiusPx,
        fill: P9_WEDGE_FILLS[Math.min(i - 1, P9_WEDGE_FILLS.length - 1)],
        sectorPath: p9SideSectorPath(point.px, point.py, radiusPx, from.elevDeg, to.elevDeg),
        arcPath: p9SideArcPath(point.px, point.py, radiusPx, from.elevDeg, to.elevDeg),
        captionPx: p9SidePolarPoint(
          point.px,
          point.py,
          radiusPx + P9_SIDE_WEDGE_CAPTION_OFFSET_PX,
          midDeg,
        ),
        isLimiting: false,
      });
    }
    if (wedges.length === 0) return null;

    // The largest adjacent gap for THIS row is that row's P9 quantity, so it is
    // the only wedge drawn with the heavier outline.
    let limitingIndex = 0;
    for (let i = 1; i < wedges.length; i++) {
      if (wedges[i].deg > wedges[limitingIndex].deg) limitingIndex = i;
    }
    wedges[limitingIndex].isLimiting = true;

    return {
      key: `seat-row-${row.rowIndex}`,
      label: row.label,
      seatCount: row.seatCount,
      angle: row.angle ?? null,
      level: row.level ?? null,
      hasResult: isNum(row.angle),
      listening,
      px: point,
      rays,
      wedges,
      limitingWedge: wedges[limitingIndex],
    };
  }).filter(Boolean);

  if (views.length === 0) return null;

  placeChips(views, svgW, svgH);

  return {
    svgW,
    svgH,
    scale,
    paddingM: P9_SIDE_PADDING_M,
    lengthM,
    heightM,
    toPx,
    rows,
    views,
  };
}