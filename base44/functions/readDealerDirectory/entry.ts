import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import {
  fetchDealerDirectory,
  validateDealerDirectory,
  EXPECTED_CONTRACT_VERSION,
} from "../../shared/dealerDirectory/dealerDirectoryClient.js";

const SOURCE_SYSTEM = "ARTCOUSTIC_PARTNER_PORTAL";

function summariseError(error) {
  return String(error?.message || error || "Unknown error").slice(0, 800);
}

function normaliseUuid(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Read-only admin endpoint: retrieves the full Lovable dealer directory,
 * validates the Stage 2B contract, and produces a read-only matching audit
 * against existing Sound Proof Account and ExternalAccountLink records.
 *
 * This function performs NO writes. It never creates, activates, suspends,
 * links, credits, or modifies any Sound Proof account, membership, project,
 * proposal, ledger entry or identity record.
 */
export default async function readDealerDirectory(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit) || 200;
    const auditOnly = body?.audit_only !== true;

    const turnoverUrl = secrets.get("PARTNER_PORTAL_TURNOVER_URL");
    const directoryKey = secrets.get("PARTNER_PORTAL_DIRECTORY_KEY");
    if (!turnoverUrl || !directoryKey) {
      return Response.json({
        status: "SECRETS_MISSING",
        message:
          "PARTNER_PORTAL_TURNOVER_URL and PARTNER_PORTAL_DIRECTORY_KEY must be configured.",
      }, { status: 503 });
    }

    let directory;
    try {
      directory = await fetchDealerDirectory({ turnoverUrl, key: directoryKey, limit });
    } catch (error) {
      return Response.json({
        status: "DIRECTORY_FETCH_FAILED",
        message: summariseError(error),
      }, { status: 502 });
    }

    const validation = validateDealerDirectory({ records: directory.records, sourceTotal: directory.pagination.sourceTotal });

    if (!validation.passed) {
      // Still return the audit if records were retrieved, but mark connection FAIL.
    }

    // Read-only matching audit against existing Sound Proof records.
    const service = base44.asServiceRole;
    const [accounts, externalLinks] = await Promise.all([
      service.entities.Account.list("-created_date", 1000),
      service.entities.ExternalAccountLink.filter({
        source_system: SOURCE_SYSTEM,
        active: true,
      }),
    ]);

    const accountList = Array.isArray(accounts) ? accounts : [];
    const linkList = Array.isArray(externalLinks) ? externalLinks : [];

    // Index existing external links by portal_dealer_account_id, portal_user_id
    // and external_account_number (legacy fallback).
    const linksByDealerId = new Map();
    const linksByPortalDealerId = new Map();
    const linksByPortalUserId = new Map();
    for (const link of linkList) {
      const portalUserId = normaliseUuid(link?.partner_user_id);
      const portalDealerId = normaliseUuid(link?.portal_dealer_account_id);
      const extNum = normaliseUuid(link?.external_account_number);
      // The ExternalAccountLink stores partner_user_id as the canonical Portal
      // user identifier, and portal_dealer_account_id as the immutable Portal
      // Dealer Account UUID (organisation identity). Legacy directory-imported
      // links carry the dealer UUID in external_account_number instead.
      if (portalUserId) linksByPortalUserId.set(portalUserId, link);
      if (portalDealerId) linksByPortalDealerId.set(portalDealerId, link);
      if (extNum) linksByDealerId.set(extNum, link);
    }

    // Index existing accounts by id and by lowercased name for name-based review.
    const accountsById = new Map();
    const accountsByNormalisedName = new Map();
    for (const account of accountList) {
      accountsById.set(String(account.id), account);
      const name = String(account?.name || "").trim().toLowerCase();
      if (name) {
        if (!accountsByNormalisedName.has(name)) {
          accountsByNormalisedName.set(name, []);
        }
        accountsByNormalisedName.get(name).push(account);
      }
    }

    const exactMatches = [];
    const accountsNeedingLinking = [];
    const newAccounts = [];
    const ambiguous = [];

    const directoryDealerIds = new Set();
    const directoryPortalUserIds = new Set();

    for (const record of directory.records) {
      const dealerId = normaliseUuid(record.dealer_account_id);
      const portalUserId = normaliseUuid(record.portal_user_id);
      directoryDealerIds.add(dealerId);
      directoryPortalUserIds.add(portalUserId);

      const linkByPortalUser = linksByPortalUserId.get(portalUserId);
      const linkByPortalDealerId = linksByPortalDealerId.get(dealerId);
      const linkByDealerId = linksByDealerId.get(dealerId);
      const matchedLink = linkByPortalUser || linkByPortalDealerId || linkByDealerId || null;
      const matchedAccountId = matchedLink ? String(matchedLink.account_id || "") : "";
      const matchedAccount = matchedAccountId ? accountsById.get(matchedAccountId) : null;

      const nameMatches = accountsByNormalisedName.get(
        String(record.account_name || "").trim().toLowerCase(),
      ) || [];
      const hasNameMatch = nameMatches.length > 0;

      if (matchedAccount) {
        exactMatches.push({
          dealer_account_id: dealerId,
          portal_user_id: portalUserId,
          account_name: record.account_name,
          sector: record.sector,
          sound_proof_account_id: matchedAccount.id,
          sound_proof_account_name: matchedAccount.name,
          sound_proof_account_status: matchedAccount.status,
          linked_via: linkByPortalUser ? "portal_user_id" : linkByPortalDealerId ? "portal_dealer_account_id" : "dealer_account_id",
        });
      } else if (hasNameMatch) {
        // Name matches but no external link — needs identity linking.
        // Flag ambiguity if multiple accounts share the name.
        if (nameMatches.length === 1) {
          accountsNeedingLinking.push({
            dealer_account_id: dealerId,
            portal_user_id: portalUserId,
            account_name: record.account_name,
            sector: record.sector,
            candidate_sound_proof_account_id: nameMatches[0].id,
            candidate_sound_proof_account_name: nameMatches[0].name,
            candidate_sound_proof_account_status: nameMatches[0].status,
            reason: "Name matches an existing Sound Proof account but no external link exists.",
          });
        } else {
          ambiguous.push({
            dealer_account_id: dealerId,
            portal_user_id: portalUserId,
            account_name: record.account_name,
            sector: record.sector,
            reason: `Multiple Sound Proof accounts share the name "${record.account_name}" (${nameMatches.length}).`,
            candidates: nameMatches.map((a) => ({ id: a.id, name: a.name, status: a.status })),
          });
        }
      } else {
        newAccounts.push({
          dealer_account_id: dealerId,
          portal_user_id: portalUserId,
          account_name: record.account_name,
          sector: record.sector,
          status: record.status,
        });
      }
    }

    // Conflict detection: directory records that map to the same account via
    // different portal_user_ids, or a portal_user_id shared across accounts.
    const accountToPortalUser = new Map();
    for (const match of exactMatches) {
      const existing = accountToPortalUser.get(match.sound_proof_account_id);
      if (existing && existing !== match.portal_user_id) {
        ambiguous.push({
          dealer_account_id: match.dealer_account_id,
          portal_user_id: match.portal_user_id,
          account_name: match.account_name,
          sector: match.sector,
          reason: `Sound Proof account ${match.sound_proof_account_id} is linked to multiple portal_user_ids.`,
        });
      } else {
        accountToPortalUser.set(match.sound_proof_account_id, match.portal_user_id);
      }
    }

    // iCubed and Wakefields preservation checks.
    const icubedAccounts = accountList.filter((a) =>
      String(a?.name || "").toLowerCase().includes("icubed"),
    );
    const wakefieldsAccounts = accountList.filter((a) =>
      String(a?.name || "").toLowerCase().includes("wakefield"),
    );
    const icubedDirectoryMatches = directory.records.filter((r) =>
      String(r?.account_name || "").toLowerCase().includes("icubed"),
    );
    const wakefieldsDirectoryMatches = directory.records.filter((r) =>
      String(r?.account_name || "").toLowerCase().includes("wakefield"),
    );
    const icubedLinked = icubedAccounts.filter((a) => {
      const link = linkList.find((l) => l.account_id === a.id);
      return link && linksByPortalUserId.has(normaliseUuid(link.partner_user_id));
    });
    const wakefieldsLinked = wakefieldsAccounts.filter((a) => {
      const link = linkList.find((l) => l.account_id === a.id);
      return link && linksByPortalUserId.has(normaliseUuid(link.partner_user_id));
    });

    const preservation = {
      icubed: {
        existing_accounts: icubedAccounts.length,
        directory_matches: icubedDirectoryMatches.length,
        already_linked: icubedLinked.length,
        preserved: true,
        note: "No accounts created, modified, or relinked in this read-only pass.",
      },
      wakefields: {
        existing_accounts: wakefieldsAccounts.length,
        directory_matches: wakefieldsDirectoryMatches.length,
        already_linked: wakefieldsLinked.length,
        preserved: true,
        note: "No accounts created, modified, or relinked in this read-only pass.",
      },
    };

    const connectionPassed = validation.passed;
    const response = {
      connection: connectionPassed ? "PASS" : "FAIL",
      contract: {
        version: directory.contractVersion,
        expected_version: EXPECTED_CONTRACT_VERSION,
        status: directory.contractStatus,
        total_dealers: directory.records.length,
        expected_total: directory.pagination.sourceTotal,
        pagination_pages: directory.pagination.pages,
      },
      sector_totals: validation.sectors,
      validation: {
        passed: validation.passed,
        errors: validation.errors,
        warnings: validation.warnings,
        duplicate_dealer_account_ids: validation.duplicates.duplicate_dealer_account_ids,
        duplicate_portal_user_ids: validation.duplicates.duplicate_portal_user_ids,
        incomplete_samples: validation.incomplete,
      },
      matching_audit: {
        exact_matches: exactMatches.length,
        accounts_needing_linking: accountsNeedingLinking.length,
        new_accounts: newAccounts.length,
        ambiguous: ambiguous.length,
      },
      exact_matches: exactMatches.slice(0, 50),
      accounts_needing_linking: accountsNeedingLinking.slice(0, 50),
      new_accounts: newAccounts.slice(0, 50),
      ambiguous: ambiguous.slice(0, 50),
      preservation,
      recommended_import_procedure: [
        "1. Resolve every ambiguous match manually before any import.",
        "2. For accounts_needing_linking, create the missing ExternalAccountLink only (no access, no credits) after admin confirmation.",
        "3. For new_accounts, create the Account with status inactive and no membership, credits, or access — then create the ExternalAccountLink.",
        "4. Preserve iCubed and Wakefields by their existing external links; never relink by name alone.",
        "5. Default all newly mirrored accounts to NO access. Mirroring never grants access or credits.",
        "6. Do not import until separately authorised.",
      ],
      audit_only: auditOnly,
    };

    return Response.json(response, { status: connectionPassed ? 200 : 422 });
  } catch (error) {
    return Response.json({
      status: "FAILED",
      error: summariseError(error),
    }, { status: 500 });
  }
}