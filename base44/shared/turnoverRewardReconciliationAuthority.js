const CONTRACT_VERSION = 1;
const THRESHOLD_STEP_GBP = 10000;
const CREDITS_PER_THRESHOLD = 5;
const MAX_DEALERS = 1000;
const MAX_THRESHOLDS_PER_DEALER = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Per-dealer additive turnover field names accepted from the Portal contract.
// The original contract used `current_turnover_gbp` and `turnover_source_updated_at`.
// Lovable's additive change introduces `annual_turnover_gbp` and `turnover_updated_at`
// (where the timestamp may be null = Unknown). Both shapes are accepted here and
// normalised to the canonical internal keys `current_turnover_gbp` and
// `turnover_source_updated_at` so the rest of the pipeline (snapshot authority,
// Dealer Admin display) never branches on source field names.
const TURNOVER_AMOUNT_FIELDS = ["current_turnover_gbp", "annual_turnover_gbp"];
const TURNOVER_TIMESTAMP_FIELDS = ["turnover_source_updated_at", "turnover_updated_at"];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export function validateEntitlementContract(payload, expectedCalendarYear) {
  if (!isPlainObject(payload)) throw new Error("Contract payload must be an object");
  if (!hasOnlyKeys(payload, ["contract_version", "calendar_year", "calculated_at", "dealers"])) {
    throw new Error("Contract contains unsupported fields");
  }
  if (Number(payload.contract_version) !== CONTRACT_VERSION) {
    throw new Error("Unsupported contract version");
  }

  const calendarYear = Number(payload.calendar_year);
  if (!Number.isInteger(calendarYear) || calendarYear !== Number(expectedCalendarYear)) {
    throw new Error("Contract calendar year mismatch");
  }
  if (!payload.calculated_at || Number.isNaN(Date.parse(payload.calculated_at))) {
    throw new Error("Contract calculated_at is invalid");
  }
  if (!Array.isArray(payload.dealers) || payload.dealers.length > MAX_DEALERS) {
    throw new Error("Contract dealers must be a bounded array");
  }

  const seenDealerIds = new Set();
  const dealers = payload.dealers.map((rawDealer) => {
    if (!isPlainObject(rawDealer)) throw new Error("Dealer entitlement must be an object");
    if (!hasOnlyKeys(rawDealer, [
      "dealer_account_id",
      "earned_thresholds_gbp",
      "credits_per_threshold",
      "current_turnover_gbp",
      "turnover_source_updated_at",
      "annual_turnover_gbp",
      "turnover_updated_at",
    ])) {
      throw new Error("Dealer entitlement contains unsupported fields");
    }

    // Normalise the additive turnover fields from either the original or the
    // new Lovable contract shape. A dealer may supply the amount under either
    // name, and the timestamp under either name. The timestamp is allowed to
    // be null (Unknown) but may never be substituted with the current date.
    const amountPresent = TURNOVER_AMOUNT_FIELDS.some((f) => rawDealer[f] !== undefined);
    const tsField = TURNOVER_TIMESTAMP_FIELDS.find((f) => rawDealer[f] !== undefined);
    const tsPresent = tsField !== undefined;
    if (amountPresent !== tsPresent) {
      throw new Error("Dealer entitlement must provide turnover amount and timestamp together");
    }
    if (amountPresent) {
      // Reject only when the same logical field is supplied under both names
      // with different values — that is ambiguous, not additive.
      if (rawDealer.current_turnover_gbp !== undefined && rawDealer.annual_turnover_gbp !== undefined
        && Number(rawDealer.current_turnover_gbp) !== Number(rawDealer.annual_turnover_gbp)) {
        throw new Error("Dealer entitlement has conflicting turnover amounts");
      }
      if (rawDealer.turnover_source_updated_at !== undefined && rawDealer.turnover_updated_at !== undefined) {
        const a = rawDealer.turnover_source_updated_at;
        const b = rawDealer.turnover_updated_at;
        const bothNull = a === null && b === null;
        const bothValid = a !== null && b !== null
          && Number.isFinite(Date.parse(a)) && Number.isFinite(Date.parse(b))
          && new Date(a).getTime() === new Date(b).getTime();
        if (!bothNull && !bothValid) {
          throw new Error("Dealer entitlement has conflicting turnover timestamps");
        }
      }
    }

    const dealerAccountIdRaw = String(rawDealer.dealer_account_id || "").trim();
    if (!UUID_PATTERN.test(dealerAccountIdRaw)) {
      throw new Error("Dealer entitlement has an invalid stable identifier");
    }
    const dealerAccountId = dealerAccountIdRaw.toLowerCase();
    if (seenDealerIds.has(dealerAccountId)) {
      throw new Error("Contract contains a duplicate dealer stable identifier");
    }
    seenDealerIds.add(dealerAccountId);

    if (Number(rawDealer.credits_per_threshold) !== CREDITS_PER_THRESHOLD) {
      throw new Error("Dealer entitlement has an unsupported reward value");
    }
    if (!Array.isArray(rawDealer.earned_thresholds_gbp)
      || rawDealer.earned_thresholds_gbp.length > MAX_THRESHOLDS_PER_DEALER) {
      throw new Error("Dealer entitlement thresholds must be a bounded array");
    }

    const thresholds = rawDealer.earned_thresholds_gbp.map(Number);
    for (let index = 0; index < thresholds.length; index += 1) {
      const expectedThreshold = (index + 1) * THRESHOLD_STEP_GBP;
      if (!Number.isInteger(thresholds[index]) || thresholds[index] !== expectedThreshold) {
        throw new Error("Dealer entitlement thresholds must be contiguous £10,000 milestones");
      }
    }

    // Optional per-dealer annual turnover and source timestamp (additive).
    // Both must be present together or both absent — a turnover value without
    // a source timestamp cannot be displayed with a freshness label. The
    // timestamp may be null, which is preserved as null (Unknown) and never
    // converted to the current date.
    const hasTurnover = amountPresent;
    let currentTurnoverGbp = undefined;
    let turnoverSourceUpdatedAt = undefined;
    let turnoverTimestampKnown = undefined;
    if (hasTurnover) {
      const amountField = TURNOVER_AMOUNT_FIELDS.find((f) => rawDealer[f] !== undefined);
      currentTurnoverGbp = Number(rawDealer[amountField]);
      if (!Number.isFinite(currentTurnoverGbp) || currentTurnoverGbp < 0) {
        throw new Error("Dealer turnover amount must be a non-negative number");
      }
      const rawTs = rawDealer[tsField];
      if (rawTs === null) {
        // Unknown timestamp — preserved honestly. A snapshot is still appended
        // (the amount is real) but the Dealer Admin shows the source time as
        // Unknown so a stale value is never mistaken for a current one.
        turnoverSourceUpdatedAt = null;
        turnoverTimestampKnown = false;
      } else {
        const parsedTs = Date.parse(rawTs);
        if (!Number.isFinite(parsedTs)) {
          throw new Error("Dealer turnover timestamp is invalid");
        }
        turnoverSourceUpdatedAt = new Date(parsedTs).toISOString();
        turnoverTimestampKnown = true;
      }
    }

    const dealer = {
      dealer_account_id: dealerAccountId,
      earned_thresholds_gbp: thresholds,
      credits_per_threshold: CREDITS_PER_THRESHOLD,
    };
    if (hasTurnover) {
      dealer.current_turnover_gbp = currentTurnoverGbp;
      dealer.turnover_source_updated_at = turnoverSourceUpdatedAt;
      dealer.turnover_timestamp_known = turnoverTimestampKnown;
    }
    return dealer;
  });

  dealers.sort((a, b) => a.dealer_account_id.localeCompare(b.dealer_account_id));
  return {
    contract_version: CONTRACT_VERSION,
    calendar_year: calendarYear,
    calculated_at: new Date(payload.calculated_at).toISOString(),
    dealers,
  };
}

