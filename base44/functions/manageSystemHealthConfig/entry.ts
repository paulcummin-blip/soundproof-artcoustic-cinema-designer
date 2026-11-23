import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

/**
 * Admin-only configuration for the Sound Proof System Health alert
 * recipients. Reads and updates the `system_health` field on the SystemConfig
 * singleton.
 *
 * Actions:
 *   get    — return the current alert configuration.
 *   update — update the alert recipients and enabled flag.
 *
 * Only master admins may call this function.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);
    if (!accessContext?.isMasterAdmin) {
      return Response.json({ error: 'Master admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action !== 'get' && action !== 'update') {
      return Response.json({ error: 'action must be get or update.' }, { status: 400 });
    }

    const result = await base44.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
    const configRecord = (Array.isArray(result) ? result : (result?.items || []))[0] || null;

    if (action === 'get') {
      const health = configRecord?.system_health || {};
      return Response.json({
        alerts_enabled: health.alerts_enabled === true,
        alert_recipients: Array.isArray(health.alert_recipients) ? health.alert_recipients : [],
        updated_at: health.updated_at || null,
        updated_by: health.updated_by || null,
      });
    }

    // action === 'update'
    const { alerts_enabled, alert_recipients } = body;

    if (typeof alerts_enabled !== 'boolean') {
      return Response.json({ error: 'alerts_enabled must be a boolean.' }, { status: 400 });
    }
    if (!Array.isArray(alert_recipients)) {
      return Response.json({ error: 'alert_recipients must be an array of email addresses.' }, { status: 400 });
    }

    // Validate each recipient is a non-empty string.
    const validRecipients = alert_recipients
      .map((r) => String(r || '').trim())
      .filter((r) => r.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));

    const now = new Date().toISOString();
    const updatedBy = user.full_name || user.email || 'admin';

    if (configRecord) {
      await base44.asServiceRole.entities.SystemConfig.update(configRecord.id, {
        system_health: {
          alerts_enabled,
          alert_recipients: validRecipients,
          updated_at: now,
          updated_by: updatedBy,
        },
      });
    } else {
      // Create the singleton if it doesn't exist.
      await base44.asServiceRole.entities.SystemConfig.create({
        system_health: {
          alerts_enabled,
          alert_recipients: validRecipients,
          updated_at: now,
          updated_by: updatedBy,
        },
      });
    }

    return Response.json({
      ok: true,
      alerts_enabled,
      alert_recipients: validRecipients,
      updated_at: now,
      updated_by: updatedBy,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Configuration update failed.' }, { status: 500 });
  }
}