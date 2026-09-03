import { getFamilyDisplayMetadata } from "../stage1/stage1FamilyRegistry";

const TOLERANCE_M = 0.01;

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function seatLabel(seat, index) {
  if (seat?.label) return String(seat.label);
  if (seat?.name) return String(seat.name);
  if (Number.isFinite(Number(seat?.rowNumber)) && Number.isFinite(Number(seat?.seatNumber))) {
    return `Row ${Number(seat.rowNumber)} Seat ${Number(seat.seatNumber)}`;
  }
  return `Seat ${index + 1}`;
}

function seatMetadata(seatingPositions) {
  const map = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat, index) => {
    const id = String(seat?.id || `${seat?.x}-${seat?.y}`);
    map.set(id, {
      label: seatLabel(seat, index),
      isPrimary: seat?.priority !== "secondary",
    });
  });
  return map;
}

function normaliseSeatResults(results, seatingPositions) {
  const metadata = seatMetadata(seatingPositions);
  return (Array.isArray(results) ? results : []).map((seat, index) => {
    const id = String(seat?.seatId || "");
    const meta = metadata.get(id);
    const raw = Number(seat?.variationDbRaw);
    const displayed = Number(seat?.wholeDbDeviation ?? seat?.displayVariationDb);
    return {
      seatId: id,
      seatLabel: meta?.label || seat?.seatLabel || `Seat ${index + 1}`,
      isPrimary: seat?.isPrimary ?? meta?.isPrimary ?? true,
      variationDbRaw: Number.isFinite(raw) ? raw : null,
      wholeDbDeviation: Number.isFinite(displayed)
        ? displayed
        : (Number.isFinite(raw) ? Math.floor(Math.abs(raw)) : null),
      level: numericLevel(seat?.level),
      worstFrequencyHz: Number.isFinite(Number(seat?.worstFrequencyHz))
        ? Number(seat.worstFrequencyHz)
        : null,
    };
  });
}

function placementForCoordinate(coordinate, roomDims) {
  const x = Number(coordinate?.x);
  const y = Number(coordinate?.y);
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  if (Math.abs(y) <= TOLERANCE_M) return "front";
  if (Number.isFinite(length) && Math.abs(y - length) <= TOLERANCE_M) return "rear";
  if (Math.abs(x) <= TOLERANCE_M) return "left";
  if (Number.isFinite(width) && Math.abs(x - width) <= TOLERANCE_M) return "right";
  return y <= length / 2 ? "front" : "rear";
}

function sourcesFromStage2(result, roomDims, sourceHeightM) {
  return (Array.isArray(result?.coordinates) ? result.coordinates : []).map((coordinate, index) => ({
    id: `stage2-recommendation-${result.finalistId || result.familyId || "layout"}-${index + 1}`,
    x: Number(coordinate.x),
    y: Number(coordinate.y),
    z: Number.isFinite(Number(sourceHeightM)) ? Number(sourceHeightM) : 0.05,
    placement: placementForCoordinate(coordinate, roomDims),
  }));
}

function sourceFromCurrent(sub, index, roomDims) {
  const x = Number.isFinite(Number(sub?.position?.x)) ? Number(sub.position.x) : Number(sub?.x);
  const y = Number.isFinite(Number(sub?.position?.y)) ? Number(sub.position.y) : Number(sub?.y);
  const group = sub?.group || sub?.legacyGroup;
  return {
    id: sub?.id || `current-sub-${index + 1}`,
    x,
    y,
    z: Number.isFinite(Number(sub?.position?.z)) ? Number(sub.position.z) : Number(sub?.z),
    placement: group === "front" || group === "rear" ? group : placementForCoordinate({ x, y }, roomDims),
  };
}

function sameCoordinates(aSources, bSources) {
  const a = Array.isArray(aSources) ? aSources : [];
  const b = Array.isArray(bSources) ? bSources : [];
  if (!a.length || a.length !== b.length) return false;
  const used = new Array(b.length).fill(false);
  return a.every((source) => {
    for (let index = 0; index < b.length; index += 1) {
      if (used[index]) continue;
      if (Math.abs(Number(source.x) - Number(b[index].x)) > TOLERANCE_M) continue;
      if (Math.abs(Number(source.y) - Number(b[index].y)) > TOLERANCE_M) continue;
      used[index] = true;
      return true;
    }
    return false;
  });
}

