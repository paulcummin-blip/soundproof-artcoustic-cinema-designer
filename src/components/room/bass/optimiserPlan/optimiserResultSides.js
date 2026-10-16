// optimiserResultSides.js
// ---------------------------------------------------------------------------
// The CURRENT and PROPOSED sides of a completed Bass Optimiser result.
//
// These are two DIFFERENT things and are resolved into two separate objects so
// no surface can ever print one as the other:
//
//   CURRENT   the canonical published Bass result for the design as it stands —
//             the same values the tooltip, seat pill, graph marker and result
//             strip publish from.
//   PROPOSED  the candidate the run evaluated, read from the run's own recorded
//             candidate result (the decision's own `after`) or, failing that,
//             from the winning lever's own evaluated effect.
//
// READ-ONLY: every value here already exists on the published authority or on
// the persisted run. Nothing is recalculated, estimated, averaged or inferred
// from a different candidate pool. `raw` keeps the engineering value at full
// precision; `display` is the floored whole-number form every surface prints.
//
// Used only by optimiserResultViewModel.js — the one canonical view model.
// ---------------------------------------------------------------------------

import {
  deviationText,
  levelText,
  p14DbText,
  p18HzText,
} from "./optimiserWholeNumberDb.js";

/** The side label every value carries, so the two can never be confused. */
export const OPTIMISER_RESULT_SIDE = Object.freeze({
  CURRENT: "Current",
  PROPOSED: "Proposed",
});

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * One value of one side, always with its side label and its canonical display
 * text. `format` is the existing whole-number authority for that parameter.
 */
export function metric(db, level, { format }) {
  const raw = num(db);
  const display = raw == null ? null : format(raw);
  const label = levelText(level);
  return {
    raw,
    display,
    level: num(level),
    levelText: label,
    // The one combined string a surface prints beside the side label.
    text: display && label ? `${display} \u00b7 ${label}` : (display || label || null),
  };
}

/**
 * The CURRENT side: the canonical published bass result.
 *
 * `source` states which authority the value came from — 'published' for the
 * canonical result, 'run-baseline' when that is the only value that exists (it
 * is then stated without any difference claim).
 */
export function buildCurrentSide({ completedBassAuthority, currentP20, planView, readers }) {
  const { readAuthoritativeP20Headline, readAuthoritativeParameterHeadline } = readers;
  const p14 = readAuthoritativeParameterHeadline(completedBassAuthority, "p14");
  const p18 = readAuthoritativeParameterHeadline(completedBassAuthority, "p18");
  const p19 = readAuthoritativeParameterHeadline(completedBassAuthority, "p19");
  const p20 = readAuthoritativeP20Headline(completedBassAuthority);
  const baseline = planView?.baseline || null;

  return {
    side: OPTIMISER_RESULT_SIDE.CURRENT,
    source: p20?.variationDb != null
      ? "published"
      : (currentP20?.runBaselineDeviation ? "run-baseline" : null),
    p14: {
      // The published P14 capability is the authority; the run's own baseline is
      // the fallback only when nothing is published.
      ...metric(p14?.value ?? baseline?.p14AchievedDb, p14?.level, { format: p14DbText }),
      // P14's own unit and published basis, so a capability figure is never
      // printed as a bare "dB".
      unit: p14?.unit || null,
      status: p14?.status ?? null,
      targetBasis: p14?.targetBasis || null,
    },
    p18: metric(p18?.value ?? baseline?.achievedP18Hz, p18?.level, { format: p18HzText }),
    p19: metric(
      p19?.value ?? baseline?.p19VariationDb,
      p19?.level ?? baseline?.p19Level,
      { format: deviationText },
    ),
    p20: {
      ...metric(
        p20?.variationDb ?? baseline?.p20VariationDb,
        p20?.level ?? baseline?.p20Level,
        { format: deviationText },
      ),
      deviationText: currentP20?.deviationText || null,
    },
    worstSeatId: currentP20?.seatId || null,
    // True when the run measured from a different current state: every absolute
    // before/after value then belongs to that run and is labelled as such.
    runBaselineDiffers: currentP20?.runBaselineDiffers === true,
    runBaselineDeviation: currentP20?.runBaselineDeviation || null,
  };
}

/**
 * The PROPOSED side, or null when the run recorded no candidate result at all.
 * A proposed value is NEVER returned as the current result.
 */
export function buildProposedSide({ decision, winner }) {
  const after = decision?.after || null;
  const effect = winner?.effect || null;
  const p20Db = after?.p20?.deviationDb ?? effect?.p20VariationDb ?? null;
  const p19Db = after?.p19?.deviationDb ?? effect?.p19VariationDb ?? null;
  const p14Db = after?.p14?.value ?? effect?.p14AchievedDb ?? null;
  const p18Db = after?.p18?.value ?? effect?.achievedP18Hz ?? null;
  if (p20Db == null && p19Db == null && p14Db == null && p18Db == null) return null;

  return {
    side: OPTIMISER_RESULT_SIDE.PROPOSED,
    source: after ? "decision-candidate" : "lever-effect",
    p14: {
      ...metric(p14Db, after?.p14?.level, { format: p14DbText }),
      unit: after?.p14?.unit || null,
      status: null,
      targetBasis: null,
    },
    p18: metric(p18Db, after?.p18?.level, { format: p18HzText }),
    p19: metric(p19Db, after?.p19?.level ?? effect?.p19Level, { format: deviationText }),
    p20: {
      ...metric(p20Db, after?.p20?.level ?? effect?.p20Level, { format: deviationText }),
      deviationText: deviationText(p20Db),
    },
    worstSeatId: after?.p20?.worstSeatId ?? effect?.worstSeatId ?? null,
    runBaselineDiffers: false,
    runBaselineDeviation: null,
  };
}