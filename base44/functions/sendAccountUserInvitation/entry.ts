import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Internal invitation transport.
 *
 * This function is invoked with service-role authentication only after
 * manageAccountUsers has authorised the tenant, actor, seat limit and role.
 * Direct calls from dealer users fail because they do not hold Base44's
 * built-in platform admin role.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Invalid email' }, { status: 400 });
    }

    await base44.users.inviteUser(email, 'user');
    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({
      error: 'Invitation failed',
      message: error?.message || 'Unable to send invitation.',
    }, { status: 502 });
  }
}
