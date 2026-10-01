/**
 * Shared Partner Portal pilot constants.
 *
 * Kept in a leaf module so the launch authority (portalSsoAuthority.js) and
 * the pilot seat claim authority (pilotSeatClaimAuthority.js) can both read
 * them without importing each other.
 */

export const PORTAL_SOURCE = 'ARTCOUSTIC_PARTNER_PORTAL';
export const PORTAL_TARGET = 'SOUND_PROOF';
export const PILOT_EXTERNAL_SUBJECT = 'b9d453e8-3386-4294-bd99-7ad2d80120b2';
export const PILOT_SOUND_PROOF_ACCOUNT_ID = '6a832be3d4e6c6df3df23ee3';
export const PILOT_PARTNER_PROFILE_ID = '42b93780-c13e-40c6-bac3-991c2bcfc938';
export const BRIDGE_URL_SECRET = 'PARTNER_PORTAL_BRIDGE_URL';