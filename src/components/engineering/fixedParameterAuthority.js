/**
 * fixedParameterAuthority.js
 * --------------------------
 * Stamps Sound Proof's fixed parameter rules onto an engineering summary of ANY
 * vintage — the summary just published, or one published before the rule was
 * wired (and a browser handoff stored in an older session).
 *
 * WHY THIS EXISTS
 * ---------------
 * RP22 Parameter 8 is a Sound Proof product rule, not a measurement: Artcoustic
 * do not make upfiring speakers, so the answer is always "No · Level 4". The
 * summary authority already publishes it that way. But a summary published
 * before that rule existed still carries P8 as "provisional", and that is
 * exactly what puts a dash on an already-calculated report. The reader stamps
 * the rule rather than depending on the vintage of the data.
 *
 * WHAT IT TOUCHES
 * ---------------
 * Only P8's presentation surfaces:
 *   - the P8 room result (achieved "No", Level 4)
 *   - the P8 parameter authority entry
 *   - the P8 entry in each parameter-scope summary
 *   - the P8 compliance entry (assumed, Level 4)
 *   - one count slot, when an older summary counted P8 as unassessed
 *
 * Everything else is carried through unchanged: no other parameter's value,
 * level, floor, weight or rating figure can move, and P8 stays outside the
 * Design Rating numerator. A summary that already carries the rule is returned
 * untouched (same object), so this costs nothing on a fresh publication.
 */

import { PARAM_WEIGHTS } from "@/components/report/technical/artcousticSystemDesignRating";
import {
  P8_LEVEL,
  P8_NUMBER,
  P8_PRESENTATION_STATUS,
  buildP8DesignRatingParameter,
  buildP8RoomResult,
} from "@/components/utils/rp22/p8Authority";

const asObject = (value) =>
  (value && typeof value === "object" && !Array.isArray(value) ? value : null);

/** True when this summary already carries the fixed P8 rule. */
function alreadyStamped(parameterAuthority) {
  const p8 = asObject(parameterAuthority?.p8);
  return p8?.state === "scored" && p8?.level === P8_LEVEL;
}

/** The P8 entry of one parameter-scope summary, as an assessed Level 4. */
function stampScopeSummary(scopeSummary) {
  const entry = asObject(scopeSummary?.p8);
  if (!entry) return scopeSummary;
  return { ...scopeSummary, p8: { ...entry, state: "scored", level: P8_LEVEL } };
}

function stampParameterSummaries(parameterSummaries) {
  const summaries = asObject(parameterSummaries);
  if (!summaries) return parameterSummaries;
  const out = { ...summaries };
  for (const scope of ["project", "primary", "secondary"]) {
    if (asObject(summaries[scope])?.p8) out[scope] = stampScopeSummary(summaries[scope]);
  }
  return out;
}

/** Move the one count slot an older summary reserved for P8 from unassessed to L4. */
function stampRoomLevelCounts(roomLevelCounts, p8WasCounted) {
  const counts = asObject(roomLevelCounts);
  if (!counts || p8WasCounted) return roomLevelCounts;
  const unassessed = Number(counts.unassessed) || 0;
  if (unassessed <= 0) return roomLevelCounts;
  return {
    ...counts,
    L4: (Number(counts.L4) || 0) + 1,
    unassessed: unassessed - 1,
  };
}

function stampComplianceCounts(counts, p8WasCounted) {
  const source = asObject(counts);
  if (!source || p8WasCounted) return counts;
  if (source.notVerified == null) return counts;
  const notVerified = Number(source.notVerified) || 0;
  if (notVerified <= 0) return counts;
  return {
    ...source,
    L4: (Number(source.L4) || 0) + 1,
    notVerified: notVerified - 1,
  };
}

function stampCompliance(compliance, p8WasCounted) {
  const source = asObject(compliance);
  if (!source) return compliance;
  const byParameter = asObject(source.byParameter);
  const entry = asObject(byParameter?.p8);
  return {
    ...source,
    byParameter: entry
      ? {
        ...byParameter,
        p8: { ...entry, state: "scored", presentationStatus: P8_PRESENTATION_STATUS, level: P8_LEVEL },
      }
      : byParameter,
    counts: stampComplianceCounts(source.counts, p8WasCounted),
  };
}

function stampReportCounts(reportCounts, roomLevelCounts) {
  const source = asObject(reportCounts);
  if (!source) return reportCounts;
  if (roomLevelCounts === source.roomLevelCounts) return reportCounts;
  const calculated =
    (Number(roomLevelCounts.L4) || 0)
    + (Number(roomLevelCounts.L3) || 0)
    + (Number(roomLevelCounts.L2) || 0)
    + (Number(roomLevelCounts.L1) || 0)
    + (Number(roomLevelCounts.fail) || 0);
  return { ...source, roomLevelCounts, roomCalculatedCount: calculated };
}

/**
 * Stamp the fixed P8 rule onto an engineering summary.
 * Returns the same summary object when it already carries the rule.
 */
export function stampFixedParameterAuthority(engineeringSummary) {
  const summary = asObject(engineeringSummary);
  if (!summary) return engineeringSummary;

  const parameterAuthority = asObject(summary.parameterAuthority);
  if (alreadyStamped(parameterAuthority)) return engineeringSummary;

  const existingP8 = asObject(parameterAuthority?.p8);
  const p8WasCounted = existingP8?.state === "scored";
  const weight = Number(existingP8?.weight) || PARAM_WEIGHTS.p8;
  const scope = existingP8?.scope || "room";

  const project = asObject(summary.project) || {};
  const roomResultsByParameter = asObject(summary.roomResultsByParameter) || {};
  const roomLevelCounts = stampRoomLevelCounts(project?.reportCounts?.roomLevelCounts, p8WasCounted);

  return {
    ...summary,
    parameterAuthority: parameterAuthority
      ? { ...parameterAuthority, p8: buildP8DesignRatingParameter({ weight, scope }) }
      : parameterAuthority,
    roomResultsByParameter: {
      ...roomResultsByParameter,
      [P8_NUMBER]: buildP8RoomResult(asObject(roomResultsByParameter[P8_NUMBER]) || {}),
    },
    parameterSummaries: stampParameterSummaries(summary.parameterSummaries),
    project: {
      ...project,
      compliance: stampCompliance(project.compliance, p8WasCounted),
      reportCounts: stampReportCounts(project.reportCounts, roomLevelCounts),
    },
  };
}

/**
 * Stamp an authority snapshot's summary (the shape every report and proposal
 * consumer reads). The snapshot is returned unchanged when its summary already
 * carries the rule, so subscribers see no needless re-render.
 */
export function stampFixedParameterAuthoritySnapshot(snapshot) {
  const source = asObject(snapshot);
  if (!source) return snapshot;
  const summary = asObject(source.engineeringSummary);
  if (!summary) return snapshot;
  const stamped = stampFixedParameterAuthority(summary);
  return stamped === summary ? snapshot : { ...source, engineeringSummary: stamped };
}