function isSideWallResult(result, roomDims) {
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  return (result?.coordinates || []).some((coordinate) => {
    const x = Number(coordinate?.x);
    const y = Number(coordinate?.y);
    const onSide = Math.abs(x) <= TOLERANCE_M
      || (Number.isFinite(width) && Math.abs(x - width) <= TOLERANCE_M);
    const onFrontRear = Math.abs(y) <= TOLERANCE_M
      || (Number.isFinite(length) && Math.abs(y - length) <= TOLERANCE_M);
    return onSide && !onFrontRear;
  });
}

function primaryRows(result, key) {
  return (Array.isArray(result?.[key]) ? result[key] : [])
    .filter((seat) => seat?.isPrimary !== false);
}

function resultFloor(result) {
  const rows = primaryRows(result, "perSeatP19").concat(primaryRows(result, "perSeatP20"));
  return rows.length ? Math.min(...rows.map((row) => numericLevel(row?.level))) : 0;
}

function worstVariation(result, key) {
  const rows = primaryRows(result, key);
  return rows.length
    ? Math.max(...rows.map((row) => Math.abs(Number(row?.variationDbRaw) || 0)))
    : Number.POSITIVE_INFINITY;
}

function seriousPriorityBandProblem(result) {
  return primaryRows(result, "perSeatP19")
    .concat(primaryRows(result, "perSeatP20"))
    .some((row) => Number(row?.worstFrequencyHz) >= 30
      && Number(row?.worstFrequencyHz) <= 60
      && Math.abs(Number(row?.variationDbRaw) || 0) >= 8);
}

export function selectPracticalStage2Finalist(quantityResult, roomDims) {
  const ranked = Array.isArray(quantityResult?.evaluatedFinalists)
    ? quantityResult.evaluatedFinalists.filter(Boolean)
    : [];
  const acousticWinner = quantityResult?.bestFinalist || ranked[0] || null;
  if (!acousticWinner || Number(acousticWinner.quantity) === 1 || !isSideWallResult(acousticWinner, roomDims)) {
    return acousticWinner;
  }
  const practical = ranked.find((result) => !isSideWallResult(result, roomDims));
  if (!practical) return acousticWinner;

  const quantity = Number(acousticWinner.quantity);
  const variationThreshold = quantity === 4 ? 2.5 : 2;
  const p20Gain = worstVariation(practical, "perSeatP20") - worstVariation(acousticWinner, "perSeatP20");
  const gradeBandGain = resultFloor(acousticWinner) - resultFloor(practical);
  const poorToCredible = resultFloor(practical) < 2 && resultFloor(acousticWinner) >= 2;
  const priorityProblemRemoved = seriousPriorityBandProblem(practical)
    && !seriousPriorityBandProblem(acousticWinner)
    && (
      worstVariation(practical, "perSeatP19") - worstVariation(acousticWinner, "perSeatP19") >= 3
      || p20Gain >= 3
    );

  return gradeBandGain >= 1 || p20Gain >= variationThreshold || poorToCredible || priorityProblemRemoved
    ? acousticWinner
    : practical;
}

function p14IdentityMatches(result, contract) {
  const contractDb = Number(contract?.requestedP14TargetDb ?? contract?.selectedP14TargetDb);
  const contractLevel = Number(contract?.requestedP14Level ?? contract?.selectedP14Level);
  const contractBasis = contract?.requestedP14Basis || contract?.selectedP14TargetBasis;
  return Number(result?.p14TargetDb) === contractDb
    && Number(result?.p14TargetLevel) === contractLevel
    && result?.p14TargetBasis === contractBasis;
}

function canonicalMetrics({
  perSeatP19,
  perSeatP20,
  seatingPositions,
  sourceCount,
  canonicalResult,
  reusedFromCurrent = false,
}) {
  const normalisedP19 = normaliseSeatResults(perSeatP19, seatingPositions);
  const normalisedP20 = normaliseSeatResults(perSeatP20, seatingPositions);
  return {
    sourceCount,
    responseAuthority: "final-post-eq",
    perSeatP19: normalisedP19,
    perSeatP20: normalisedP20,
    hasConfirmedSeatAuthority: normalisedP19.length > 0 && normalisedP20.length > 0,
    p14TargetDb: canonicalResult?.p14TargetDb ?? null,
    p14AchievedDb: canonicalResult?.p14AchievedDb ?? null,
    p14AchievedLevel: canonicalResult?.p14AchievedLevel ?? null,
    p14HeadroomDb: canonicalResult?.p14HeadroomDb ?? null,
    achievedP18Hz: canonicalResult?.achievedP18Hz ?? null,
    p18AchievedLevel: canonicalResult?.p18AchievedLevel ?? null,
    assessmentStartHz: canonicalResult?.assessmentStartHz ?? null,
    assessmentEndHz: canonicalResult?.assessmentEndHz ?? null,
    limited: !!canonicalResult?.limited,
    canonicalAuthorityReceipt: canonicalResult?.canonicalAuthorityReceipt || null,
    authorityReusedFromCurrent: reusedFromCurrent,
  };
}

