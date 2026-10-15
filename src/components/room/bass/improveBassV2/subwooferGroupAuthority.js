// subwooferGroupAuthority.js
// ---------------------------------------------------------------------------
// THE grouping authority for the grouped phase / delay / gain searches.
//
// ONE place decides how a subwoofer layout is split into optimisation groups, so
// the three searches can never group the same design differently. Grouping is
// read from PHYSICAL EVIDENCE — which wall a source sits on, and whether two
// same-model sources are mirrored about the room centre line — never from the
// array index, and never from the source COUNT alone.
//
// One, two, three and four active sources are all searchable:
//
//   1 source    no inter-sub adjustment; position options remain
//   2 sources   one group per source, unless a symmetric same-wall pair
//   3 sources   front + rear pair  ·  front pair + rear  ·  three independent
//   4 sources   front pair + rear pair
//
// The groups decide the ADJUSTMENT variables only — which sources move together.
// They never change the acoustic calculation: every physical source keeps its
// own per-seat transfer and all of them contribute to every seat/frequency
// result, so a group is never substituted for the real sources it contains.
//
// SYMMETRIC PAIR RULE: a clear same-model mirrored pair on one wall stays ONE
// group initially. It preserves symmetry, reflects normal calibration practice
// and keeps the search bounded. Breaking a sensible pair into independent
// settings is an escalation for later, never the first move. The band the pair
// is read with is named in ONE place — practicalPairAuthority: the frozen
// identical band for two sources, the 100 mm installation band for two of three.
// ---------------------------------------------------------------------------

import {
  isPracticalSymmetricPair,
  isIdenticalSymmetricPair,
} from "./practicalPairAuthority.js";

/** Geometry tolerance (m) for "same wall" and the centre-line singleton test. */
export const GROUP_GEOMETRY_TOLERANCE_M = 0.01;

export const SUBWOOFER_GROUP_STATUS = Object.freeze({
  ELIGIBLE: "eligible",
  SKIPPED: "skipped",
  AMBIGUOUS: "ambiguous",
});

const GROUP_IDS = Object.freeze(["A", "B", "C", "D"]);
const WALL_ORDER = Object.freeze({ front: 0, rear: 1 });
const WALL_LABEL = Object.freeze({ front: "Front", rear: "Rear" });

const activeSources = (instances) =>
  (Array.isArray(instances) ? instances : []).filter((source) => source && source.enabled !== false);

const buildGroup = (id, label, rows, role) => ({
  id,
  label,
  role,
  sourceIds: rows.map((row) => row.id).sort(),
});

const wallRank = (role) => (Object.prototype.hasOwnProperty.call(WALL_ORDER, role)
  ? WALL_ORDER[role]
  : 2);

// The mirror test itself lives in practicalPairAuthority — ONE authority, two
// named bands: the frozen 10 mm "identical position" band for the two-source
// rule, and the 100 mm installation band for the pair two of THREE sources were
// built as. Grouping never invents its own tolerance.

/**
 * Split one wall's sources into practical symmetric pairs (kept linked) and the
 * sources that stand alone. Greedy from the room's left edge, so the result is
 * stable. Two of three sources are tested with the PRACTICAL pair band — a pair
 * that differs by an installation offset in depth is still the pair the designer
 * built, and reading it as three unrelated sources is what made a real
 * front-singleton / rear-pair design unsearchable.
 */
function partitionIntoPairs(rows, widthM) {
  const pairs = [];
  const singles = [];
  const remaining = [...rows];
  while (remaining.length >= 2) {
    const first = remaining[0];
    const matchIndex = remaining.findIndex(
      (other, index) => index > 0 && isPracticalSymmetricPair(first, other, { widthM }),
    );
    if (matchIndex < 0) {
      singles.push(remaining.shift());
      continue;
    }
    pairs.push([first, remaining[matchIndex]]);
    remaining.splice(matchIndex, 1);
    remaining.shift();
  }
  singles.push(...remaining);
  return { pairs, singles };
}

/**
 * What a group is, in the designer's words. A source on the room's centre line
 * is a singleton; an off-centre one is named for the side it sits on, so two
 * groups on the same wall can never read as the same group.
 */
function groupLabel(role, rows, widthM) {
  const wall = WALL_LABEL[role] || "Room centre";
  if (rows.length >= 2) return `${wall} pair`;
  const offset = rows[0].position.x - widthM / 2;
  if (Math.abs(offset) <= GROUP_GEOMETRY_TOLERANCE_M) return `${wall} singleton`;
  return `${wall} ${offset < 0 ? "left" : "right"}`;
}

/**
 * Three active sources, grouped from the layout:
 *   CASE A  1 front + 2 rear symmetrical  → front singleton | rear pair
 *   CASE B  2 front symmetrical + 1 rear  → front pair | rear singleton
 *   CASE C  three genuinely asymmetric    → three independent groups
 */
function threeSourceGroups(active, widthM, side) {
  const walls = { front: [], rear: [] };
  const straddling = [];
  for (const source of active) {
    const wall = side(source);
    if (wall) walls[wall].push(source);
    else straddling.push(source);
  }

  const detected = [];
  for (const wall of ["front", "rear"]) {
    const rows = [...walls[wall]].sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id));
    const { pairs, singles } = partitionIntoPairs(rows, widthM);
    for (const pair of pairs) detected.push({ role: wall, rows: pair, label: groupLabel(wall, pair, widthM) });
    for (const single of singles) detected.push({ role: wall, rows: [single], label: groupLabel(wall, [single], widthM) });
  }
  for (const single of straddling) {
    detected.push({ role: null, rows: [single], label: groupLabel(null, [single], widthM) });
  }

  const ordered = detected.sort((a, b) =>
    wallRank(a.role) - wallRank(b.role)
    || Math.min(...a.rows.map((row) => row.position.x)) - Math.min(...b.rows.map((row) => row.position.x))
    || a.rows[0].id.localeCompare(b.rows[0].id));

  return {
    status: SUBWOOFER_GROUP_STATUS.ELIGIBLE,
    groups: ordered.map((entry, index) => buildGroup(GROUP_IDS[index], entry.label, entry.rows, entry.role)),
  };
}

