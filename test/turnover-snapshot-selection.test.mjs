import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTurnoverMap,
  buildTurnoverSnapshotMap,
  aggregateTurnoverForYear,
  newestTurnoverRecord,
} from "../src/lib/commercial/turnoverSnapshotAuthority.js";

const ACCOUNT_A = "sound-proof-account-a";
const YEAR = 2026;

function record({ turnover, sourceLastUpdated, syncDate }) {
  return {
    account_id: ACCOUNT_A,
    calendar_year: YEAR,
    eligible_turnover_gbp: turnover,
    source_currency: "GBP",
    source_turnover: turnover,
    source_system: "ARTCOUSTIC_PARTNER_PORTAL",
    source_last_updated: sourceLastUpdated,
    sync_date: syncDate,
  };
}

test("buildTurnoverMap selects the newest source record, not the highest amount", () => {
  const records = [
    record({ turnover: 90000, sourceLastUpdated: "2026-01-15T00:00:00.000Z", syncDate: "2026-01-15T00:00:00.000Z" }),
    record({ turnover: 15000, sourceLastUpdated: "2026-06-15T00:00:00.000Z", syncDate: "2026-06-15T00:00:00.000Z" }),
  ];
  const map = buildTurnoverMap(records, YEAR);
  // The newest record (June) has £15k, the older record (Jan) has £90k.
  // The map must return £15k (newest), not £90k (highest).
  assert.equal(map.get(ACCOUNT_A), 15000);
});

test("buildTurnoverSnapshotMap returns freshness metadata from the newest record", () => {
  const records = [
    record({ turnover: 90000, sourceLastUpdated: "2026-01-15T00:00:00.000Z", syncDate: "2026-01-15T00:00:00.000Z" }),
    record({ turnover: 15000, sourceLastUpdated: "2026-06-15T00:00:00.000Z", syncDate: "2026-06-15T00:00:00.000Z" }),
  ];
  const map = buildTurnoverSnapshotMap(records, YEAR);
  const snap = map.get(ACCOUNT_A);
  assert.equal(snap.value, 15000);
  assert.equal(snap.source_last_updated, "2026-06-15T00:00:00.000Z");
  assert.equal(snap.timestamp_known, true);
});

test("null source timestamps are reported as Unknown, never the current date", () => {
  const records = [
    record({ turnover: 50000, sourceLastUpdated: null, syncDate: "2026-03-15T00:00:00.000Z" }),
  ];
  const map = buildTurnoverSnapshotMap(records, YEAR);
  const snap = map.get(ACCOUNT_A);
  assert.equal(snap.value, 50000);
  assert.equal(snap.source_last_updated, null);
  assert.equal(snap.timestamp_known, false);
});

test("a null-timestamp record ordered by sync_date can win over an older known-timestamp record", () => {
  const records = [
    record({ turnover: 50000, sourceLastUpdated: "2026-06-15T00:00:00.000Z", syncDate: "2026-06-15T00:00:00.000Z" }),
    record({ turnover: 80000, sourceLastUpdated: null, syncDate: "2026-07-15T00:00:00.000Z" }),
  ];
  const map = buildTurnoverMap(records, YEAR);
  // Effective time = source_last_updated if known, else sync_date.
  // The null record's sync_date (July) is later than the known record's
  // source time (June), so the null record is selected as newest. Its
  // timestamp_known flag remains false so the display shows "Unknown".
  assert.equal(map.get(ACCOUNT_A), 80000);
  const snap = buildTurnoverSnapshotMap(records, YEAR).get(ACCOUNT_A);
  assert.equal(snap.timestamp_known, false);
  assert.equal(snap.source_last_updated, null);
});

test("aggregateTurnoverForYear returns the newest record's value", () => {
  const records = [
    record({ turnover: 90000, sourceLastUpdated: "2026-01-15T00:00:00.000Z", syncDate: "2026-01-15T00:00:00.000Z" }),
    record({ turnover: 15000, sourceLastUpdated: "2026-06-15T00:00:00.000Z", syncDate: "2026-06-15T00:00:00.000Z" }),
  ];
  assert.equal(aggregateTurnoverForYear(records, ACCOUNT_A, YEAR), 15000);
});

test("newestTurnoverRecord returns null when no matching records exist", () => {
  assert.equal(newestTurnoverRecord([], ACCOUNT_A, YEAR), null);
  assert.equal(newestTurnoverRecord([record({ turnover: 1000, sourceLastUpdated: null, syncDate: "2026-01-01T00:00:00.000Z" })], "other-account", YEAR), null);
});