export function buildCurrentCanonicalLayout({
  currentSubs,
  roomDims,
  seatingPositions,
  contract,
  authoritative,
}) {
  const activeSubs = (Array.isArray(currentSubs) ? currentSubs : []).filter((sub) => sub?.enabled !== false);
  if (!authoritative || !activeSubs.length || !contract?.selectedCandidate) return null;
  const sources = activeSubs.map((sub, index) => sourceFromCurrent(sub, index, roomDims));
  if (sources.some((source) => !Number.isFinite(source.x) || !Number.isFinite(source.y))) return null;
  const candidate = contract.selectedCandidate;
  const p14 = contract.productAnalysis?.parameters?.p14;
  const p18 = contract.productAnalysis?.parameters?.p18;
  const canonicalResult = {
    p14TargetDb: contract.requestedP14TargetDb ?? contract.selectedP14TargetDb ?? p14?.selectedTargetDb,
    p14TargetLevel: contract.requestedP14Level ?? contract.selectedP14Level ?? p14?.selectedLevel,
    p14TargetBasis: contract.requestedP14Basis ?? contract.selectedP14TargetBasis ?? p14?.targetBasis,
    p14AchievedDb: p14?.achievedCapabilityDb ?? p14?.availableCapabilityDb ?? candidate.achievedP14Db ?? null,
    p14AchievedLevel: p14?.level ?? candidate.achievedP14Level ?? null,
    p14HeadroomDb: p14?.headroomOrShortfallDb ?? null,
    achievedP18Hz: candidate.achievedP18FrequencyHz,
    p18AchievedLevel: p18?.level ?? candidate.achievedP18Level ?? null,
    assessmentStartHz: contract.assessmentEnvelope?.assessmentStartHz,
    assessmentEndHz: contract.assessmentEnvelope?.assessmentEndHz,
  };
  return {
    id: "current-canonical-layout",
    name: "Current positions",
    placementMode: "Current design",
    sources,
    metrics: canonicalMetrics({
      perSeatP19: candidate.perSeatP19Results,
      perSeatP20: candidate.perSeatP20Results,
      seatingPositions,
      sourceCount: sources.length,
      canonicalResult,
    }),
    canonicalResult,
  };
}

export function buildStage2RecommendationLayout({
  quantityResult,
  roomDims,
  seatingPositions,
  sourceHeightM,
  currentLayout,
  currentContract,
}) {
  const result = selectPracticalStage2Finalist(quantityResult, roomDims);
  if (!result) return null;
  const metadata = getFamilyDisplayMetadata(result.familyId);
  const sources = sourcesFromStage2(result, roomDims, sourceHeightM);
  const exactCurrentIdentity = !!currentLayout
    && sameCoordinates(sources, currentLayout.sources)
    && p14IdentityMatches(result, currentContract);
  const metrics = exactCurrentIdentity
    ? { ...currentLayout.metrics, authorityReusedFromCurrent: true }
    : canonicalMetrics({
        perSeatP19: result.perSeatP19,
        perSeatP20: result.perSeatP20,
        seatingPositions,
        sourceCount: result.quantity,
        canonicalResult: result,
      });
  return {
    id: result.finalistId,
    name: metadata?.label || result.familyId || `${result.quantity}-sub layout`,
    placementMode: metadata?.description || "Canonical placement evaluation",
    familyId: result.familyId,
    sources,
    metrics,
    canonicalResult: exactCurrentIdentity ? currentLayout.canonicalResult : result,
    recommendationKind: isSideWallResult(result, roomDims)
      ? "side-wall-alternative"
      : result !== quantityResult?.bestFinalist
        ? "practical-preferred"
        : "practical",
    practicalReason: isSideWallResult(result, roomDims)
      ? "Acoustic alternative — less practical placement. The canonical improvement is material."
      : result !== quantityResult?.bestFinalist
        ? "Preferred front/rear-wall result; the side-wall improvement was too small to justify the installation compromise."
        : "Highest-ranked practical authoritative layout for this room and seating area.",
  };
}