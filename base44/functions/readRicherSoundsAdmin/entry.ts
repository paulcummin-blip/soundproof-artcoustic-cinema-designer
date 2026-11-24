import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  resolveRicherSoundsAdminContext,
  assembleRicherSoundsAdminData,
} from '../../shared/richerSoundsAdminAuthority.js';

/**
 * readRicherSoundsAdmin — read-only delegated administration payload.
 *
 * Admits Sound Proof master admins and active members of the Custom Install
 * - 93 master account (richerSoundsAdmin capability). Returns all Richer
 * Sounds accounts with eligibility, activation, users, credits, projects and
 * recent activity, plus the credit-transfer history. No writes.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me().catch((e) =>
      e?.status === 401 ? null : Promise.reject(e),
    );
    if (!sessionUser) {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const ctx = await resolveRicherSoundsAdminContext(base44, sessionUser);
    if (!ctx.allowed) {
      return Response.json({ error: ctx.reason || 'FORBIDDEN' }, { status: 403 });
    }

    const service = base44.asServiceRole;
    const data = await assembleRicherSoundsAdminData(service, ctx.masterAccountId);

    return Response.json({
      ...data,
      actor: {
        is_master_admin: ctx.isMasterAdmin,
        account_id: ctx.actorAccountId,
        email: ctx.actorUser?.email || null,
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'RICHER_SOUNDS_ADMIN_READ_FAILED', message: error?.message || 'Unable to load.' },
      { status: 500 },
    );
  }
}