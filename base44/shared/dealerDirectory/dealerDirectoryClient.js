/**
 * Read-only Lovable Sound Proof dealer-directory client.
 *
 * Calls POST /functions/v1/soundproof-dealer-directory on the existing
 * Lovable/Supabase backend host (derived from the turnover endpoint origin)
 * using a dedicated shared secret (x-sound-proof-directory-key header),
 * separate from the turnover-credit integration.
 *
 * This module ONLY reads. It never persists, creates, updates, links, or
 * stamps anything. It returns the full dealer list and a validation report.
 *
 * Fail-closed: any HTTP error, contract mismatch, duplicate ID, or
 * incomplete record throws — the caller must surface it and stop.
 */

const DIRECTORY_PATH = "/functions/v1/soundproof-dealer-directory";
const EXPECTED_CONTRACT_VERSION = 1;
// Accept a small set of sector field names so a reasonable Lovable payload
// shape is validated without being over-fitted to one spelling.
const SECTOR_ALIASES = Object.freeze({
  premium_partner: ["premium_partner", "premium", "PREMIUM_PARTNER", "Premium Partner"],
  trade_account: ["trade_account", "trade", "TRADE_ACCOUNT", "Trade Account"],
  richer_sounds: ["richer_sounds", "richer", "RICHER_SOUNDS", "Richer Sounds"],
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function classifySector(rawSector) {
  const value = String(rawSector || "").trim().toLowerCase();
  if (!value) return "unknown";
  for (const [canonical, aliases] of Object.entries(SECTOR_ALIASES)) {
    for (const alias of aliases) {
      if (String(alias).toLowerCase() === value) return canonical;
    }
  }
  // Substring fallbacks for compound labels.
  if (value.includes("premium")) return "premium_partner";
  if (value.includes("richer")) return "richer_sounds";
  if (value.includes("trade")) return "trade_account";
  return "unknown";
}

function readSector(record) {
  return (
    record?.sector
    || record?.account_sector
    || record?.organisation_type
    || record?.dealer_sector
    || record?.sector_code
    || ""
  );
}

function readString(record, key) {
  const value = record?.[key];
  return hasText(value) ? String(value).trim() : "";
}

function normaliseDealerRecord(record) {
  const dealerAccountId = readString(record, "dealer_account_id");
  // Lovable's directory uses "user_id" as the Portal login user identifier;
  // keep the normalised output name "portal_user_id" for the audit.
  const portalUserId = readString(record, "user_id")
    || readString(record, "portal_user_id")
    || readString(record, "login_user_id");
  const accountName = readString(record, "account_name")
    || readString(record, "name")
    || readString(record, "dealer_name");
  const sector = classifySector(readSector(record));
  const status = readString(record, "status") || readString(record, "dealer_status");
  return {
    dealer_account_id: dealerAccountId,
    portal_user_id: portalUserId,
    trading_account_number: readString(record, "trading_account_number") || null,
    account_name: accountName,
    sector,
    status,
    raw: record,
  };
}

function validateDirectoryRecord(normalised, index) {
  const errors = [];
  if (!normalised.dealer_account_id) {
    errors.push(`Record ${index}: missing dealer_account_id.`);
  } else if (!UUID_PATTERN.test(normalised.dealer_account_id)) {
    errors.push(`Record ${index}: dealer_account_id is not a valid UUID.`);
  }
  if (!normalised.portal_user_id) {
    errors.push(`Record ${index}: missing portal_user_id.`);
  } else if (!UUID_PATTERN.test(normalised.portal_user_id)) {
    errors.push(`Record ${index}: portal_user_id is not a valid UUID.`);
  }
  if (!normalised.account_name) {
    errors.push(`Record ${index}: missing account_name.`);
  }
  return errors;
}

function deriveDirectoryUrl(turnoverUrl) {
  if (!hasText(turnoverUrl)) {
    throw new Error("PARTNER_PORTAL_TURNOVER_URL unavailable; cannot derive directory host.");
  }
  let parsed;
  try {
    parsed = new URL(turnoverUrl);
  } catch {
    throw new Error("PARTNER_PORTAL_TURNOVER_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error("PARTNER_PORTAL_TURNOVER_URL must be a valid HTTPS URL.");
  }
  return `${parsed.origin}${DIRECTORY_PATH}`;
}

async function fetchPage({ url, key, limit, cursor }) {
  if (!hasText(key)) {
    throw new Error("DIRECTORY_KEY_MISSING");
  }
  const body = { limit };
  if (hasText(cursor)) body.cursor = cursor;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sound-proof-directory-key": key,
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    let reason = `HTTP_${response.status}`;
    try {
      const payload = await response.json();
      if (isPlainObject(payload) && hasText(payload.error)) {
        reason = `${reason}:${String(payload.error).slice(0, 120)}`;
      }
    } catch {
      // Non-JSON error body; keep the status-only reason.
    }
    throw new Error(`DIRECTORY_FETCH_FAILED:${reason}`);
  }
  const payload = await response.json().catch(() => null);
  if (!isPlainObject(payload)) {
    throw new Error("DIRECTORY_INVALID_PAYLOAD");
  }
  return payload;
}

/**
 * Retrieve the full dealer directory, following next_cursor until exhausted.
 * Returns { records, contractVersion, contractStatus, pagination, validation }.
 *
 * @param {object} params
 * @param {string} params.turnoverUrl - Existing PARTNER_PORTAL_TURNOVER_URL (host origin reused).
 * @param {string} params.key - Dedicated PARTNER_PORTAL_DIRECTORY_KEY secret.
 * @param {number} [params.limit=200]
 */
export async function fetchDealerDirectory({ turnoverUrl, key, limit = 200 }) {
  const url = deriveDirectoryUrl(turnoverUrl);
  const records = [];
  let cursor = "";
  let pages = 0;
  let contractStatus = null;
  let total = null;
  let snapshot = null;
  const seenCursors = new Set();
  const maxPages = 50;

  while (pages < maxPages) {
    pages += 1;
    const page = await fetchPage({ url, key, limit, cursor });
    if (Number(page.contract_version) !== EXPECTED_CONTRACT_VERSION) {
      throw new Error("DIRECTORY_CONTRACT_VERSION_MISMATCH");
    }
    if (!Number.isSafeInteger(page.directory_total) || page.directory_total < 1
      || typeof page.directory_snapshot !== "string" || !/^[a-f0-9]{64}$/.test(page.directory_snapshot)) {
      throw new Error("DIRECTORY_MANIFEST_INVALID");
    }
    if (pages === 1) {
      total = page.directory_total;
      snapshot = page.directory_snapshot;
      contractStatus = hasText(page.status) ? page.status : null;
    } else if (page.directory_total !== total || page.directory_snapshot !== snapshot) {
      throw new Error("DIRECTORY_SNAPSHOT_CHANGED");
    }
    if (!Array.isArray(page.dealers) || page.dealers.length === 0
      || !page.dealers.every(isPlainObject)) {
      throw new Error("DIRECTORY_PAGE_RECORDS_INVALID");
    }
    for (const raw of page.dealers) records.push(normaliseDealerRecord(raw));
    if (records.length > total) throw new Error("DIRECTORY_COUNT_MISMATCH");
    if (page.next_cursor === null) {
      if (records.length !== total || page.has_more === true) throw new Error("DIRECTORY_COUNT_MISMATCH");
      cursor = "";
      break;
    }
    if (!hasText(page.next_cursor) || seenCursors.has(page.next_cursor)
      || records.length >= total || page.has_more === false) {
      throw new Error("DIRECTORY_CURSOR_INVALID");
    }
    cursor = page.next_cursor;
    seenCursors.add(cursor);
  }

  if (cursor) throw new Error("DIRECTORY_PAGINATION_EXHAUSTED:cursor remained after max pages.");

  return {
    records,
    contractVersion: EXPECTED_CONTRACT_VERSION,
    contractStatus,
    pagination: { pages, limit, sourceTotal: total },
  };
}

/**
 * Validate identities and record shape after the full source snapshot was read.
 */
export function validateDealerDirectory({ records, sourceTotal }) {
  const errors = [];
  const warnings = [];

  if (!Number.isSafeInteger(sourceTotal) || sourceTotal < 1 || records.length !== sourceTotal) {
    errors.push("DIRECTORY_COUNT_MISMATCH");
  }

  const seenDealerIds = new Set();
  const seenPortalUserIds = new Set();
  const duplicateDealerIds = [];
  const duplicatePortalUserIds = [];
  for (const record of records) {
    const dealerId = record.dealer_account_id?.toLowerCase();
    const portalUserId = record.portal_user_id?.toLowerCase();
    if (dealerId) {
      if (seenDealerIds.has(dealerId)) {
        duplicateDealerIds.push(record.dealer_account_id);
      } else {
        seenDealerIds.add(dealerId);
      }
    }
    if (portalUserId) {
      if (seenPortalUserIds.has(portalUserId)) {
        duplicatePortalUserIds.push(record.portal_user_id);
      } else {
        seenPortalUserIds.add(portalUserId);
      }
    }
  }
  if (duplicateDealerIds.length > 0) {
    errors.push(`DUPLICATE_DEALER_ACCOUNT_IDS:${duplicateDealerIds.length}`);
  }
  if (duplicatePortalUserIds.length > 0) {
    errors.push(`DUPLICATE_PORTAL_USER_IDS:${duplicatePortalUserIds.length}`);
  }

  const incompleteErrors = [];
  records.forEach((record, index) => {
    const recordErrors = validateDirectoryRecord(record, index);
    for (const err of recordErrors) incompleteErrors.push(err);
  });
  if (incompleteErrors.length > 0) {
    errors.push(`INCOMPLETE_RECORDS:${incompleteErrors.length}`);
  }

  const sectorCounts = {
    premium_partner: 0,
    trade_account: 0,
    richer_sounds: 0,
    unknown: 0,
  };
  for (const record of records) {
    const sector = record.sector || "unknown";
    if (sectorCounts[sector] === undefined) sectorCounts[sector] = 0;
    sectorCounts[sector] += 1;
  }
  if (sectorCounts.unknown > 0) {
    errors.push(`UNKNOWN_SECTORS:${sectorCounts.unknown}`);
  }

  const duplicateDealerIdSamples = duplicateDealerIds.slice(0, 5);
  const duplicatePortalUserIdSamples = duplicatePortalUserIds.slice(0, 5);
  const incompleteSamples = incompleteErrors.slice(0, 5);

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    totals: {
      total: records.length,
      expected_total: sourceTotal,
      contract_version_expected: EXPECTED_CONTRACT_VERSION,
    },
    sectors: sectorCounts,
    duplicates: {
      duplicate_dealer_account_ids: duplicateDealerIdSamples,
      duplicate_portal_user_ids: duplicatePortalUserIdSamples,
    },
    incomplete: incompleteSamples,
  };
}

export {
  EXPECTED_CONTRACT_VERSION,
};