export function turnoverRewardKey(accountId, calendarYear, threshold) {
  return `uk_turnover:${accountId}:${calendarYear}:${threshold}`;
}

function parseThresholdFromKey(key, accountId, calendarYear) {
  if (typeof key !== "string") return null;
  const prefix = `uk_turnover:${accountId}:${calendarYear}:`;
  if (!key.startsWith(prefix)) return null;
  const remainder = key.slice(prefix.length);
  const thresholdText = remainder.split(":")[0];
  const threshold = Number(thresholdText);
  if (!Number.isInteger(threshold) || threshold <= 0 || threshold % THRESHOLD_STEP_GBP !== 0) return null;
  return threshold;
}

function sortLedgerEvents(entries) {
  return [...entries].sort((a, b) => {
    const aTime = Date.parse(a?.created_date || "") || 0;
    const bTime = Date.parse(b?.created_date || "") || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function thresholdEvents(entries, accountId, calendarYear, threshold) {
  const baseKey = turnoverRewardKey(accountId, calendarYear, threshold);
  return sortLedgerEvents((Array.isArray(entries) ? entries : []).filter((entry) => {
    const key = entry?.idempotency_key;
    return key === baseKey || (typeof key === "string" && key.startsWith(`${baseKey}:`));
  }));
}

function netThresholdCredits(events) {
  let net = 0;
  let activePositiveId = null;

  for (const entry of events) {
    const delta = Number(entry?.delta);
    if (!Number.isFinite(delta) || Math.abs(delta) !== CREDITS_PER_THRESHOLD) {
      throw new Error("Turnover threshold ledger contains an invalid delta");
    }

    if (delta > 0) {
      if (entry?.transaction_type !== "UK_TURNOVER_REWARD" || net !== 0 || !entry?.id) {
        throw new Error("Turnover threshold ledger contains an invalid reward sequence");
      }
      net = CREDITS_PER_THRESHOLD;
      activePositiveId = entry.id;
    } else {
      if (entry?.transaction_type !== "REVERSAL"
        || net !== CREDITS_PER_THRESHOLD
        || !activePositiveId
        || entry?.reversal_of !== activePositiveId) {
        throw new Error("Turnover threshold ledger contains an invalid reversal sequence");
      }
      net = 0;
      activePositiveId = null;
    }
  }

  return net;
}

export function buildThresholdReconciliationPlan({
  accountId,
  calendarYear,
  earnedThresholds,
  ledgerEntries,
}) {
  if (!accountId) throw new Error("Sound Proof account id is required");
  if (!Number.isInteger(Number(calendarYear))) throw new Error("Calendar year is required");

  const earned = new Set((Array.isArray(earnedThresholds) ? earnedThresholds : []).map(Number));
  const thresholds = new Set(earned);
  for (const entry of Array.isArray(ledgerEntries) ? ledgerEntries : []) {
    const parsed = parseThresholdFromKey(entry?.idempotency_key, accountId, calendarYear);
    if (parsed) thresholds.add(parsed);
  }

  const actions = [];
  for (const threshold of [...thresholds].sort((a, b) => a - b)) {
    const events = thresholdEvents(ledgerEntries, accountId, calendarYear, threshold);
    const net = netThresholdCredits(events);
    if (net !== 0 && net !== CREDITS_PER_THRESHOLD) {
      throw new Error(`Turnover threshold £${threshold} has an inconsistent ledger net of ${net}`);
    }

    const baseKey = turnoverRewardKey(accountId, calendarYear, threshold);
    if (earned.has(threshold) && net === 0) {
      const lastReversal = [...events].reverse().find((event) => Number(event?.delta) < 0) || null;
      actions.push({
        kind: lastReversal ? "REINSTATE" : "AWARD",
        threshold,
        delta: CREDITS_PER_THRESHOLD,
        idempotency_key: lastReversal ? `${baseKey}:regrant:${lastReversal.id}` : baseKey,
        reversal_of: null,
        previous_event_id: lastReversal?.id || null,
      });
    } else if (!earned.has(threshold) && net === CREDITS_PER_THRESHOLD) {
      const activePositive = [...events].reverse().find((event) => Number(event?.delta) > 0);
      if (!activePositive?.id) {
        throw new Error(`Turnover threshold £${threshold} has no reversible positive event`);
      }
      actions.push({
        kind: "REVERSE",
        threshold,
        delta: -CREDITS_PER_THRESHOLD,
        idempotency_key: `${baseKey}:reversal:${activePositive.id}`,
        reversal_of: activePositive.id,
        previous_event_id: activePositive.id,
      });
    }
  }

  return actions;
}

export const TURNOVER_REWARD_RULE = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  thresholdStepGbp: THRESHOLD_STEP_GBP,
  creditsPerThreshold: CREDITS_PER_THRESHOLD,
});