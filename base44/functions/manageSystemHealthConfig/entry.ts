import { loadOwnedProject, loadOwnedProjectVersion } from "../../shared/publishedEngineeringRead.js";
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { recordSystemIncident } from '../../shared/systemHealth/incidentRecorder.js';
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

    if (!['get', 'update', 'test'].includes(action)) {
      return Response.json({ error: 'action must be get, update or test.' }, { status: 400 });
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

    if (action === 'test') {
      const health = configRecord?.system_health || {};
      if (health.alerts_enabled !== true || !health.alert_recipients?.length) {
        return Response.json({ error: 'Save enabled alerts and at least one recipient before testing.' }, { status: 400 });
      }
      // One open test incident per five-minute window prevents repeated clicks
      // from flooding recipients. Use only the saved configuration.
      let projectId=null,versionId=null,accountId=null;
      if (/^[a-f0-9]{24}$/.test(String(body.project_id || ''))) {
        const owned = body.version_id
          ? await loadOwnedProjectVersion(base44.asServiceRole,body.project_id,body.version_id,accessContext)
          : await loadOwnedProject(base44.asServiceRole,body.project_id,accessContext);
        projectId=owned.project.id;versionId=owned.version?.id || owned.project.active_version_id || null;
        accountId=owned.projectAccountId;
      }
      const scope = `alert-test:${projectId || 'admin'}:${Math.floor(Date.now() / 300000)}`;
      const result = await recordSystemIncident(base44, {
        component: 'alert_delivery_test', operation: 'controlled_alert_test',
        account_id:accountId, project_id:projectId, version_id:versionId, page_path:'/admin/system-health',
        error_code: 'CONTROLLED_ALERT_TEST', severity: 'high',
        grouping_scope: scope, test_run_id: scope,
        diagnostic_summary: 'CONTROLLED TEST requested by a master administrator. This checks the existing incident dashboard and email alert path. No dealer failure occurred and no project was changed.',
        data_committed: false, data_integrity_summary: 'No project or engineering data changed.',
      });
      return Response.json(result || { recorded: false, notification_status: 'failed' });
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
    console.error('[manageSystemHealthConfig] error:', error?.message || error, error?.stack || '');
    return Response.json({
      error: error?.message || 'Configuration update failed.',
      detail: error?.stack || null,
    }, { status: 500 });
  }
}