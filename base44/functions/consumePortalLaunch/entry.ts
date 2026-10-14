import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import { consumePilotPortalLaunch, PORTAL_TARGET } from '../../shared/portalSsoAuthority.js';
import { associateDealerIdentityCore } from '../../shared/dealerIdentityAssociation.js';
import {
  PORTAL_LAUNCH_DIAGNOSTIC_EVENTS,
  PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES,
  recordPortalLaunchDiagnostic,
} from '../../shared/portalLaunchDiagnostics.js';
import {
  PILOT_EXTERNAL_SUBJECT,
  PILOT_PARTNER_PROFILE_ID,
} from '../../shared/pilotPortalConstants.js';

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });

const validLaunchPass = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length === 43
  && /^[A-Za-z0-9_-]+$/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false });

  // Held outside the try so a rejection can always be recorded against the
  // launch that caused it, whichever gate rejected it.
  let service: any = null;
  let user: any = null;
  let launchPass: any = null;

  try {
    const base44 = createClientFromRequest(req);
    service = base44.asServiceRole;
    user = await base44.auth.me();
    if (!user?.id) return json(401, { ok: false });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false });
    }
    launchPass = body.launch_pass;
    if (!validLaunchPass(launchPass)) {
      await recordPortalLaunchDiagnostic(service, {
        event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.LAUNCH_REJECTED,
        outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
        reason: 'LAUNCH_PASS_INVALID',
        base44User: user,
        launchPass,
        failureReason: 'LAUNCH_PASS_INVALID',
        details: { stage: 'request_validation', launch_pass_valid: false },
      });
      return json(400, { ok: false, reason: 'LAUNCH_PASS_INVALID' });
    }
    if (body.target !== undefined && body.target !== PORTAL_TARGET) {
      await recordPortalLaunchDiagnostic(service, {
        event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.LAUNCH_REJECTED,
        outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
        reason: 'PORTAL_TARGET_MISMATCH',
        base44User: user,
        launchPass,
        expectedSubject: PILOT_EXTERNAL_SUBJECT,
        expectedProfileId: PILOT_PARTNER_PROFILE_ID,
        failureReason: 'PORTAL_TARGET_MISMATCH',
        details: {
          stage: 'request_validation',
          target_received: String(body.target),
          target_expected: PORTAL_TARGET,
        },
      });
      return json(403, { ok: false, reason: 'PORTAL_TARGET_MISMATCH' });
    }

    const result = await consumePilotPortalLaunch(base44, user, launchPass, {
      associateDealerIdentity: () => associateDealerIdentityCore(base44, user.id),
    });

    return json(200, result);
  } catch (error) {
    const reason = String(error?.message || 'PORTAL_LAUNCH_REJECTED');
    const assignmentRequired = reason === 'PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED';
    // Terminal marker for this launch. The binding path records the exact gate
    // it stopped at; this row states the reason the launch ended with.
    if (service && user?.id) {
      await recordPortalLaunchDiagnostic(service, {
        event: PORTAL_LAUNCH_DIAGNOSTIC_EVENTS.LAUNCH_REJECTED,
        outcome: PORTAL_LAUNCH_DIAGNOSTIC_OUTCOMES.FAILURE,
        reason,
        base44User: user,
        launchPass,
        expectedSubject: PILOT_EXTERNAL_SUBJECT,
        expectedProfileId: PILOT_PARTNER_PROFILE_ID,
        failureReason: reason,
        details: { stage: 'launch_rejected', assignment_required: assignmentRequired },
      });
    }
    return json(assignmentRequired ? 409 : 403, {
      ok: false,
      reason,
    });
  }
});