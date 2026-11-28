// rsApproval.js — frontend mirror of the Richer Sounds internal approval
// dimension introduced by RS-01. Pure derivation; no writes. The backend
// authority (base44/shared/rsApprovalAuthority.js) is the single source of
// truth for enforcement; this module only derives display state for the admin
// tables and drawers from records the page has already fetched.
//
// Custom Install - 93 is identified dynamically as the RICHER_SOUNDS account
// whose active Partner Portal link carries trading number "93" with a stamped
// portal_dealer_account_id — the same resolution the backend uses.

export const RS_APPROVAL_STATES = Object.freeze({
  AWAITING: "awaiting_approval",
  APPROVED: "approved",
  SUSPENDED: "suspended",
});

export const RICHER_SOUNDS_DEALER_GROUP = "RICHER_SOUNDS";
export const RICHER_SOUNDS_MASTER_TRADING_NUMBER = "93";
export const PORTAL_SOURCE_SYSTEM = "ARTCOUSTIC_PARTNER_PORTAL";

function normalise(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (candidate === RS_APPROVAL_STATES.APPROVED) return RS_APPROVAL_STATES.APPROVED;
  if (candidate === RS_APPROVAL_STATES.SUSPENDED) return RS_APPROVAL_STATES.SUSPENDED;
  return RS_APPROVAL_STATES.AWAITING;
}

/**
 * Resolve the Custom Install - 93 master account id from the fetched accounts
 * and their active Partner Portal links. Returns the account id or null.
 * Mirrors resolveRicherSoundsMasterAccount on the backend.
 */
export function resolveRicherSoundsMasterAccountId(accounts, linksByAccount) {
  const list = Array.isArray(accounts) ? accounts : [];
  for (const account of list) {
    if (account?.dealer_group !== RICHER_SOUNDS_DEALER_GROUP) continue;
    const links = linksByAccount?.get(account.id) || [];
    const isMaster = (Array.isArray(links) ? links : []).some(
      (link) =>
        link?.active !== false &&
        link?.source_system === PORTAL_SOURCE_SYSTEM &&
        String(link?.external_account_number || "").trim() ===
          RICHER_SOUNDS_MASTER_TRADING_NUMBER &&
        Boolean(String(link?.portal_dealer_account_id || "").trim()),
    );
    if (isMaster) return account.id;
  }
  return null;
}

export function isRicherSoundsCentralAdministrator(accountId, masterAccountId) {
  return Boolean(masterAccountId) && Boolean(accountId) && String(accountId) === String(masterAccountId);
}

export function isOrdinaryRicherSoundsStore(account, masterAccountId) {
  if (!account) return false;
  if (account.dealer_group !== RICHER_SOUNDS_DEALER_GROUP) return false;
  return !isRicherSoundsCentralAdministrator(account.id, masterAccountId);
}

/**
 * Derive the RS approval display state for a row. Returns { label, tone, status }
 * or null when the account is not an ordinary RS store (93 and non-RS groups
 * carry no RS approval badge).
 */
export function rsApprovalState(account, masterAccountId) {
  if (!isOrdinaryRicherSoundsStore(account, masterAccountId)) return null;
  const status = normalise(account?.rs_approval_status);
  if (status === RS_APPROVAL_STATES.APPROVED) {
    return { label: "RS Approved", tone: "ok", status };
  }
  if (status === RS_APPROVAL_STATES.SUSPENDED) {
    return { label: "RS Suspended", tone: "danger", status };
  }
  return { label: "RS Awaiting Approval", tone: "warn", status };
}