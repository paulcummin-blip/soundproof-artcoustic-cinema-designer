import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import { consumePilotPortalLaunch, PORTAL_TARGET } from '../../shared/portalSsoAuthority.js';

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

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return json(401, { ok: false });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false });
    }
    if (!validLaunchPass(body.launch_pass)) return json(400, { ok: false });
    if (body.target !== undefined && body.target !== PORTAL_TARGET) {
      return json(403, { ok: false });
    }

    const result = await consumePilotPortalLaunch(base44, user, body.launch_pass);
    return json(200, result);
  } catch (error) {
    const reason = String(error?.message || 'PORTAL_LAUNCH_REJECTED');
    const assignmentRequired = reason === 'PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED';
    return json(assignmentRequired ? 409 : 403, {
      ok: false,
      reason,
    });
  }
});
