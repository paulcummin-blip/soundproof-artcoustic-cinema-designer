// Turnover snapshot selection authority — pure, dependency-free helpers for
// selecting the newest valid source turnover record (by source timestamp,
// falling back to sync_date when the source timestamp is null/Unknown) and
// for building freshness metadata for the Dealer Admin display.
//
// "Newest" means the most recent source timestamp, NOT the highest historical
// amount. Historical TurnoverRecord rows are never overwritten; this module
// only reads them to decide which one to display.

const SOURCE_SYSTEM = "ARTCOUSTIC_PARTNER_PORTAL";

function effectiveTimestamp(record) {
  const sourceTs = record?.source_last_updated ? Date.parse(record.source_last_updated) : NaN;
  if (Number.isFinite(sourceTs)) return sourceTs;
  const syncTs = record?.sync_date ? Date.parse(record.sync_date) : NaN;
  if (Number.isFinite(syncTs)) return syncTs;
  return 0;
}

/**
 * Select the newest valid source turnover record for one account + year.
 * Returns the full TurnoverRecord object, or null if no record exists.
 */
export function newestTurnoverRecord(records, accountId, calendarYear) {
  if (!Array.isArray(records) || !accountId || !calendarYear) return null;
  let best = null;
  let bestTime = -Infinity;
  for (const r of records) {
    if (r?.account_id !== accountId) continue;
    if (Number(r?.calendar_year) !== Number(calendarYear)) continue;
    if (r?.source_system && r.source_system !== SOURCE_SYSTEM) continue;
    const val = Number(r?.eligible_turnover_gbp);
    if (!Number.isFinite(val)) continue;
    const effective = effectiveTimestamp(r);
    if (effective >= bestTime) {
      bestTime = effective;
      best = r;
    }
  }
  return best;
}

/**
 * Build a Map of account_id → turnover snapshot for a given year.
 * The snapshot is the NEWEST source record's value plus freshness metadata:
 *   { value, source_last_updated, timestamp_known, sync_date }
 * `timestamp_known` is false when the source timestamp was null (Unknown).
 */
export function buildTurnoverSnapshotMap(records, calendarYear) {
  const map = new Map();
  if (!Array.isArray(records)) return map;
  const byAccount = new Map();
  for (const r of records) {
    if (Number(r?.calendar_year) !== Number(calendarYear)) continue;
    if (r?.source_system && r.source_system !== SOURCE_SYSTEM) continue;
    const val = Number(r?.eligible_turnover_gbp);
    if (!Number.isFinite(val)) continue;
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, []);
    byAccount.get(r.account_id).push(r);
  }
  for (const [accountId, accRecords] of byAccount) {
    let best = null;
    let bestTime = -Infinity;
    for (const r of accRecords) {
      const effective = effectiveTimestamp(r);
      if (effective >= bestTime) {
        bestTime = effective;
        best = r;
      }
    }
    if (best) {
      const sourceLastUpdated = best.source_last_updated || null;
      map.set(accountId, {
        value: Number(best.eligible_turnover_gbp),
        source_last_updated: sourceLastUpdated,
        timestamp_known: Boolean(sourceLastUpdated),
        sync_date: best.sync_date || null,
      });
    }
  }
  return map;
}

/**
 * Build a Map of account_id → turnover (GBP) for a given year.
 * Returns the NEWEST source record's value, not the highest historical amount.
 */
export function buildTurnoverMap(records, calendarYear) {
  const map = new Map();
  if (!Array.isArray(records)) return map;
  const bestTimeByAccount = new Map();
  for (const r of records) {
    if (Number(r?.calendar_year) !== Number(calendarYear)) continue;
    if (r?.source_system && r.source_system !== SOURCE_SYSTEM) continue;
    const val = Number(r?.eligible_turnover_gbp);
    if (!Number.isFinite(val)) continue;
    const effective = effectiveTimestamp(r);
    const existingBest = bestTimeByAccount.get(r.account_id) ?? -Infinity;
    if (effective >= existingBest) {
      bestTimeByAccount.set(r.account_id, effective);
      map.set(r.account_id, val);
    }
  }
  return map;
}

/**
 * Aggregate TurnoverRecord entries for one account + calendar year.
 * Returns the eligible_turnover_gbp (GBP) from the NEWEST source record, or
 * null if no record exists. Never returns the highest historical amount.
 */
export function aggregateTurnoverForYear(records, accountId, calendarYear) {
  const newest = newestTurnoverRecord(records, accountId, calendarYear);
  if (!newest) return null;
  const val = Number(newest?.eligible_turnover_gbp);
  return Number.isFinite(val) ? val : null;
}