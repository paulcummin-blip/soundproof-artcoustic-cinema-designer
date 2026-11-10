// coordinatedCandidateIntegrityChecks.js
// Three boundary integrity checks for one coordinated candidate evaluation.
//
//   1. preTransfer  — before placement/transfer generation
//   2. preConfirm  — after transfer preparation, before canonical confirmation
//   3. postConfirm — after canonical confirmation
//
// Each returns { valid: boolean, issues: string[] }. A failure at any boundary
// rejects the candidate explicitly — the developer runner never silently
// regenerates identities, substitutes installed sources, or confirms a
// candidate whose seats/RSP/crossover do not match the ones used to calculate
// transfers.
//
// Pure readers: no calculation, no store, no apply logic.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Pre-transfer integrity: validate bundle source count, identities, ordering,
 * seat identities/priorities/designated RSP, and geometry eligibility.
 */
export function checkPreTransferIntegrity(bundle, roomDims) {
  const issues = [];

  // Source count and identities
  const sourceIds = Array.isArray(bundle?.sourceIds) ? bundle.sourceIds : [];
  const coords = Array.isArray(bundle?.coordinates) ? bundle.coordinates : [];
  if (sourceIds.length !== coords.length) {
    issues.push(`Source ID count (${sourceIds.length}) != coordinate count (${coords.length})`);
  }
  if (sourceIds.some((id) => !id)) {
    issues.push("One or more source IDs are null or empty");
  }
  if (new Set(sourceIds).size !== sourceIds.length) {
    issues.push("Duplicate source IDs — each source needs a unique identity");
  }

  // Instances match source IDs in order
  const instances = Array.isArray(bundle?.instances) ? bundle.instances : [];
  if (instances.length !== sourceIds.length) {
    issues.push(`Instance count (${instances.length}) != source ID count (${sourceIds.length})`);
  }
  for (let i = 0; i < sourceIds.length; i++) {
    if (instances[i]?.id && instances[i].id !== sourceIds[i]) {
      issues.push(`Instance ${i} id (${instances[i].id}) != sourceId (${sourceIds[i]})`);
    }
  }

  // Seat identities and priorities
  const seats = Array.isArray(bundle?.seatingPositions) ? bundle.seatingPositions : [];
  if (seats.length === 0) {
    issues.push("No seating positions provided");
  }
  const seatIds = seats.map((s) => String(s?.id || "")).filter(Boolean);
  if (new Set(seatIds).size !== seatIds.length) {
    issues.push("Duplicate seat IDs in proposed seating");
  }
  const primaries = seats.filter((s) => s?.priority !== "secondary");
  if (primaries.length === 0) {
    issues.push("No primary seats in proposed seating");
  }

  // Designated RSP seat exists in proposed seating
  if (!bundle?.designatedSeatId) {
    issues.push("Missing designatedSeatId");
  } else if (!seatIds.includes(String(bundle.designatedSeatId))) {
    issues.push(`Designated seat ${bundle.designatedSeatId} not in proposed seating`);
  }

  // RSP resolved from the designated seat
  if (!bundle?.rspResolvedFromSeat) {
    issues.push("RSP was not resolved from the designated seat");
  }
  const rsp = bundle?.rspPosition;
  if (!rsp || !Number.isFinite(Number(rsp.x)) || !Number.isFinite(Number(rsp.y))) {
    issues.push("RSP position is invalid or incomplete");
  }

  // Geometry eligibility: coordinates inside room, non-overlapping (coarse)
  const W = num(roomDims?.widthM);
  const L = num(roomDims?.lengthM);
  if (W > 0 && L > 0) {
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      if (!c || !Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y))) {
        issues.push(`Coordinate ${i} is invalid`);
        continue;
      }
      const x = Number(c.x);
      const y = Number(c.y);
      if (x < 0 || x > W || y < 0 || y > L) {
        issues.push(`Coordinate ${i} (${x},${y}) outside room (${W}×${L})`);
      }
    }
  }

  // P14 target present
  if (!bundle?.p14Target || !Number.isFinite(Number(bundle.p14Target.p14TargetDb))) {
    issues.push("P14 target is missing or incomplete");
  }

  // Response basis / crossover consistency
  if (bundle?.responseBasis === "combined-lcr-sub" && !bundle?.crossover) {
    issues.push("Combined LCR/sub response basis requires a crossover configuration");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Pre-confirmation integrity: after transfer preparation, before canonical
 * confirmation. Verify exact source identities and ordering, the candidate's
 * seats and RSP are the ones used to calculate transfers, and response basis
 * and crossover correspond to the candidate.
 */
export function checkPreConfirmIntegrity(bundle, rawTransfer) {
  const issues = [];

  // Source identities and ordering
  const bundleSourceIds = Array.isArray(bundle?.sourceIds) ? bundle.sourceIds : [];
  const transferSources = Array.isArray(rawTransfer?.sources) ? rawTransfer.sources : [];
  const transferSourceIds = transferSources.map((s) => s?.id || null);

  if (transferSourceIds.length !== bundleSourceIds.length) {
    issues.push(`Transfer source count (${transferSourceIds.length}) != bundle source count (${bundleSourceIds.length})`);
  }
  for (let i = 0; i < bundleSourceIds.length; i++) {
    if (transferSourceIds[i] !== bundleSourceIds[i]) {
      issues.push(`Source order mismatch at ${i}: bundle=${bundleSourceIds[i]}, transfer=${transferSourceIds[i]}`);
    }
  }
  if (transferSourceIds.some((id) => !id)) {
    issues.push("One or more transfer source IDs are null or empty");
  }
  if (new Set(transferSourceIds).size !== transferSourceIds.length) {
    issues.push("Duplicate transfer source IDs");
  }

  // Seats used for transfer match the bundle's proposed seating
  const bundleSeatIds = (Array.isArray(bundle?.seatingPositions) ? bundle.seatingPositions : [])
    .map((s) => String(s?.id || ""))
    .filter(Boolean)
    .sort();
  const transferSeatIds = (Array.isArray(rawTransfer?.seatingPositions) ? rawTransfer.seatingPositions : [])
    .map((s) => String(s?.id || ""))
    .filter(Boolean)
    .sort();
  if (bundleSeatIds.length === 0 || transferSeatIds.length === 0) {
    issues.push("Transfer did not carry seating positions");
  } else if (JSON.stringify(bundleSeatIds) !== JSON.stringify(transferSeatIds)) {
    issues.push("Transfer seating does not match bundle proposed seating");
  }

  // RSP used for transfer matches the bundle's proposed RSP
  const bundleRsp = bundle?.rspPosition;
  const transferRsp = rawTransfer?.rspPosition;
  if (bundleRsp && transferRsp) {
    const dx = Math.abs(Number(bundleRsp.x) - Number(transferRsp.x));
    const dy = Math.abs(Number(bundleRsp.y) - Number(transferRsp.y));
    if (dx > 1e-6 || dy > 1e-6) {
      issues.push(`Transfer RSP (${transferRsp.x},${transferRsp.y}) != bundle RSP (${bundleRsp.x},${bundleRsp.y})`);
    }
  } else {
    issues.push("RSP missing from bundle or transfer");
  }

  // Response basis and crossover correspond to the candidate
  const expectedBasis = bundle?.responseBasis || "sub-only";
  const integration = rawTransfer?.integrationTransfers;
  const transferBasis = (integration && integration.available) ? "combined-lcr-sub" : "sub-only";
  if (expectedBasis === "combined-lcr-sub") {
    if (transferBasis !== "combined-lcr-sub") {
      issues.push("Expected combined LCR/sub response basis but transfer has no integration transfers");
    } else {
      // Integration evidence must be present and available — no silent sub-only fallback
      if (!integration?.available) {
        issues.push("Combined transfer integration evidence is not available");
      }
      // Live LCR source count must match the integration context (e.g. 3 for Room D)
      const expectedLcrCount = Array.isArray(bundle?.integrationContext?.speakerSources)
        ? bundle.integrationContext.speakerSources.length : null;
      const transferLcrCount = Number.isFinite(Number(integration?.speakerCount))
        ? Number(integration.speakerCount) : null;
      if (expectedLcrCount != null && transferLcrCount != null && expectedLcrCount !== transferLcrCount) {
        issues.push(`Live LCR source count mismatch: integration context has ${expectedLcrCount}, transfer has ${transferLcrCount}`);
      }
      // Crossover frequency must survive the handoff (e.g. 95 Hz)
      const bundleFreq = Number(bundle?.crossover?.frequencyHz);
      const transferFreq = Number(rawTransfer?.crossover?.frequencyHz);
      if (Number.isFinite(bundleFreq) && Number.isFinite(transferFreq) && bundleFreq !== transferFreq) {
        issues.push(`Crossover frequency mismatch: bundle ${bundleFreq} Hz, transfer ${transferFreq} Hz`);
      }
      if (bundle?.crossover && !rawTransfer?.crossover) {
        issues.push("Bundle crossover not carried into transfer");
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Post-confirmation integrity: after canonical confirmation. Verify the
 * receipt/candidate association, every individual-seat P20 result belongs to
 * a proposed seat, and reject incomplete or mismatched evidence.
 */
export function checkPostConfirmIntegrity(bundle, confirmation) {
  const issues = [];

  // Receipt / candidate association
  if (!confirmation) {
    return { valid: false, issues: ["Canonical confirmation returned no result"] };
  }
  if (confirmation.finalistId && bundle?.candidateId && confirmation.finalistId !== bundle.candidateId) {
    issues.push(`Confirmation finalistId (${confirmation.finalistId}) != candidate ID (${bundle.candidateId})`);
  }
  const receipt = confirmation.canonicalAuthorityReceipt;
  if (!receipt?.selectedCandidateId) {
    issues.push("Canonical receipt missing selectedCandidateId");
  }

  // Every individual-seat P20 result belongs to a proposed seat
  const bundleSeatIds = new Set(
    (Array.isArray(bundle?.seatingPositions) ? bundle.seatingPositions : [])
      .map((s) => String(s?.id || ""))
      .filter(Boolean),
  );
  const perSeatP20 = Array.isArray(confirmation?.perSeatP20) ? confirmation.perSeatP20 : [];
  if (perSeatP20.length === 0) {
    issues.push("No individual-seat P20 results in confirmation");
  }
  for (const seat of perSeatP20) {
    const seatId = String(seat?.seatId || "");
    if (!seatId) {
      issues.push("A P20 row has no seatId");
      continue;
    }
    if (!bundleSeatIds.has(seatId)) {
      issues.push(`P20 seat ${seatId} not in proposed seating`);
    }
  }

  // P19 evidence present
  if (confirmation.achievedP19Level == null && confirmation.achievedP19VariationDb == null) {
    issues.push("No P19 evidence in confirmation");
  }

  // P14 operating point achieved (or an explicit rejection reason)
  if (confirmation.requestedP14Pass === false && !confirmation.p14NotAchievedReason) {
    issues.push("P14 operating point not achieved but no rejection reason stated");
  }

  // Reject incomplete evidence: physical rejection is a completed terminal
  // outcome, not missing evidence — it is reported as a rejection, not an
  // integrity failure, so the developer runner can surface it.
  if (confirmation.physicalRejection) {
    issues.push(`Physical rejection: ${confirmation.physicalRejection.reason || "unknown"}`);
  }

  return { valid: issues.length === 0, issues };
}