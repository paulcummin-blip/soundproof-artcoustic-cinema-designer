import { contextRevision, persistedContextContains, readContextRecord } from '../../shared/designContext/designContextPersistence.js';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import {
  normaliseContextItems,
  normaliseProjectContext,
  mergeContextItems,
  buildContextRecord,
} from '../../shared/designContext/designContextModel.js';

/**
 * Save the designer's design context for a project version.
 *
 * Only answered items and explicit no-reason confirmations are persisted.
 * Skipped questions are never stored, so they may be asked again on a future
 * generation. New items are merged with existing items: an item with the same
 * question_id replaces the old one, and items not re-asked are preserved.
 *
 * The record is upserted: one DesignContext record per project_id + version_id.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, version_id, context_items, project_context } = body || {};
    if (!project_id || !version_id) {
      return Response.json({ error: 'project_id and version_id are required.' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.allowed !== true || accessContext?.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required.' }, { status: 403 });
    }

    const project = await base44.entities.Project.get(project_id).catch(() => null);
    if (!project?.id) return Response.json({ error: 'That project was not found.' }, { status: 404 });

    const version = await base44.entities.ProjectVersion.get(version_id).catch(() => null);
    if (!version?.id || String(version.project_id || '') !== String(project_id)) {
      return Response.json({ error: 'That design version is not part of this project.' }, { status: 404 });
    }

    const accountId = project.account_id || accessContext.user?.account_id || accessContext.account?.id || null;
    if (!accountId) {
      return Response.json({ error: 'The project has no account and its context cannot be saved.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const incomingItems = normaliseContextItems(context_items, { user, now });
    // The optional free-text Project Context is normalised once and persisted
    // alongside the items. It never overwrites or discards existing answers.
    const incomingProjectContext = normaliseProjectContext(project_context);

    // Read the existing record, if any.
    const existing = await readContextRecord(base44.entities, project_id, version_id);
    const existingItems = Array.isArray(existing?.context_items) ? existing.context_items : [];

    // Merge: new items replace existing ones with the same question_id;
    // items not re-asked are preserved.
    const mergedItems = mergeContextItems(existingItems, incomingItems);

    const recordBody = buildContextRecord({
      projectId: project_id,
      versionId: version_id,
      accountId,
      items: mergedItems,
      projectContext: incomingProjectContext,
      now,
      user,
    });

    let saved;
    if (existing?.id) {
      saved = await base44.entities.DesignContext.update(existing.id, {
        context_items: mergedItems,
        project_context: incomingProjectContext,
        updated_at: now,
        updated_by: user?.full_name || user?.email || null,
      });
    } else {
      saved = await base44.entities.DesignContext.create(recordBody);
    }

    if (!saved?.id || saved?.ok === false || saved?.success === false) {
      return Response.json({ ok:false, saved:false, error:'Saving your answers was unsuccessful. Please retry saving.' }, { status:409 });
    }
    const confirmed = await readContextRecord(base44.entities, project_id, version_id);
    const confirmedProjectContext = normaliseProjectContext(confirmed?.project_context);
    if (!confirmed || confirmed.updated_at !== now || !persistedContextContains(confirmed, mergedItems)
      || confirmedProjectContext !== incomingProjectContext) {
      return Response.json({ ok: false, saved: false, error: 'Your answers could not be verified after saving. Please retry saving.' }, { status: 409 });
    }
    return Response.json({
      ok: true,
      saved: true,
      verified: true,
      context_revision: contextRevision(confirmed),
      record_id: saved?.id || existing?.id || null,
      item_count: mergedItems.length,
      project_context: confirmedProjectContext,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The design context could not be saved.' }, { status: 500 });
  }
}