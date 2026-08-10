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

const LCR_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);
const WIDE_ROLES = new Set(["LW", "RW"]);
const MID_UPPER_ROLES = new Set(["TML", "TMR", "TL", "TR"]);

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

  // LCR selection: nearest cheaper and nearest dearer compatible discrete model.
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

    const currentRepresentative = getSpeakerModelMeta(currentKeys[0]);
    const currentCapability = Number(currentRepresentative?.max_spl_cont_db_1m_halfspace ?? currentRepresentative?.max_spl ?? 0);

    const discreteModels = MODELS
      .filter((model) => model?.category === "LCR" && !model?.frontStageType)
      .filter((model, index, array) => array.findIndex((other) => other.key === model.key) === index)
      .map((model) => ({
        model,
        price: allowUkPricing ? priceForModel(model.key, soundbarSelections) : null,
        capability: Number(model.max_spl_cont_db_1m_halfspace ?? model.max_spl ?? 0),
      }))
      .filter((entry) => !currentKeys.includes(entry.model.key));

    const cheaper = finite(currentCost)
      ? discreteModels
          .filter((entry) => finite(entry.price) && Number(entry.price) * currentLcr.length < currentCost)
          .sort((a, b) => (Number(b.price) - Number(a.price)) || (b.capability - a.capability))[0]
      : null;
    const stronger = discreteModels
      .filter((entry) => entry.capability > currentCapability)
      .sort((a, b) => (a.capability - b.capability) || ((Number(a.price) || Infinity) - (Number(b.price) || Infinity)))[0];

    for (const entry of [cheaper, stronger]) {
      if (!entry) continue;
      const nextSpeakers = safeSpeakers.map((speaker) =>
        LCR_ROLES.has(roleOf(speaker)) ? { ...speaker, model: entry.model.key } : speaker
      );
      const nextCost = finite(entry.price) ? Number(entry.price) * currentLcr.length : null;
      pushCandidate(candidates, {
        id: `lcr:${entry.model.key}`,
        kind: "lcr",
        title: `Use ${entry.model.label} for LCR`,
        description: "Changes all three discrete screen channels to the same model.",
        seats: safeSeats,
        placedSpeakers: nextSpeakers,
        screen,
        dolbyLayout,
        mlpPoint,
        costDeltaExVat: finite(currentCost) && finite(nextCost) ? nextCost - currentCost : null,
        disruption: "Low",
        confidence: "High",
        caveat: null,
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

function contributionMap(rating) {
  const map = new Map();
  for (const item of rating?.contributions || []) {
    map.set(item.key, Number(item.earnedPoints) || 0);
  }
  return map;
}

function changedParameters(baseline, candidate) {
  const before = contributionMap(baseline);
  const after = contributionMap(candidate);
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .filter((key) => Math.abs((after.get(key) || 0) - (before.get(key) || 0)) >= 0.01)
    .map((key) => key === "screen" ? "Screen" : key.toUpperCase())
    .sort((a, b) => {
      const na = Number(a.replace(/\D/g, "")) || 999;
      const nb = Number(b.replace(/\D/g, "")) || 999;
      return na - nb;
    });
}

function extractP12Level(rating) {
  const contribution = (rating?.contributions || []).find((c) => c.key === "p12");
  return contribution?.resultLevel || null;
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Convert evaluated candidates into concise "improve" and "save" shortlists.
 */
export function rankDesignRecommendations({ baselineRating, evaluatedCandidates = [] }) {
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
      return {
        ...entry.candidate,
        rating: entry.rating,
        currentPercentage: baselinePct,
        newPercentage: nextPct,
        scoreDelta,
        scoreDeltaPoints,
        costDeltaExVat: costDelta,
        savingExVat: costDelta != null && costDelta < 0 ? -costDelta : null,
        affectedParameters: changedParameters(baselineRating, entry.rating),
        p12Level: extractP12Level(entry.rating),
        p12BaselineLevel: extractP12Level(baselineRating),
      };
    });

  const improving = evaluated.filter((item) => item.scoreDelta > 0.05);
  const free = improving
    .filter((item) => item.costDeltaExVat === 0)
    .sort((a, b) => b.scoreDelta - a.scoreDelta);
  const efficient = improving
    .filter((item) => item.costDeltaExVat == null || item.costDeltaExVat > 0)
    .sort((a, b) => {
      const ea = a.costDeltaExVat > 0 ? a.scoreDelta / a.costDeltaExVat : a.scoreDelta / 1000;
      const eb = b.costDeltaExVat > 0 ? b.scoreDelta / b.costDeltaExVat : b.scoreDelta / 1000;
      return eb - ea || b.scoreDelta - a.scoreDelta;
    });
  const biggest = [...improving].sort((a, b) => b.scoreDelta - a.scoreDelta);

  const improvements = uniqueById([free[0], efficient[0], biggest[0], ...free, ...efficient, ...biggest]).slice(0, 3);

  const savingCandidates = evaluated
    .filter((item) => finite(item.savingExVat) && item.savingExVat > 0)
    .map((item) => ({ ...item, scoreLoss: Math.max(0, -item.scoreDelta) }))
    .filter((item) => item.scoreLoss <= 5);

  const noLoss = savingCandidates
    .filter((item) => item.scoreLoss <= 0.05)
    .sort((a, b) => b.savingExVat - a.savingExVat);
  const retainedValue = [...savingCandidates].sort((a, b) => {
    const va = a.savingExVat / Math.max(0.25, a.scoreLoss);
    const vb = b.savingExVat / Math.max(0.25, b.scoreLoss);
    return vb - va || b.savingExVat - a.savingExVat;
  });
  const largestSafe = [...savingCandidates].sort((a, b) => b.savingExVat - a.savingExVat || a.scoreLoss - b.scoreLoss);

  const savings = uniqueById([noLoss[0], retainedValue[0], largestSafe[0], ...retainedValue]).slice(0, 3);

  return { improvements, savings, evaluatedCount: evaluated.length };
}