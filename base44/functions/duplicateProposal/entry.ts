import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

const TRANSIENT_METADATA_KEY = /(autosave|dirty|pending|save_status|unsaved|in_flight)/i;
const SAFE_PROPOSAL_METADATA_KEYS = ['audience', 'word_count', 'language', 'tone'];

export default async function(req) {
  let base44 = null;
  let duplicate = null;
  let duplicateSections = [];

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { source_proposal_id, request_id } = await req.json();
    if (!source_proposal_id || !request_id) {
      return Response.json({
        error: 'source_proposal_id and request_id are required.',
      }, { status: 400 });
    }

    const existing = await base44.entities.Proposal.filter({ creation_request_id: request_id });
    if (existing?.[0]) {
      const existingSections = await base44.entities.ProposalSection.filter({
        proposal_id: existing[0].id,
      });
      if (existing[0].parent_proposal_id === source_proposal_id && existingSections.length > 0) {
        return Response.json({
          proposal_id: existing[0].id,
          proposal: existing[0],
          section_count: existingSections.length,
          status: existing[0].status,
          idempotent_replay: true,
        });
      }
      return Response.json({
        error: 'This duplication request is already in progress or requires recovery.',
        proposal_id: existing[0].id,
      }, { status: 409 });
    }

    const sources = await base44.entities.Proposal.filter({ id: source_proposal_id });
    const source = sources?.[0];
    if (!source) return Response.json({ error: 'Source proposal not found.' }, { status: 404 });

    const sourceSections = await base44.entities.ProposalSection.filter({
      proposal_id: source_proposal_id,
    });
    if (!Array.isArray(sourceSections) || sourceSections.length === 0) {
      return Response.json({
        error: 'Source proposal has no sections to duplicate.',
      }, { status: 409 });
    }

    const sectionKeys = sourceSections.map((section) => section.section_key).filter(Boolean);
    if (new Set(sectionKeys).size !== sectionKeys.length) {
      return Response.json({
        error: 'Source proposal contains duplicate section keys and cannot be copied safely.',
      }, { status: 409 });
    }

    const proposalMetadata = sanitiseProposalMetadata(source.metadata);
    duplicate = await base44.entities.Proposal.create({
      project_id: source.project_id,
      account_id: source.account_id,
      creation_request_id: request_id,
      proposal_type: source.proposal_type || 'single',
      selected_version_ids: Array.isArray(source.selected_version_ids)
        ? [...source.selected_version_ids]
        : [],
      version_id: source.version_id || null,
      title: `Copy of ${source.title || 'Untitled Proposal'}`,
      status: 'draft',
      client_brief: source.client_brief || null,
      narrative_goal: source.narrative_goal || 'luxury_cinema',
      narrative_brief: source.narrative_brief || null,
      version_label: null,
      is_current_version: true,
      parent_proposal_id: source.id,
      template: source.template || null,
      engineering_snapshot: cloneValue(source.engineering_snapshot),
      ...(proposalMetadata ? { metadata: proposalMetadata } : {}),
    });

    const sectionCopies = [...sourceSections]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((section, index) => ({
        proposal_id: duplicate.id,
        account_id: source.account_id,
        section_type: section.section_type,
        section_key: section.section_key,
        title: section.title,
        body: section.body || '',
        dealer_notes: section.dealer_notes || '',
        order_index: Number.isFinite(section.order_index) ? section.order_index : index,
        is_enabled: section.is_enabled !== false,
        locked: false,
        metadata: sanitiseSectionMetadata(section.metadata),
      }));

    duplicateSections = await base44.entities.ProposalSection.bulkCreate(sectionCopies);
    if (!Array.isArray(duplicateSections) || duplicateSections.length !== sectionCopies.length) {
      throw new Error('Not all proposal sections were copied.');
    }

    if (source.is_current_version === true) {
      await base44.entities.Proposal.update(source.id, { is_current_version: false });
    }

    return Response.json({
      proposal_id: duplicate.id,
      proposal: duplicate,
      section_count: duplicateSections.length,
      status: 'draft',
      idempotent_replay: false,
    });
  } catch (error) {
    const cleanupSucceeded = duplicate?.id
      ? await rollbackDuplicate(base44, duplicate.id, duplicateSections)
      : true;
    return Response.json({
      error: error?.message || 'Proposal duplication failed.',
      cleanup_succeeded: cleanupSucceeded,
      proposal_id: cleanupSucceeded ? null : duplicate?.id || null,
    }, { status: 500 });
  }
}

function sanitiseProposalMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const clean = {};
  for (const key of SAFE_PROPOSAL_METADATA_KEYS) {
    if (metadata[key] !== undefined && metadata[key] !== null) clean[key] = cloneValue(metadata[key]);
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

function sanitiseSectionMetadata(value) {
  if (Array.isArray(value)) return value.map(sanitiseSectionMetadata);
  if (!value || typeof value !== 'object') return value ?? {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !TRANSIENT_METADATA_KEY.test(key))
      .map(([key, item]) => [key, sanitiseSectionMetadata(item)])
  );
}

function cloneValue(value) {
  if (value === undefined || value === null) return value ?? null;
  return structuredClone(value);
}

async function rollbackDuplicate(base44, proposalId, knownSections = []) {
  if (!base44 || !proposalId) return true;
  try {
    const discovered = await base44.entities.ProposalSection.filter({ proposal_id: proposalId });
    const sectionIds = [...new Set([
      ...knownSections.map((section) => section?.id),
      ...(discovered || []).map((section) => section?.id),
    ].filter(Boolean))];

    const sectionDeletes = await Promise.allSettled(
      sectionIds.map((sectionId) => base44.entities.ProposalSection.delete(sectionId))
    );
    if (!sectionDeletes.every((result) => result.status === 'fulfilled')) {
      await base44.entities.Proposal.update(proposalId, { status: 'draft' });
      return false;
    }

    await base44.entities.Proposal.delete(proposalId);
    return true;
  } catch {
    try {
      await base44.entities.Proposal.update(proposalId, { status: 'draft' });
    } catch {
      // Best effort: a remaining Draft card is safer than a misleading complete copy.
    }
    return false;
  }
}
