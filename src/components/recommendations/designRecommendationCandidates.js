/**
 * designRecommendationCandidates.js
 * ---------------------------------
 * Pure candidate generation and ranking for ASDR what-if evaluation.
 *
 * This module never scores acoustics. It only creates controlled, single-change
 * alternatives and compares results returned by the canonical RP22 + ASDR
 * authorities.
 */

import { MODELS, getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import { getCommercialPrice } from "@/components/pricing/usePriceCalculation";
import { screenRows } from "@/components/data/screenSizes";
import { compareViewingPriority, compareViewingPriorityFine } from "@/components/utils/viewingPriorityAuthority";
import {
  computeImprovementProfile,
  computeDegradationProfile,
  getAffectedParameters,
  getParameterLevelChanges,
  getPriorityLabel,
} from "./designRecommendationProfile.js";
import { resolveParamThresholds } from "@/components/report/technical/roomParameterLevelAuthority";
import {
  buildImprovementImpactProfile,
  buildDegradationImpactProfile,
  compareImprovementImpact,
  compareDegradationImpact,
} from "./designRecommendationImpactProfile.js";

const LCR_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);
const WIDE_ROLES = new Set(["LW", "RW"]);
const MID_UPPER_ROLES = new Set(["TML", "TMR", "TL", "TR"]);
const VIEWING_GEOMETRY_KINDS = new Set(["seating", "screen", "row-spacing"]);

export function isViewingGeometryCandidate(candidate) {
  return VIEWING_GEOMETRY_KINDS.has(String(candidate?.kind || ""));
}

const finite = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));
const roleOf = (speaker) => String(speaker?.role || "").toUpperCase();

function cloneSeatWithDelta(seat, deltaY) {
  const nextY = Number(seat?.y) + deltaY;
  return {
    ...seat,
    y: nextY,
    ...(seat?.position
      ? { position: { ...seat.position, y: finite(seat.position.y) ? Number(seat.position.y) + deltaY : nextY } }
      : {}),
  };
}

function priceForModel(model, soundbarSelections) {
  const result = getCommercialPrice(model, soundbarSelections);
  return result?.note ? null : Number(result?.priceExVat);
}

function removedSpeakerSaving(speakers, soundbarSelections) {
  let total = 0;
  for (const speaker of speakers) {
    const price = priceForModel(speaker?.model, soundbarSelections);
    if (!finite(price)) return null;
    total += Number(price);
  }
  return total;
}

