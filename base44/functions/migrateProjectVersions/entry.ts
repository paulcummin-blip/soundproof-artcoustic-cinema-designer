// base44/functions/migrateProjectVersions/entry.ts
//
// Ensures every project has a V1 ProjectVersion. Called lazily from the
// frontend when a project is loaded (single-project mode), or in batch by
// an admin (all unmigrated projects).
//
// Migration is LOSSLESS:
//   - All per-version design fields are copied byte-for-byte into design_state.
//   - No recalculation, optimisation, or regeneration occurs.
//   - The Project keeps shared fields and gains active_version_id.
//   - V1 looks as though it has always existed.
//
// Architecture:
//   Project = shared room and administrative metadata.
//   ProjectVersion = complete independent design state.
//   Project.active_version_id is the single source of truth.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

// Shared fields that stay on the Project entity (NOT moved to design_state).
const SHARED_PROJECT_FIELDS = new Set([
  // Administrative
  'name', 'client_name', 'project_status', 'notes',
  // Physical room
  'roomDims', 'room_length', 'room_width', 'room_height',
  'room_orientation', 'screen_wall', 'room_dimensions_edited',
  // Commercial / lifecycle
  'account_id', 'commercial_tier', 'lifecycle_status',
  'last_age_reviewed_at', 'professional_activated_date',
  'activation_ledger_entry_id', 'commercial_source', 'promotion_id',
  'metrics_last_opened', 'metrics_last_modified', 'metrics_session_count',
  'metrics_total_minutes_used', 'metrics_reports_generated',
  'metrics_bass_simulations_run', 'metrics_exports',
  // Versioning
  'active_version_id',
  // Built-in
  'id', 'created_date', 'updated_date', 'created_by_id',
]);

function buildDesignState(project) {
  const designState = {};
  for (const [key, value] of Object.entries(project)) {
    if (!SHARED_PROJECT_FIELDS.has(key)) {
      designState[key] = value;
    }
  }
  return designState;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, batch } = body;

    // Single-project migration (lazy, called from frontend)
    if (project_id) {
      const result = await migrateSingleProject(base44, project_id, user);
      return Response.json(result);
    }

    // Batch migration (admin only)
    if (batch) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
      }
      const result = await migrateBatch(base44);
      return Response.json(result);
    }

    return Response.json({ error: 'Missing project_id or batch flag' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function migrateSingleProject(base44, projectId, user) {
  // Load the project
  const projects = await base44.entities.Project.filter({ id: projectId });
  if (!projects || projects.length === 0) {
    return { migrated: false, reason: 'project_not_found' };
  }
  const project = projects[0];

  // Already migrated
  if (project.active_version_id) {
    // Verify the version exists
    const versions = await base44.entities.ProjectVersion.filter({
      id: project.active_version_id,
    });
    if (versions && versions.length > 0) {
      return { migrated: false, reason: 'already_migrated', version_id: project.active_version_id };
    }
    // active_version_id points to a missing version — re-migrate
  }

  // Check if a V1 version already exists for this project (race condition guard)
  const existingVersions = await base44.entities.ProjectVersion.filter({
    project_id: projectId,
    version_number: 1,
  });
  if (existingVersions && existingVersions.length > 0) {
    // Another tab already created V1 — just link it
    const v1 = existingVersions[0];
    await base44.entities.Project.update(projectId, { active_version_id: v1.id });
    return { migrated: false, reason: 'v1_already_exists', version_id: v1.id };
  }

  // Create V1 from the project's per-version fields
  const designState = buildDesignState(project);
  const accountId = project.account_id || user.data?.account_id || '';

  const version = await base44.entities.ProjectVersion.create({
    project_id: projectId,
    account_id: accountId,
    version_number: 1,
    version_name: 'Current Design',
    design_state: designState,
  });

  // Link the project to the new V1
  await base44.entities.Project.update(projectId, { active_version_id: version.id });

  return { migrated: true, version_id: version.id, version_number: 1 };
}

async function migrateBatch(base44) {
  // Load all projects without active_version_id
  // Use service role for admin batch operation
  const allProjects = await base44.asServiceRole.entities.Project.list('-created_date', 500);
  const unmigrated = allProjects.filter((p) => !p.active_version_id);

  let migrated = 0;
  let skipped = 0;
  const errors = [];

  for (const project of unmigrated) {
    try {
      // Check if V1 already exists
      const existing = await base44.asServiceRole.entities.ProjectVersion.filter({
        project_id: project.id,
        version_number: 1,
      });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.Project.update(project.id, {
          active_version_id: existing[0].id,
        });
        skipped++;
        continue;
      }

      const designState = buildDesignState(project);
      const version = await base44.asServiceRole.entities.ProjectVersion.create({
        project_id: project.id,
        account_id: project.account_id || '',
        version_number: 1,
        version_name: 'Current Design',
        design_state: designState,
      });
      await base44.asServiceRole.entities.Project.update(project.id, {
        active_version_id: version.id,
      });
      migrated++;
    } catch (err) {
      errors.push({ project_id: project.id, error: err.message });
    }
  }

  return {
    migrated,
    skipped,
    total_unmigrated: unmigrated.length,
    errors: errors.slice(0, 20),
  };
}