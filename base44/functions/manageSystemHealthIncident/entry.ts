import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

/**
 * Admin-only incident management for the Sound Proof System Health area.
 *
 * Actions:
 *   update_status — change an incident's lifecycle status (open, investigating,
 *                   resolved, dismissed). Recovery success is tracked separately
 *                   on the incident record and is not changed here.
 *   add_note      — append an admin investigation note to the incident.
 *
 * Only master admins may call this function. The incident's diagnostic summary
 * and references are never modified — only the status and notes.
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
    const { action, incident_id } = body;

    if (!incident_id) {
      return Response.json({ error: 'incident_id required.' }, { status: 400 });
    }

    if (action === 'update_status') {
      const { status } = body;
      if (!['open', 'investigating', 'resolved', 'dismissed'].includes(status)) {
        return Response.json({ error: 'status must be open, investigating, resolved or dismissed.' }, { status: 400 });
      }

      const incident = await base44.entities.SystemHealthIncident.get(incident_id).catch(() => null);
      if (!incident?.id) {
        return Response.json({ error: 'Incident not found.' }, { status: 404 });
      }

      await base44.entities.SystemHealthIncident.update(incident_id, {
        incident_status: status,
      });

      return Response.json({ ok: true, incident_id, incident_status: status });
    }

    if (action === 'add_note') {
      const { note } = body;
      if (typeof note !== 'string' || note.trim().length === 0) {
        return Response.json({ error: 'note must be a non-empty string.' }, { status: 400 });
      }

      const incident = await base44.entities.SystemHealthIncident.get(incident_id).catch(() => null);
      if (!incident?.id) {
        return Response.json({ error: 'Incident not found.' }, { status: 404 });
      }

      const existingNotes = incident.admin_notes || '';
      const timestamp = new Date().toISOString();
      const adminName = user.full_name || user.email || 'admin';
      const newEntry = `[${timestamp}] ${adminName}: ${note.trim()}`;
      const updatedNotes = existingNotes ? `${existingNotes}\n\n${newEntry}` : newEntry;

      await base44.entities.SystemHealthIncident.update(incident_id, {
        admin_notes: updatedNotes,
      });

      return Response.json({ ok: true, incident_id, admin_notes: updatedNotes });
    }

    return Response.json({ error: 'action must be update_status or add_note.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Incident management failed.' }, { status: 500 });
  }
}