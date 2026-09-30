/**
 * Project identity display authority
 * ----------------------------------
 * The single place that decides how a project's identity is presented. Every
 * surface that describes a project (Projects card, Active Project sidebar,
 * Room Designer header) reads its labels from here, so they can never disagree.
 *
 * Product rule: those three surfaces surface the project, the client and the
 * project reference only. Dealer identity belongs elsewhere (dealer branding,
 * the Partner Portal) and is not shown in this block.
 *
 * Authoritative sources (traced 2026-09-30, Marquee Home):
 *   project name       → Project.name
 *   client name        → Project.client_name
 *   project reference  → Project.project_reference
 *   dealer name        → Project.dealer_name (stamped from the Partner Portal
 *                        dealer identity at project creation). When it is not
 *                        stamped, the owning Account's name is used only if that
 *                        account is a dealer identity account — Sound Proof's own
 *                        admin/internal accounts are platform identities and
 *                        must never be presented as a dealer. Retained for the
 *                        dealer surfaces; not displayed by ProjectIdentityLine.
 *   version name       → ProjectVersion.version_name (active version)
 *
 * Pure module: no React, no I/O, no storage.
 */

import { isDealerIdentityAccount, resolveDealerIdentityName } from "@/components/account/dealerIdentityDisplay";

export const DEALER_NOT_ASSIGNED = "Not assigned";
export const IDENTITY_NOT_SPECIFIED = "Not specified";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve the dealer identity shown for a project.
 *
 * @param {object} source
 * @param {string|null} source.dealerName - Project.dealer_name
 * @param {object|null} source.account - the Account that owns the project
 * @returns {{name: string, source: string|null, missing: boolean}}
 *   source is "project" (stamped dealer name) or "account" (owning dealer
 *   account), and null when no dealer identity is available.
 */
export function resolveDealerIdentity({ dealerName = null, account = null } = {}) {
  const stamped = clean(dealerName);
  if (stamped) return { name: stamped, source: "project", missing: false };

  if (isDealerIdentityAccount(account)) {
    const fromAccount = resolveDealerIdentityName(account, null);
    if (fromAccount) return { name: fromAccount, source: "account", missing: false };
  }

  return { name: DEALER_NOT_ASSIGNED, source: null, missing: true };
}

/**
 * Resolve every identity label shown for a project.
 *
 * @returns {{
 *   project: string|null, client: string, reference: string,
 *   hasReference: boolean, dealer: string, dealerSource: string|null,
 *   dealerMissing: boolean, version: string|null
 * }}
 */
export function resolveIdentityFields({
  projectName = null,
  client = null,
  reference = null,
  dealerName = null,
  account = null,
  versionName = null,
} = {}) {
  const referenceValue = clean(reference);
  const dealer = resolveDealerIdentity({ dealerName, account });

  return {
    project: clean(projectName) || null,
    client: clean(client) || IDENTITY_NOT_SPECIFIED,
    reference: referenceValue || IDENTITY_NOT_SPECIFIED,
    hasReference: Boolean(referenceValue),
    dealer: dealer.name,
    dealerSource: dealer.source,
    dealerMissing: dealer.missing,
    version: clean(versionName) || null,
  };
}