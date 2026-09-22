/**
 * Canonical P19 seat-result authority.
 *
 * This is the ONLY place allowed to join selectedCandidate.perSeatP19Results
 * to seat identity/priority or derive Primary, Secondary and Project P19
 * summaries. It preserves the engine-published grade; it never re-grades the
 * raw deviation.
 */

import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { resolveSeatPriority, PRIMARY, SECONDARY } from "@/components/utils/seatPriorityAuthority";
import { canonicalBassLevel, lowestBassLevel } from "@/components/utils/rp22/bassGradingAuthority";

const REFERENCE_IDS = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

// Identity cache: one immutable publication per engine result array + seat snapshot.
// Multiple upstream readers may encounter the same completed contract in the same
// render cycle; they receive this exact object rather than regenerating summaries.
const PUBLICATION_BY_RESULTS = new WeakMap();

const cleanId = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

function formatValue(rawValue) {
  if (!finite(rawValue)) return "NOT CALCULATED";
  return `±${resolveRp22DesignValue(19, Math.abs(Number(rawValue)))} dB`;
}

function groupSummary(name, seats) {
  const grades = seats.map((seat) => seat.grade);
  const floor = lowestBassLevel(seats.filter((seat) => seat.calculated).map((seat) => seat.grade)) || "NOT CALCULATED";
  return Object.freeze({
    name,
    seatIds: Object.freeze(seats.map((seat) => seat.seatId)),
    seats: Object.freeze(seats),
    grades: Object.freeze(grades),
    floor,
    summary: grades.length ? grades.join(" · ") : "NOT CONFIGURED",
  });
}

function coverageText(primary, secondary, project) {
  if (!project.seats.length || project.floor === "NOT CALCULATED") return "NOT CALCULATED";
  const secondaryFails = secondary.seats.filter((seat) => seat.grade === "FAIL").length;
  if (primary.floor === "FAIL") return "Primary Seats require improvement";
  if (secondaryFails === 0) return `Primary Seats ${primary.floor} · No seat lower than ${project.floor}`;
  if (secondaryFails === 1) return `Primary Seats ${primary.floor} · One seat requires improvement`;
  return `Primary Seats ${primary.floor} · ${secondaryFails} seats require improvement`;
}

function rowNumber(seat) {
  const value = Number(seat?.row ?? seat?.rowNumber);
  return Number.isFinite(value) ? value : 1;
}

