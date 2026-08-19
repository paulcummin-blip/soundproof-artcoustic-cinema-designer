import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';

const ALLOWED_STATUSES = new Set(['uncalculated', 'updating', 'complete']);

function cleanRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    project_id: record.project_id,
    current_fingerprint: record.current_fingerprint || null,
    status: record.status || 'uncalculated',
    completed_by_fingerprint:
      record.completed_by_fingerprint && typeof record.completed_by_fingerprint === 'object'
        ? record.completed_by_fingerprint
        : {},
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me();
    if (!sessionUser) {
      return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const access = await resolveAccountAccess(base44, sessionUser);
    try {
      assertCapability(access, 'soundProof');
    } catch {
      return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const action = String(body?.action || '').trim().toLowerCase();
    const projectId = String(body?.project_id || '').trim();
    if (!projectId || !['load', 'save'].includes(action)) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const service = base44.asServiceRole;
    const projects = await service.entities.Project.filter({ id: projectId });
    const project = Array.isArray(projects) ? projects[0] : null;
    if (!project) {
      return Response.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

    const projectAccountId = String(project.account_id || '').trim();
    const userAccountId = String(access?.user?.account_id || '').trim();
    if (!access.isMasterAdmin && (!projectAccountId || projectAccountId !== userAccountId)) {
      return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const rows = await service.entities.ProjectAnalysisCache.filter(
      { project_id: projectId },
      '-updated_date',
      1,
    );
    let record = Array.isArray(rows) ? rows[0] : null;

    if (action === 'load') {
      return Response.json({ record: cleanRecord(record) });
    }

    const input = body?.payload && typeof body.payload === 'object' ? body.payload : {};
    const status = String(input.status || 'uncalculated');
    if (!ALLOWED_STATUSES.has(status)) {
      return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    const payload = {
      project_id: projectId,
      current_fingerprint:
        input.current_fingerprint == null ? null : String(input.current_fingerprint),
      status,
      completed_by_fingerprint:
        input.completed_by_fingerprint && typeof input.completed_by_fingerprint === 'object'
          ? input.completed_by_fingerprint
          : {},
    };

    record = record?.id
      ? await service.entities.ProjectAnalysisCache.update(record.id, payload)
      : await service.entities.ProjectAnalysisCache.create(payload);

    return Response.json({ record: cleanRecord(record) });
  } catch (error) {
    return Response.json({
      error: 'CACHE_OPERATION_FAILED',
      message: error?.message || 'Unable to access project analysis cache.',
    }, { status: 500 });
  }
}