function parseLayout(layout) {
  const match = String(layout || "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { bed: Number(match[1]), subs: Number(match[2]), uppers: Number(match[3]) };
}

function pushCandidate(list, candidate) {
  if (!candidate?.id) return;
  if (list.some((item) => item.id === candidate.id)) return;
  list.push(candidate);
}

/**
 * Generate a deliberately bounded V1 set of one-change alternatives.
 * Additions that require inventing new speaker positions are excluded.
 */
export function buildDesignRecommendationCandidates({
  seats = [],
  placedSpeakers = [],
  screen = null,
  dolbyLayout = "",
  dimensions = null,
  mlpPoint = null,
  soundbarSelections = {},
  allowUkPricing = true,
  lcrPowerW = 100,
}) {
  const candidates = [];
  const safeSeats = Array.isArray(seats) ? seats : [];
  const safeSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const roomLength = Number(dimensions?.lengthM ?? dimensions?.length);

  // Free seating moves: test useful, human-scale increments in both directions.
  for (const deltaY of [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3]) {
    const movedSeats = safeSeats.map((seat) => cloneSeatWithDelta(seat, deltaY));
    const movedMlp = mlpPoint && finite(mlpPoint.y)
      ? { ...mlpPoint, y: Number(mlpPoint.y) + deltaY }
      : mlpPoint;

    const allInside = movedSeats.every((seat) => {
      if (!finite(seat?.y)) return false;
      if (!finite(roomLength)) return Number(seat.y) >= 0.3;
      return Number(seat.y) >= 0.3 && Number(seat.y) <= roomLength - 0.3;
    });
    if (!allInside || (movedMlp && finite(roomLength) && (movedMlp.y < 0.3 || movedMlp.y > roomLength - 0.3))) continue;

    const mm = Math.round(Math.abs(deltaY) * 1000);
    pushCandidate(candidates, {
      id: `seating:${deltaY.toFixed(2)}`,
      kind: "seating",
      title: `Move seating ${mm} mm ${deltaY < 0 ? "towards the screen" : "away from the screen"}`,
      description: "Moves the complete listening area and RSP together; no equipment change.",
      seats: movedSeats,
      placedSpeakers: safeSpeakers,
      screen,
      dolbyLayout,
      mlpPoint: movedMlp,
      costDeltaExVat: 0,
      disruption: "Low",
      confidence: "Medium",
      caveat: "Bass response is held at the current verified result and is not re-simulated.",
    });
  }

  // Screen size: nearest smaller and larger catalogue widths only.
  const currentWidth = Number(screen?.visibleWidthInches);
  const widths = screenRows.map((row) => Number(row.visible_width_in)).filter(finite).sort((a, b) => a - b);
  if (finite(currentWidth)) {
    const smaller = [...widths].reverse().find((width) => width < currentWidth);
    const larger = widths.find((width) => width > currentWidth);
    for (const width of [smaller, larger]) {
      if (!finite(width)) continue;
      pushCandidate(candidates, {
        id: `screen:${width}`,
        kind: "screen",
        title: `Change screen width to ${width} inches`,
        description: "Tests the next standard screen size against every seat.",
        seats: safeSeats,
        placedSpeakers: safeSpeakers,
        screen: { ...(screen || {}), visibleWidthInches: width },
        dolbyLayout,
        mlpPoint,
        costDeltaExVat: null,
        disruption: "Medium",
        confidence: "High",
        caveat: "Screen price is not present in the connected product price authority.",
      });
    }
  }

  // LCR selection (Stage A — price-free):
  // - evaluate every registry-backed weaker compatible discrete LCR model as a
  //   cost-down candidate;
  // - evaluate every registry-backed stronger compatible discrete LCR model as
  //   an upgrade candidate.
  // No model is chosen by price. Each scenario still runs through the canonical
  // SPL → RP22 → ASDR chain below and is ranked on solved performance.
  const currentLcr = safeSpeakers.filter((speaker) => LCR_ROLES.has(roleOf(speaker)));
  const currentKeys = currentLcr.map((speaker) => normaliseModelKey(speaker?.model)).filter(Boolean);
  const canCompareDiscreteLcr = currentLcr.length >= 3 && currentKeys.length === currentLcr.length;
  if (canCompareDiscreteLcr) {
    const currentCost = allowUkPricing
      ? currentLcr.reduce((sum, speaker) => {
          const price = priceForModel(speaker.model, soundbarSelections);
          return sum == null || !finite(price) ? null : sum + Number(price);
        }, 0)
      : null;
    const currentLcrPowerW = finite(lcrPowerW) && Number(lcrPowerW) > 0
      ? Number(lcrPowerW)
      : 100;

    const currentRepresentative = getSpeakerModelMeta(currentKeys[0]);
    const currentCapability = Number(currentRepresentative?.max_spl_cont_db_1m_halfspace ?? currentRepresentative?.max_spl ?? 0);

    const discreteModels = MODELS
      .filter((model) => model?.category === "LCR" && !model?.frontStageType)
      .filter((model, index, array) => array.findIndex((other) => other.key === model.key) === index)
      .map((model) => ({
        model,
        price: allowUkPricing ? priceForModel(model.key, soundbarSelections) : null,
        capability: Number(model.max_spl_cont_db_1m_halfspace ?? model.max_spl ?? 0),
        maxPowerW: finite(model.max_power) ? Number(model.max_power) : null,
      }))
      .filter((entry) => !currentKeys.includes(entry.model.key));

    // Stage A: LCR alternatives are generated from capability/compatibility only.
    // All weaker compatible discrete models become cost-down candidates; all
    // stronger compatible discrete models become upgrade candidates. Price is
    // not used to select or order candidates — each scenario is solved by the
    // canonical SPL → RP22 → ASDR chain and ranked on performance.
    const weaker = discreteModels
      .filter((entry) => entry.capability < currentCapability)
      .sort((a, b) => b.capability - a.capability); // strongest weaker first
    const stronger = discreteModels
      .filter((entry) => entry.capability > currentCapability)
      .sort((a, b) => a.capability - b.capability); // weakest stronger first

    const weakerSelections = weaker.map((entry) => ({
      entry,
      direction: "cost-down",
      powerAfterW: currentLcrPowerW,
      amplifierUpgradeRequired: false,
    }));

    const strongerSelections = stronger.flatMap((entry) => {
      const modelOnly = {
        entry,
        direction: "upgrade",
        powerAfterW: currentLcrPowerW,
        amplifierUpgradeRequired: false,
      };

      // Add one registry-backed powered scenario only when the current
      // amplification would hold this model below its continuous SPL cap.
      // The full scenario still goes through the canonical SPL → RP22 → ASDR
      // chain; this calculation only decides whether the extra candidate is
      // physically meaningful.
      const sensitivityDb = Number(entry.model.sensitivity_dB_1w1m);
      const availableCurrentPowerW = finite(entry.maxPowerW)
        ? Math.min(currentLcrPowerW, entry.maxPowerW)
        : currentLcrPowerW;
      const currentPowerLimitedSplDb =
        finite(sensitivityDb) && availableCurrentPowerW > 0
          ? sensitivityDb + 10 * Math.log10(availableCurrentPowerW)
          : null;
      const canBenefitFromMorePower =
        finite(entry.maxPowerW) &&
        entry.maxPowerW > currentLcrPowerW &&
        finite(entry.capability) &&
        finite(currentPowerLimitedSplDb) &&
        currentPowerLimitedSplDb < entry.capability - 0.01;

      return canBenefitFromMorePower
        ? [
            modelOnly,
            {
              entry,
              direction: "upgrade",
              powerAfterW: entry.maxPowerW,
              amplifierUpgradeRequired: true,
            },
          ]
        : [modelOnly];
    });

    const lcrSelections = [
      ...weakerSelections,
      ...strongerSelections,
    ];

    for (const {
      entry,
      direction,
      powerAfterW,
      amplifierUpgradeRequired,
    } of lcrSelections) {
      const nextSpeakers = safeSpeakers.map((speaker) =>
        LCR_ROLES.has(roleOf(speaker)) ? { ...speaker, model: entry.model.key } : speaker
      );
      const nextCost = finite(entry.price) ? Number(entry.price) * currentLcr.length : null;
      const powerSuffix = direction === "upgrade"
        ? amplifierUpgradeRequired
          ? `:amp-${Math.round(currentLcrPowerW)}-${Math.round(powerAfterW)}`
          : `:amp-${Math.round(currentLcrPowerW)}`
        : "";

      pushCandidate(candidates, {
        id: `lcr:${entry.model.key}${powerSuffix}`,
        kind: "lcr",
        recommendationDirection: direction,
        candidateModelKey: entry.model.key,
        title: `Use ${entry.model.label} for LCR`,
        description: amplifierUpgradeRequired
          ? `Changes all three discrete screen channels and evaluates ${Math.round(powerAfterW)} W/ch LCR amplification.`
          : "Changes all three discrete screen channels to the same model.",
        seats: safeSeats,
        placedSpeakers: nextSpeakers,
        screen,
        dolbyLayout,
        mlpPoint,
        costDeltaExVat: finite(currentCost) && finite(nextCost) ? nextCost - currentCost : null,
        lcrQuantity: currentLcr.length,
        speakerUnitPriceExVat: finite(entry.price) ? Number(entry.price) : null,
        currentModelCapabilityDb: currentCapability,
        candidateModelCapabilityDb: entry.capability,
        lcrPowerBeforeW: currentLcrPowerW,
        lcrPowerAfterW: powerAfterW,
        amplifierUpgradeRequired,
        amplifierCostIncluded: false,
        physicalFit: {
          widthMm: finite(entry.model.widthMm) ? Number(entry.model.widthMm) : null,
          heightMm: finite(entry.model.heightMm) ? Number(entry.model.heightMm) : null,
          depthMm: finite(entry.model.depthMm) ? Number(entry.model.depthMm) : null,
        },
        disruption: amplifierUpgradeRequired ? "Medium" : "Low",
        confidence: "High",
        caveat: amplifierUpgradeRequired
          ? `Includes LCR amplification increase from ${Math.round(currentLcrPowerW)} W/ch to ${Math.round(powerAfterW)} W/ch. Amplifier hardware cost is not included.`
          : null,
      });
    }
  }

  // Channel-count savings: remove one existing pair only. No new positions invented.
  const layout = parseLayout(dolbyLayout);
  if (layout) {
    if (layout.bed >= 9) {
      const removed = safeSpeakers.filter((speaker) => WIDE_ROLES.has(roleOf(speaker)));
      if (removed.length) {
        const nextLayout = `7.${layout.subs}.${layout.uppers}`;
        const saving = allowUkPricing ? removedSpeakerSaving(removed, soundbarSelections) : null;
        pushCandidate(candidates, {
          id: `layout:${nextLayout}:remove-wides`,
          kind: "channel-count",
          title: "Remove the front-wide pair",
          description: `Tests ${nextLayout} using the existing layout with LW/RW removed.`,
          seats: safeSeats,
          placedSpeakers: safeSpeakers.filter((speaker) => !WIDE_ROLES.has(roleOf(speaker))),
          screen,
          dolbyLayout: nextLayout,
          mlpPoint,
          costDeltaExVat: finite(saving) ? -Number(saving) : null,
          disruption: "Medium",
          confidence: "Medium",
          caveat: "Reduces spatial resolution as well as equipment cost. Review the listening experience before applying.",
        });
      }
    }

    if (layout.uppers >= 6) {
      const removed = safeSpeakers.filter((speaker) => MID_UPPER_ROLES.has(roleOf(speaker)));
      if (removed.length) {
        const nextLayout = `${layout.bed}.${layout.subs}.4`;
        const saving = allowUkPricing ? removedSpeakerSaving(removed, soundbarSelections) : null;
        pushCandidate(candidates, {
          id: `layout:${nextLayout}:remove-mid-uppers`,
          kind: "channel-count",
          title: "Reduce six overheads to four",
          description: `Tests ${nextLayout} with the middle overhead pair removed.`,
          seats: safeSeats,
          placedSpeakers: safeSpeakers.filter((speaker) => !MID_UPPER_ROLES.has(roleOf(speaker))),
          screen,
          dolbyLayout: nextLayout,
          mlpPoint,
          costDeltaExVat: finite(saving) ? -Number(saving) : null,
          disruption: "Medium",
          confidence: "Medium",
          caveat: "Reduces spatial resolution as well as equipment cost. Review the listening experience before applying.",
        });
      }
    }
  }

  return candidates;
}

// ── Profile-based ranking ──
// See designRecommendationProfile.js for the canonical RP22 level-profile
// comparison logic. The ASDR percentage is a secondary signal; primary
// classification and ranking use achieved RP22 levels.

const DISRUPTION_RANK = { Low: 1, Medium: 2, High: 3 };
const CONFIDENCE_RANK = { Low: 1, Medium: 2, High: 3 };

function extractP12Level(rating) {
  const contribution = (rating?.contributions || []).find((c) => c.key === "p12");
  return contribution?.resultLevel || null;
}

/**
 * Grade a raw SPL value against both Minimum and Recommended RP22 thresholds.
 * Returns the level under the specified mode, or null if the raw value is
 * not finite. Uses the canonical resolveParamThresholds authority — no
 * new thresholds are defined here.
 */
function gradeSplParamRaw(rawDb, paramId, mode) {
  if (!Number.isFinite(Number(rawDb))) return null;
  const thresholds = resolveParamThresholds({ id: paramId }, mode, null, null);
  const v = Number(rawDb);
  if (v >= thresholds.L4) return "L4";
  if (v >= thresholds.L3) return "L3";
  if (v >= thresholds.L2) return "L2";
  if (v >= thresholds.L1) return "L1";
  return "FAIL";
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function viewingLevelSignature(summary) {
  return (summary?.rows || [])
    .map((row) => `${Number(row?.rowNumber) || 0}:${row?.rp23Level || "—"}`)
    .join("|");
}

/**
 * Qualification guard only — ranking itself always delegates to the canonical
 * viewingPriorityAuthority comparator. A geometry-only recommendation is
 * material when the per-row RP23 profile changes or the inter-row angle spread
 * changes by at least one degree. Total-deviation-only numerical movement may
 * resolve a tie, but is not surfaced as an improvement by itself.
 */
function isMaterialViewingChange(before, after) {
  if ((before?.rows?.length || 0) < 2 || (after?.rows?.length || 0) < 2) return false;
  if (viewingLevelSignature(before) !== viewingLevelSignature(after)) return true;
  return Math.abs(Number(after.angleSpreadDeg) - Number(before.angleSpreadDeg)) >= 1;
}

function viewingMetadataForCandidate(candidate, viewingContext) {
  if (!isViewingGeometryCandidate(candidate) || !viewingContext?.before) return null;
  const after = viewingContext.afterByCandidateId?.[candidate.id] || null;
  const before = viewingContext.before;
  if (!after || (before.rows?.length || 0) < 2 || (after.rows?.length || 0) < 2) return null;

  const priorityMode = viewingContext.priorityMode || "balanced";
  const comparator = Math.sign(compareViewingPriority(after, before, priorityMode));
  const direction = comparator < 0 ? "better" : comparator > 0 ? "worse" : "same";
  const material = isMaterialViewingChange(before, after);

  return {
    before,
    after,
    priorityMode,
    comparison: {
      direction,
      material,
      comparator,
      isImprovement: material && direction === "better",
      isWorse: material && direction === "worse",
    },
  };
}

function compareApplicableViewingCandidates(a, b) {
  if (!isViewingGeometryCandidate(a) || !isViewingGeometryCandidate(b)) return 0;
  if (!a?.viewingAfter || !b?.viewingAfter) return 0;
  if (a.viewingPriorityMode !== b.viewingPriorityMode) return 0;
  // Stage C: fine-only comparator — excludes the high-level RP23 level already
  // represented in the common impact vector, so the same level movement cannot
  // be double-weighted. Uses only fine geometry/balance signals.
  return compareViewingPriorityFine(a.viewingAfter, b.viewingAfter, a.viewingPriorityMode);
}

// Retired in Stage B: replaced by compareImprovementImpact (reach-coupled
// performance-impact vector in designRecommendationImpactProfile.js). The old
// bucket tuple (failRemoved/l1Removed/...) made L1→L2 and L1→L3 equivalent.
// Kept as a comment for traceability.

function levelChangeSignature(item) {
  return JSON.stringify(
    (item?.parameterLevelChanges || []).map((change) => [
      change?.key || "",
      change?.beforeLevel || "",
      change?.afterLevel || "",
    ])
  );
}

/**
 * LCR upgrade tie-break (Stage A: price-free). Applies only after the Stage B
 * impact vector and the viewing comparator tie. For equal solved performance
 * profiles, order by disruption (lower), confidence (higher), then ASDR.
 */
function compareLcrMaterialUpgrades(a, b) {
  const bothLcrUpgrades =
    a?.kind === "lcr" &&
    b?.kind === "lcr" &&
    a?.recommendationDirection === "upgrade" &&
    b?.recommendationDirection === "upgrade";
  if (!bothLcrUpgrades) return 0;

  // Stage A: price removed. For equal solved performance profiles, order by
  // disruption (lower), confidence (higher), then ASDR scoreDelta. A different
  // solved profile is ranked by ASDR scoreDelta alone.
  const sameSolvedProfile = levelChangeSignature(a) === levelChangeSignature(b);
  if (!sameSolvedProfile) {
    if (a.scoreDelta !== b.scoreDelta) return b.scoreDelta - a.scoreDelta;
  }
  const disA = DISRUPTION_RANK[a.disruption] ?? 99;
  const disB = DISRUPTION_RANK[b.disruption] ?? 99;
  if (disA !== disB) return disA - disB;
  const confA = CONFIDENCE_RANK[a.confidence] ?? 0;
  const confB = CONFIDENCE_RANK[b.confidence] ?? 0;
  if (confA !== confB) return confB - confA;
  return b.scoreDelta - a.scoreDelta;
}

/**
 * Convert evaluated candidates into concise "improve" and "save" shortlists.
 *
 * IMPROVEMENT eligibility: genuine RP22 level/profile improvement (at least one
 *   parameter improves, no parameter degrades). ASDR percentage is secondary.
 * SAVINGS eligibility: saves money, no new FAIL, acceptable profile degradation,
 *   AND ASDR loss ≤ 5pp (secondary guard).
 */
export function rankDesignRecommendations({
  baselineRating,
  evaluatedCandidates = [],
  viewingContext = null,
}) {
  const baselinePct = Number(baselineRating?.displayPercentage);
  const baselinePoints = Number(baselineRating?.actualPoints);
  if (!finite(baselinePct)) return { improvements: [], savings: [], evaluatedCount: 0 };

  const evaluated = evaluatedCandidates
    .filter((entry) => entry?.candidate && finite(entry?.rating?.displayPercentage))
    .map((entry) => {
      const nextPct = Number(entry.rating.displayPercentage);
      const nextPoints = Number(entry.rating.actualPoints);
      const scoreDelta = nextPct - baselinePct;
      const scoreDeltaPoints = finite(nextPoints) && finite(baselinePoints) ? nextPoints - baselinePoints : null;
      const costDelta = finite(entry.candidate.costDeltaExVat) ? Number(entry.candidate.costDeltaExVat) : null;

      const improvementProfile = computeImprovementProfile(baselineRating, entry.rating);
      const degradationProfile = computeDegradationProfile(baselineRating, entry.rating);
      const viewing = viewingMetadataForCandidate(entry.candidate, viewingContext);
      const viewingChange = viewing
        ? { beforeLevel: viewing?.before?.worstRowLevel, afterLevel: viewing?.after?.worstRowLevel }
        : null;
      const improvementImpact = buildImprovementImpactProfile(baselineRating, entry.rating, entry.candidate, viewingChange);
      const degradationImpact = buildDegradationImpactProfile(baselineRating, entry.rating, entry.candidate, viewingChange);
      const hasSimplification =
        entry.candidate?.kind === "channel-count" ||
        (entry.candidate?.kind === "lcr" && entry.candidate?.recommendationDirection === "cost-down");
      const improvementImpactHasGain =
        improvementImpact.totalLevelGain > 0 || improvementImpact.failFixedAtPrimaryReach > 0;
      const viewingTradeoff =
        viewing?.comparison?.isWorse === true &&
        (improvementProfile.isImprovement || improvementImpactHasGain || hasSimplification);

      return {
        ...entry.candidate,
        rating: entry.rating,
        currentPercentage: baselinePct,
        newPercentage: nextPct,
        scoreDelta,
        scoreDeltaPoints,
        costDeltaExVat: costDelta,
        savingExVat: costDelta != null && costDelta < 0 ? -costDelta : null,
        affectedParameters: getAffectedParameters(baselineRating, entry.rating),
        parameterLevelChanges: getParameterLevelChanges(baselineRating, entry.rating),
        improvementProfile,
        degradationProfile,
        improvementImpact,
        degradationImpact,
        priorityLabel: getPriorityLabel(improvementProfile),
        isRealImprovement: improvementProfile.isImprovement || improvementImpactHasGain,
        isRecommendationImprovement:
          ((improvementProfile.isImprovement || improvementImpactHasGain) &&
            !improvementProfile.hasDegradation &&
            !(degradationImpact.totalLevelLoss > 0)) ||
          (viewing?.comparison?.isImprovement === true &&
            !improvementProfile.hasDegradation &&
            !(degradationImpact.totalLevelLoss > 0)),
        viewingBefore: viewing?.before || null,
        viewingAfter: viewing?.after || null,
        viewingComparison: viewing?.comparison || null,
        viewingPriorityMode: viewing?.priorityMode || null,
        viewingTradeoff,
        hasSimplification,
        hasNewFail: degradationProfile.hasNewFail,
        p12Level: extractP12Level(entry.rating),
        p12BaselineLevel: extractP12Level(baselineRating),
        p12MinimumLevel: gradeSplParamRaw(entry.p12RawDb, 12, "minimum"),
        p12RecommendedLevel: gradeSplParamRaw(entry.p12RawDb, 12, "recommended"),
        p13MinimumLevel: gradeSplParamRaw(entry.p13RawDb, 13, "minimum"),
        p13RecommendedLevel: gradeSplParamRaw(entry.p13RawDb, 13, "recommended"),
      };
    });

  // ── IMPROVEMENTS ──
  // RP22 improvements remain primary. A multi-row geometry candidate may
  // additionally qualify when its RP22 profile is preserved and the canonical
  // selected viewing objective improves materially.
  //
  // Materiality is determined by the Stage B/C performance-impact authority:
  // a positive RP22 level movement, P12/P13 unique threshold crossing, or
  // viewing RP23 level movement, with no degradation. Ranking uses the
  // reach-coupled impact vector (primaryReach → failFixed → maxGain → breadth
  // → totalGain → seatsImproved), with viewing entering at CORE reach.
  // No minimum ASDR percentage-point movement is required.
  const rankedImprovements = evaluated
    .filter((item) => item.isRecommendationImprovement)
    .sort((a, b) => {
      const cmp = compareImprovementImpact(a.improvementImpact, b.improvementImpact);
      if (cmp !== 0) return cmp;
      const viewingCmp = compareApplicableViewingCandidates(a, b);
      if (viewingCmp !== 0) return viewingCmp;
      const lcrValueCmp = compareLcrMaterialUpgrades(a, b);
      if (lcrValueCmp !== 0) return lcrValueCmp;
      // Stage A: price removed. Secondary: disruption (lower), confidence (higher), ASDR (higher)
      const disA = DISRUPTION_RANK[a.disruption] ?? 99;
      const disB = DISRUPTION_RANK[b.disruption] ?? 99;
      if (disA !== disB) return disA - disB;
      const confA = CONFIDENCE_RANK[a.confidence] ?? 0;
      const confB = CONFIDENCE_RANK[b.confidence] ?? 0;
      if (confA !== confB) return confB - confA;
      return b.scoreDelta - a.scoreDelta;
    });

  // Multiple power scenarios for one speaker model are evaluated, but only
  // the best one may occupy the shortlist. A powered variant remains visible
  // when it solves a better RP22 profile; an equivalent result is represented
  // by the lower-disruption model-only scenario.
  const shortlistedImprovements = [];
  const shortlistedLcrModels = new Set();
  for (const item of rankedImprovements) {
    if (item.kind === "lcr" && item.recommendationDirection === "upgrade") {
      const modelKey = item.candidateModelKey || item.title;
      if (shortlistedLcrModels.has(modelKey)) continue;
      shortlistedLcrModels.add(modelKey);
    }
    shortlistedImprovements.push(item);
    if (shortlistedImprovements.length >= 3) break;
  }

  const improvements = shortlistedImprovements
    .map((item) => {
      if (item.kind !== "lcr" || item.recommendationDirection !== "upgrade") return item;
      // Stage A: neutral performance label — "BEST VALUE" is a financial
      // judgement on incomplete price information and is removed.
      return { ...item, materialUpgradeLabel: "MATERIAL UPGRADE" };
    });

  // ── SAVINGS (Stage A price-free · Stage B reach-coupled loss vector) ──
  // A candidate qualifies when it genuinely simplifies the design (removes
  // equipment, channels, or speaker capability) with no new FAIL. Price is NOT
  // an eligibility or ranking authority. Ranking uses the Stage B loss vector
  // (highestReachDegraded → maxLoss → breadth → totalLoss → seatsDegraded),
  // ascending (lower = safer). A zero-performance-loss simplification naturally
  // ranks first (highestReachDegraded = NONE).
  const savings = evaluated
    .filter((item) => item.hasSimplification) // Stage A: eligibility is performance-only (removes equipment/channels/capability), not price
    .filter((item) => !item.hasNewFail) // No-FAIL cost-down rule
    .map((item) => ({ ...item, scoreLoss: Math.max(0, -item.scoreDelta) }))
    .sort((a, b) => {
      const cmp = compareDegradationImpact(a.degradationImpact, b.degradationImpact);
      if (cmp !== 0) return cmp; // Stage B: reach-coupled loss vector, lower = safer
      const viewingCmp = compareApplicableViewingCandidates(a, b);
      if (viewingCmp !== 0) return viewingCmp;
      const disA = DISRUPTION_RANK[a.disruption] ?? 99;
      const disB = DISRUPTION_RANK[b.disruption] ?? 99;
      if (disA !== disB) return disA - disB;
      const confA = CONFIDENCE_RANK[a.confidence] ?? 0;
      const confB = CONFIDENCE_RANK[b.confidence] ?? 0;
      if (confA !== confB) return confB - confA;
      return a.scoreDelta - b.scoreDelta; // lower ASDR loss = better
    })
    .slice(0, 3);

  return { improvements, savings, evaluatedCount: evaluated.length };
}