function columnNumber(seat, fallback) {
  const value = Number(seat?.column ?? seat?.col ?? seat?.indexInRow ?? seat?.seatNumber);
  if (Number.isFinite(value)) return value;
  const idMatch = cleanId(seat?.id ?? seat?.seatId).match(/-c(\d+)$/i);
  if (idMatch) return Number(idMatch[1]);
  const x = Number(seat?.x ?? seat?.position?.x);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * @param {Object} params
 * @param {Array} params.authoritativeSeatResults selectedCandidate.perSeatP19Results
 * @param {string[]} params.primarySeatIds
 * @param {string[]} params.secondarySeatIds
 * @param {Array} params.seatingPositions used only for stable label/row/position metadata
 */
export function summariseAuthoritativeP19Seats({
  authoritativeSeatResults = [],
  primarySeatIds = [],
  secondarySeatIds = [],
  seatingPositions = [],
} = {}) {
  const results = Array.isArray(authoritativeSeatResults) ? authoritativeSeatResults : [];
  const positions = Array.isArray(seatingPositions) ? seatingPositions : [];
  const positionById = new Map(positions.map((seat) => [cleanId(seat?.id ?? seat?.seatId), seat]));
  const primaryIds = Array.from(new Set((primarySeatIds || []).map(cleanId).filter(Boolean)));
  const secondaryIds = Array.from(new Set((secondarySeatIds || []).map(cleanId).filter(Boolean)));

  // Legacy callers may omit explicit scopes. Resolve them once here, never in consumers.
  if (!primaryIds.length && !secondaryIds.length) {
    for (const seat of positions) {
      const id = cleanId(seat?.id ?? seat?.seatId);
      if (!id || REFERENCE_IDS.has(id.toLowerCase())) continue;
      (resolveSeatPriority(seat) === PRIMARY ? primaryIds : secondaryIds).push(id);
    }
  }

  const snapshotKey = JSON.stringify({
    primaryIds,
    secondaryIds,
    results: results.map((result) => ({
      seatId: cleanId(result?.seatId ?? result?.id),
      level: result?.level ?? null,
      variationDbRaw: result?.variationDbRaw ?? null,
      worstFrequencyHz: result?.worstFrequencyHz ?? null,
    })),
    seats: positions.map((seat) => ({
      id: cleanId(seat?.id ?? seat?.seatId),
      label: seat?.label || null,
      priority: resolveSeatPriority(seat),
      row: seat?.row ?? seat?.rowNumber ?? null,
      column: seat?.column ?? seat?.col ?? seat?.indexInRow ?? seat?.seatNumber ?? null,
      x: seat?.x ?? seat?.position?.x ?? null,
      y: seat?.y ?? seat?.position?.y ?? null,
      z: seat?.z ?? seat?.position?.z ?? null,
    })),
  });
  let publications = PUBLICATION_BY_RESULTS.get(results);
  if (!publications) {
    publications = new Map();
    PUBLICATION_BY_RESULTS.set(results, publications);
  }
  const existing = publications.get(snapshotKey);
  if (existing) return existing;

  const allowedIds = [...primaryIds, ...secondaryIds];
  const sourceById = new Map(
    results
      .map((result) => [cleanId(result?.seatId ?? result?.id), result])
      .filter(([id]) => id && !REFERENCE_IDS.has(id.toLowerCase()) && allowedIds.includes(id)),
  );

  const buildSeat = (id, priority, index) => {
    const source = sourceById.get(id) || null;
    const position = positionById.get(id) || null;
    const rawValue = finite(source?.variationDbRaw) ? Number(source.variationDbRaw) : null;
    const grade = source ? (canonicalBassLevel(source.level) || "NOT CALCULATED") : "NOT CALCULATED";
    const calculated = rawValue != null && grade !== "NOT CALCULATED";
    return Object.freeze({
      seatId: id,
      label: position?.label || id,
      priority,
      row: rowNumber(position),
      column: columnNumber(position, index + 1),
      position: position ? Object.freeze({
        x: finite(position.x ?? position.position?.x) ? Number(position.x ?? position.position?.x) : null,
        y: finite(position.y ?? position.position?.y) ? Number(position.y ?? position.position?.y) : null,
        z: finite(position.z ?? position.position?.z) ? Number(position.z ?? position.position?.z) : null,
      }) : null,
      status: calculated ? "CALCULATED" : "NOT CALCULATED",
      calculated,
      rawValue,
      variationDbRaw: rawValue,
      displayedValue: calculated ? formatValue(rawValue) : "NOT CALCULATED",
      displayVariationDb: calculated ? formatValue(rawValue) : "NOT CALCULATED",
      grade: calculated ? grade : "NOT CALCULATED",
      level: calculated ? grade : "NOT CALCULATED",
      worstFrequencyHz: finite(source?.worstFrequencyHz) ? Number(source.worstFrequencyHz) : null,
      source,
    });
  };

  const primarySeats = primaryIds.map((id, index) => buildSeat(id, PRIMARY, index));
  const secondarySeats = secondaryIds.map((id, index) => buildSeat(id, SECONDARY, primarySeats.length + index));
  const primary = groupSummary("Primary", primarySeats);
  const secondary = groupSummary("Secondary", secondarySeats);
  const project = groupSummary("Project", [...primarySeats, ...secondarySeats]);

  const bySeatId = Object.freeze(Object.fromEntries(project.seats.map((seat) => [seat.seatId, seat])));
  const rowMap = new Map();
  for (const seat of project.seats) {
    if (!rowMap.has(seat.row)) rowMap.set(seat.row, []);
    rowMap.get(seat.row).push(seat);
  }
  const rows = Object.freeze(
    [...rowMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([row, seats]) => Object.freeze({
        row,
        seats: Object.freeze(seats.slice().sort((a, b) => a.column - b.column)),
      })),
  );

  const publication = Object.freeze({
    parameter: "P19",
    sourcePath: "selectedCandidate.perSeatP19Results",
    seats: project.seats,
    bySeatId,
    rows,
    primary,
    secondary,
    project: Object.freeze({ ...project, coverageSummary: coverageText(primary, secondary, project) }),
  });
  publications.set(snapshotKey, publication);
  return publication;
}