/**
 * The optimisation groups of one layout.
 *
 * @param {Array} instances - subwoofer instances ({id, model, enabled, position:{x,y}, legacyGroup})
 * @param {object|null} roomDims - { widthM, lengthM }
 * @returns {{status:string, reason?:string, groups:Array<{id:string,label:string,role:string|null,sourceIds:string[]}>}}
 */
export function detectSubwooferGroups(instances, roomDims) {
  const active = activeSources(instances);
  const skipped = (reason) => ({ status: SUBWOOFER_GROUP_STATUS.SKIPPED, reason, groups: [] });
  const ambiguous = (reason) => ({ status: SUBWOOFER_GROUP_STATUS.AMBIGUOUS, reason, groups: [] });

  if (active.length <= 1) {
    return skipped("One source: no inter-sub delay search; position options remain available.");
  }

  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  if (!(widthM > 0) || !(lengthM > 0)
    || new Set(active.map((source) => source.id)).size !== active.length
    || active.some((source) =>
      !source.id
      || !Number.isFinite(source.position?.x)
      || !Number.isFinite(source.position?.y))) {
    return ambiguous("Missing or duplicate source identity/geometry.");
  }

  const side = (source) => (source.position.y < lengthM / 2 - GROUP_GEOMETRY_TOLERANCE_M
    ? "front"
    : source.position.y > lengthM / 2 + GROUP_GEOMETRY_TOLERANCE_M ? "rear" : null);

  for (const source of active) {
    const declared = source.legacyGroup || source.group;
    if (["front", "rear"].includes(declared) && declared !== side(source)) {
      return ambiguous("Group metadata conflicts with source geometry: " + source.id);
    }
  }

  // Four sources: the established front pair + rear pair, unchanged.
  if (active.length === 4) {
    const front = active.filter((source) => side(source) === "front");
    const rear = active.filter((source) => side(source) === "rear");
    if (front.length !== 2 || rear.length !== 2) {
      return ambiguous("Four-source timing requires two front and two rear sources.");
    }
    return {
      status: SUBWOOFER_GROUP_STATUS.ELIGIBLE,
      groups: [
        buildGroup("A", "Front pair", front, "front"),
        buildGroup("B", "Rear pair", rear, "rear"),
      ],
    };
  }

  // Two sources: unchanged — one group each, unless they are one symmetric pair.
  // Judged on the frozen identical band, so the two-source rule is not widened.
  if (active.length === 2) {
    const [a, b] = active;
    if (side(a) && side(a) === side(b) && isIdenticalSymmetricPair(a, b, { widthM })) {
      return skipped("Symmetric same-wall pair: differential grouped timing is disabled by default.");
    }
    const ordered = [...active].sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id));
    return {
      status: SUBWOOFER_GROUP_STATUS.ELIGIBLE,
      groups: [
        buildGroup("A", "First source", [ordered[0]], "front"),
        buildGroup("B", "Second source", [ordered[1]], "rear"),
      ],
    };
  }

  // Three sources: read the groups from the physical layout.
  if (active.length === 3) return threeSourceGroups(active, widthM, side);

  return ambiguous("Grouped delay search supports one, two, three or four active sources.");
}

/**
 * State one search's own name in the grouping reason. The authority states the
 * delay search's wording; the phase and gain searches read the same grouping and
 * say it in their own words, so one lever never reports another lever's name.
 */
export function adaptGroupingReason(reason, lever) {
  if (typeof reason !== "string" || !reason) return reason ?? null;
  if (!lever) return reason;
  return reason.replace(/delay|timing/gi, lever);
}

/**
 * The group directions a refinement must search, read from the candidates
 * themselves: a three-source layout's own groups (A, B and C) are therefore all
 * refined, never only the first two. Sorted, so the retained policy stays
 * deterministic.
 */
export function searchedGroupDirections(rows) {
  const directions = new Set();
  for (const row of rows || []) {
    if (!row || row.isCurrent || row.rejection) continue;
    if (row.direction && row.direction !== "current") directions.add(row.direction);
  }
  return [...directions].sort();
}

/** "SUB1", "SUB2" … in the design's own active order. */
export function subwooferSourceLabels(instances) {
  const labels = new Map();
  activeSources(instances).forEach((source, index) => labels.set(source.id, `SUB${index + 1}`));
  return labels;
}

/**
 * The detected grouping as Engineer Details states it: how many sources are
 * active, how many optimisation groups were found, and which sources sit in
 * each. Read-only — it changes nothing about the design or the search.
 */
export function describeSubwooferGrouping(instances, roomDims) {
  const grouping = detectSubwooferGroups(instances, roomDims);
  const labels = subwooferSourceLabels(instances);
  return {
    status: grouping.status,
    reason: grouping.reason ?? null,
    activeCount: labels.size,
    groupCount: grouping.groups.length,
    rows: grouping.groups.map((entry) => ({
      id: entry.id,
      label: entry.label,
      role: entry.role,
      sourceText: entry.sourceIds.map((id) => labels.get(id) || id).join(" · "),
    })),
  };
}