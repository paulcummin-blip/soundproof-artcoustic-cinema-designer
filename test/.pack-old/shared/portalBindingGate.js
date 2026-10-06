/**
 * Launch binding gate.
 *
 * Classifies why a consumed Partner Portal binding was rejected, so every
 * rejection is recorded and reported with the exact gate that failed rather
 * than one generic reason. The pinned pilot subject and profile are the
 * comparison values: the binding must match them.
 *
 * Pure module — no I/O, no writes.
 */

import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
  PORTAL_TARGET,
} from './pilotPortalConstants.js';
import { hasText } from './portalPrimitives.js';

/**
 * @param {object|null} binding - the binding returned by the bridge
 * @returns {{event: string, reason: string, details?: object}|null} the failed
 *   gate, or null when the binding satisfies every gate.
 */
export function bindingGateFailure(binding) {
  if (!binding || typeof binding !== 'object') {
    return { event: 'BINDING_MISSING', reason: 'PORTAL_BINDING_MISSING' };
  }
  if (binding.target !== PORTAL_TARGET) {
    return {
      event: 'BINDING_TARGET_MISMATCH',
      reason: 'PORTAL_BINDING_TARGET_MISMATCH',
      details: {
        target_received: hasText(binding.target) ? binding.target : null,
        target_expected: PORTAL_TARGET,
        cause: 'Launch consumed by a different app or environment',
      },
    };
  }
  if (binding.user_id !== PILOT_EXTERNAL_SUBJECT) {
    return {
      event: 'BINDING_PORTAL_USER_MISMATCH',
      reason: 'PORTAL_BINDING_PORTAL_USER_MISMATCH',
      details: {
        portal_subject_expected: PILOT_EXTERNAL_SUBJECT,
        portal_subject_received: hasText(binding.user_id) ? binding.user_id : null,
        cause: 'Portal user mismatch',
      },
    };
  }
  if (!hasText(binding.session_id)) {
    return {
      event: 'BINDING_MISSING',
      reason: 'PORTAL_BINDING_SESSION_MISSING',
      details: { cause: 'Binding carries no live Portal session' },
    };
  }
  if (binding.profile_id !== PILOT_PARTNER_PROFILE_ID) {
    return {
      event: 'BINDING_PROFILE_MISMATCH',
      reason: 'PORTAL_BINDING_PROFILE_MISMATCH',
      details: {
        portal_profile_expected: PILOT_PARTNER_PROFILE_ID,
        portal_profile_received: hasText(binding.profile_id) ? binding.profile_id : null,
        cause: 'Portal profile mismatch',
      },
    };
  }
  if (!hasText(binding.account_name)) {
    return {
      event: 'BINDING_MISSING',
      reason: 'PORTAL_BINDING_ACCOUNT_NAME_MISSING',
      details: { cause: 'Binding carries no Portal account name' },
    };
  }
  if (!hasText(binding.expires_at)) {
    return {
      event: 'BINDING_MISSING',
      reason: 'PORTAL_BINDING_EXPIRY_MISSING',
      details: { cause: 'Binding carries no expiry' },
    };
  }
  if (!(Date.parse(binding.expires_at) > Date.now())) {
    return {
      event: 'BINDING_EXPIRED',
      reason: 'PORTAL_BINDING_EXPIRED',
      details: { binding_expired_at: binding.expires_at, cause: 'Binding expired' },
    };
  }
  return null;
}