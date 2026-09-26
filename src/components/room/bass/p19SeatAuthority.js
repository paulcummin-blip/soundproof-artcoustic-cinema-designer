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
 * RP22 P19 is RSP-only: max|smoothedRspResponse(f) − T(f)| over the assessment
 * band. There is no per-seat P19 in RP22. This function returns an empty
 * publication — no per-seat P19 grades, no Primary/Secondary/Project P19
 * floors, no P19 FAIL seats. The sole P19 authority is the RSP result in
 * parameters.p19 (computed via computeCorrectableP19Diagnostic against the
 * target curve).
 *
 * @param {Object} params (retained for backward-compatible call sites)
 * @param {Array} params.authoritativeSeatResults ignored — P19 is RSP-only
 * @param {string[]} params.primarySeatIds ignored
 * @param {string[]} params.secondarySeatIds ignored
 * @param {Array} params.seatingPositions ignored
 */
export function summariseAuthoritativeP19Seats({
  authoritativeSeatResults = [],
  primarySeatIds = [],
  secondarySeatIds = [],
  seatingPositions = [],
} = {}) {
  // P19 is RSP-only. Return an empty publication — no per-seat P19 grades,
  // no Primary/Secondary/Project P19 floors, no P19 FAIL seats.
  const emptyGroup = Object.freeze({
    name: "Primary",
    seatIds: Object.freeze([]),
    seats: Object.freeze([]),
    grades: Object.freeze([]),
    floor: "NOT CALCULATED",
    summary: "P19 is RSP-only",
  });
  return Object.freeze({
    parameter: "P19",
    sourcePath: "rsp-only",
    seats: Object.freeze([]),
    bySeatId: Object.freeze({}),
    rows: Object.freeze([]),
    primary: emptyGroup,
    secondary: Object.freeze({ ...emptyGroup, name: "Secondary" }),
    project: Object.freeze({ ...emptyGroup, name: "Project", coverageSummary: "P19 is RSP-only" }),
  });
}