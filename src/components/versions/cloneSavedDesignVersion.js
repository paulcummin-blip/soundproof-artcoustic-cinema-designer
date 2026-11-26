import { neutraliseDesignStateForNewVersion } from '@/components/utils/subwooferNeutralTuning';
import { stableStringify } from '@/components/proposal/engineeringAuthority/engineeringFingerprint';

// Reuse the existing version records and writes. Never clone a menu's cached row.
export async function cloneSavedDesignVersion({ client, projectId, sourceVersionId, slot, name, assertScope = () => {} }) {
  assertScope();
  const projects = await client.entities.Project.filter({ id: projectId });
  const project = projects?.[0];
  if (!project || project.id !== projectId || !project.account_id) throw new Error('The source project could not be confirmed.');
  const sourceId = sourceVersionId || project.active_version_id;
  if (!sourceId) throw new Error('No saved source version is selected.');
  const matches = await client.entities.ProjectVersion.filter({ id: sourceId, project_id: projectId });
  const source = matches?.[0];
  if (matches?.length !== 1 || source.id !== sourceId || source.project_id !== projectId || source.account_id !== project.account_id || !source.design_state || typeof source.design_state !== 'object') {
    throw new Error('The source design does not match this project and account. No option was created.');
  }
  const occupied = await client.entities.ProjectVersion.filter({ project_id: projectId, version_number: slot });
  if (occupied?.length) throw new Error('This design option slot is already occupied. Reopen the version menu before trying again.');
  const original = JSON.parse(JSON.stringify(source.design_state));
  const design = neutraliseDesignStateForNewVersion(original);
  // A duplicate preserves actual tuning inputs. Version-specific optimisation
  // results/publications are still not transferred or relabelled.
  if ('subwooferInstances' in original) design.subwooferInstances = original.subwooferInstances;
  if ('applied_calibration' in original) design.applied_calibration = original.applied_calibration;
  assertScope();
  const created = await client.entities.ProjectVersion.create({
    project_id: projectId, account_id: project.account_id, version_number: slot,
    version_name: name, design_state: design,
  });
  if (!created?.id) throw new Error('The new option could not be confirmed. Reopen the version menu before retrying.');
  const saved = await client.entities.ProjectVersion.filter({ id: created.id, project_id: projectId });
  const verified = saved?.[0];
  if (saved?.length !== 1 || verified.id !== created.id || verified.project_id !== projectId || verified.account_id !== project.account_id || stableStringify(verified.design_state) !== stableStringify(design)) {
    throw new Error('The new option was created but its saved design could not be verified. Your source remains open; check the version menu before retrying.');
  }
  assertScope();
  await client.entities.Project.update(projectId, { active_version_id: created.id });
  return verified;
}
