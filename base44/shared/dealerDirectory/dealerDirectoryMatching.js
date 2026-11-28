/**
 * Pure dealer-directory matching against existing Sound Proof Account and
 * ExternalAccountLink records. Shared by the read-only directory audit and the
 * directory import so both classify dealers identically.
 *
 * Identity is resolved through ExternalAccountLink only — never by dealer name
 * alone. A directory dealer is an EXACT MATCH when an active external link
 * resolves it (by partner_user_id first, then external_account_number) to an
 * existing Sound Proof account. A NAME_MATCH_UNLINKED is an existing account
 * that shares the dealer's name but has no external link — a conflict that
 * must be resolved manually before import. AMBIGUOUS covers multiple accounts
 * sharing a name, or one account linked to multiple portal identities.
 * Everything else is a NEW account.
 */

const SOURCE_SYSTEM = "ARTCOUSTIC_PARTNER_PORTAL";

function normaliseUuid(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Map a Lovable directory sector to the Sound Proof Account dealer_group.
 * All directory entries are dealer organisations.
 */
export function sectorToDealerGroup(sector) {
  switch (String(sector || "").trim().toLowerCase()) {
    case "premium_partner":
      return "PREMIUM_PARTNER";
    case "richer_sounds":
      return "RICHER_SOUNDS";
    default:
      return "OTHER_DEALER";
  }
}

export const DIRECTORY_SOURCE_SYSTEM = SOURCE_SYSTEM;

/**
 * @param {object} params
 * @param {Array} params.directoryRecords - Normalised dealer records from fetchDealerDirectory.
 * @param {Array} params.accounts - Existing Sound Proof Account records.
 * @param {Array} params.externalLinks - Existing ExternalAccountLink records (any active state).
 * @returns {{ exactMatches, accountsNeedingLinking, newAccounts, ambiguous }}
 */
export function classifyDirectoryMatches({ directoryRecords, accounts, externalLinks }) {
  const accountList = Array.isArray(accounts) ? accounts : [];
  const linkList = Array.isArray(externalLinks) ? externalLinks : [];

  const linksByPortalUserId = new Map();
  const linksByPortalDealerId = new Map();
  const linksByDealerId = new Map();
  function indexLink(index, key, link) {
    if (!key) return;
    const matches = index.get(key) ?? [];
    matches.push(link);
    index.set(key, matches);
  }
  for (const link of linkList) {
    const partnerUser = normaliseUuid(link?.partner_user_id);
    const portalDealerId = normaliseUuid(link?.portal_dealer_account_id);
    indexLink(linksByPortalUserId, partnerUser, link);
    indexLink(linksByPortalDealerId, portalDealerId, link);
    if (!portalDealerId) indexLink(linksByDealerId, normaliseUuid(link?.external_account_number), link);
  }

  const accountsById = new Map();
  const accountsByNormalisedName = new Map();
  for (const account of accountList) {
    accountsById.set(String(account.id), account);
    const name = String(account?.name || "").trim().toLowerCase();
    if (name) {
      if (!accountsByNormalisedName.has(name)) accountsByNormalisedName.set(name, []);
      accountsByNormalisedName.get(name).push(account);
    }
  }

  const exactMatches = [];
  const accountsNeedingLinking = [];
  const newAccounts = [];
  const ambiguous = [];

  for (const record of directoryRecords) {
    const dealerId = normaliseUuid(record.dealer_account_id);
    const portalUserId = normaliseUuid(record.portal_user_id);

    const byUser = linksByPortalUserId.get(portalUserId) ?? [];
    const byDealer = linksByPortalDealerId.get(dealerId) ?? [];
    const byLegacyDealer = linksByDealerId.get(dealerId) ?? [];
    const candidates = [...new Set([...byUser, ...byDealer, ...byLegacyDealer])];
    const matchedLink = candidates[0];
    const matchedAccount = accountsById.get(String(matchedLink?.account_id ?? ""));
    const linkedUserId = normaliseUuid(matchedLink?.partner_user_id);
    const linkedDealerId = normaliseUuid(matchedLink?.portal_dealer_account_id)
      || normaliseUuid(matchedLink?.external_account_number);
    if (candidates.length > 1 || (matchedLink && (!matchedAccount
      || (linkedUserId && linkedUserId !== portalUserId)
      || (linkedDealerId && linkedDealerId !== dealerId)))) {
      ambiguous.push({
        dealer_account_id: record.dealer_account_id,
        portal_user_id: record.portal_user_id,
        account_name: record.account_name,
        sector: record.sector,
        reason: "Existing Portal link identities conflict or the linked account is missing.",
      });
      continue;
    }

    const nameMatches = accountsByNormalisedName.get(
      String(record.account_name || "").trim().toLowerCase(),
    ) || [];

    if (matchedAccount) {
      exactMatches.push({
        dealer_account_id: record.dealer_account_id,
        portal_user_id: record.portal_user_id,
        account_name: record.account_name,
        sector: record.sector,
        sound_proof_account_id: matchedAccount.id,
        sound_proof_account_name: matchedAccount.name,
        sound_proof_account_status: matchedAccount.status,
        linked_via: byUser.length ? "portal_user_id" : byDealer.length ? "portal_dealer_account_id" : "dealer_account_id",
      });
    } else if (nameMatches.length === 1) {
      accountsNeedingLinking.push({
        dealer_account_id: record.dealer_account_id,
        portal_user_id: record.portal_user_id,
        account_name: record.account_name,
        sector: record.sector,
        candidate_sound_proof_account_id: nameMatches[0].id,
        candidate_sound_proof_account_name: nameMatches[0].name,
        candidate_sound_proof_account_status: nameMatches[0].status,
        reason: "Name matches an existing Sound Proof account but no external link exists.",
      });
    } else if (nameMatches.length > 1) {
      ambiguous.push({
        dealer_account_id: record.dealer_account_id,
        portal_user_id: record.portal_user_id,
        account_name: record.account_name,
        sector: record.sector,
        reason: `Multiple Sound Proof accounts share the name "${record.account_name}" (${nameMatches.length}).`,
        candidates: nameMatches.map((a) => ({ id: a.id, name: a.name, status: a.status })),
      });
    } else {
      newAccounts.push({
        dealer_account_id: record.dealer_account_id,
        portal_user_id: record.portal_user_id,
        trading_account_number: record.trading_account_number ?? null,
        account_name: record.account_name,
        sector: record.sector,
        status: record.status,
      });
    }
  }

  // Conflict: one Sound Proof account linked to multiple portal_user_ids.
  const accountToPortalUser = new Map();
  for (const match of exactMatches) {
    const portalUser = normaliseUuid(match.portal_user_id);
    const existing = accountToPortalUser.get(match.sound_proof_account_id);
    if (existing && existing !== portalUser) {
      ambiguous.push({
        dealer_account_id: match.dealer_account_id,
        portal_user_id: match.portal_user_id,
        account_name: match.account_name,
        sector: match.sector,
        reason: `Sound Proof account ${match.sound_proof_account_id} is linked to multiple portal_user_ids.`,
      });
    } else {
      accountToPortalUser.set(match.sound_proof_account_id, portalUser);
    }
  }

  return { exactMatches, accountsNeedingLinking, newAccounts, ambiguous };
}