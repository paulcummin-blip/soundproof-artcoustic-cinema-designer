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
const EXPECTED_TOTAL = 242;

const SECTOR_TOTALS = Object.freeze({
  premium_partner: 26,
  trade_account: 163,
  richer_sounds: 53,
});

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
  let rawContractVersion = null;
  let contractStatus = null;
  const maxPages = 50;

  while (pages < maxPages) {
    pages += 1;
    const page = await fetchPage({ url, key, limit, cursor });
    if (pages === 1) {
      rawContractVersion = page.contract_version;
      contractStatus = hasText(page.status) ? page.status : null;
      if (Number(rawContractVersion) !== EXPECTED_CONTRACT_VERSION) {
        throw new Error(
          `DIRECTORY_CONTRACT_VERSION_MISMATCH:expected ${EXPECTED_CONTRACT_VERSION}, got ${rawContractVersion}`,
        );
      }
    }
    const pageRecords = Array.isArray(page.dealers) ? page.dealers
      : Array.isArray(page.accounts) ? page.accounts
      : Array.isArray(page.records) ? page.records
      : [];
    for (const raw of pageRecords) {
      if (!isPlainObject(raw)) continue;
      records.push(normaliseDealerRecord(raw));
    }
    const nextCursor = hasText(page.next_cursor) ? String(page.next_cursor) : "";
    if (!nextCursor || page.has_more === false) {
      cursor = "";
      break;
    }
    cursor = nextCursor;
  }

  if (cursor) {
    throw new Error("DIRECTORY_PAGINATION_EXHAUSTED:cursor remained after max pages.");
  }

  return {
    records,
    contractVersion: rawContractVersion,
    contractStatus,
    pagination: { pages, limit },
  };
}

/**
 * Validate the full retrieved directory against the Stage 2B contract:
 * contract_version 1, 242 unique dealers, sector totals, no duplicate
 * Dealer Account IDs, no missing IDs or incomplete records.
 */
export function validateDealerDirectory({ records }) {
  const errors = [];
  const warnings = [];

  if (Number(records.length) !== EXPECTED_TOTAL) {
    errors.push(
      `TOTAL_MISMATCH:expected ${EXPECTED_TOTAL}, got ${records.length}.`,
    );
  }

  const seenDealerIds = new Set();
  const seenPortalUserIds = new Set();
  const duplicateDealerIds = [];
  const duplicatePortalUserIds = [];
  for (const record of records) {
    if (record.dealer_account_id) {
      if (seenDealerIds.has(record.dealer_account_id)) {
        duplicateDealerIds.push(record.dealer_account_id);
      } else {
        seenDealerIds.add(record.dealer_account_id);
      }
    }
    if (record.portal_user_id) {
      if (seenPortalUserIds.has(record.portal_user_id)) {
        duplicatePortalUserIds.push(record.portal_user_id);
      } else {
        seenPortalUserIds.add(record.portal_user_id);
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
  for (const [sector, expected] of Object.entries(SECTOR_TOTALS)) {
    if (Number(sectorCounts[sector]) !== expected) {
      errors.push(
        `SECTOR_MISMATCH:${sector}:expected ${expected}, got ${sectorCounts[sector]}`,
      );
    }
  }
  if (sectorCounts.unknown > 0) {
    warnings.push(`UNKNOWN_SECTORS:${sectorCounts.unknown}`);
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
      expected_total: EXPECTED_TOTAL,
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
  EXPECTED_TOTAL,
  SECTOR_TOTALS,
};