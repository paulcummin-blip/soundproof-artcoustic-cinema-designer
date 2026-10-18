import { describe, it, expect } from 'vitest';

import { persistAdiProposalSectionRevision } from '../base44/shared/proposalEdit/persistAdiProposalSectionRevision.js';
import { resolveEditorLayer } from '../base44/shared/proposalEdit/proposalEditEditorModel.js';
import {
  composeWriterSectionBodies,
  writerDraftsFromProposalSectionBody,
} from '../base44/shared/proposalWriter/writerSectionMapping.js';
import {
  changedParameterSections,
  editWorld,
  sectionsOf,
  toneSections,
} from './fixtures/proposalEditFixtures.mjs';

const NOW = '2026-10-18T19:05:00.000Z';

function proposalStore({ generation, writerSections }) {
  const edits = [];
  const creates = [];
  const updates = [];
  let page = composeWriterSectionBodies({
    output: { sections: writerSections },
    mode: 'comparison',
  }).bodies.map((body, index) => ({
    id: `section_${index + 1}`,
    proposal_id: generation.proposal_id,
    section_type: body.section_type,
    title: body.section_type,
    body: body.html,
    last_gpt_generated_at: '2026-10-18T18:00:00.000Z',
    last_user_edited_at: null,
    metadata: {
      approval: {
        status: 'approved',
        fingerprint: 'historical',
      },
    },
  }));

  const entities = {
    ProposalGeneration: {
      filter: async ({ proposal_id }) => (
        proposal_id === generation.proposal_id ? [generation] : []
      ),
    },
    ProposalEdit: {
      filter: async ({ generation_id }) => (
        generation_id === generation.generation_id ? [...edits] : []
      ),
      create: async (record) => {
        creates.push(record);
        edits.push(record);
        return record;
      },
    },
    ProposalSection: {
      filter: async (query) => {
        if (query?.id) return page.filter((row) => row.id === query.id);
        if (query?.proposal_id) return page.filter((row) => row.proposal_id === query.proposal_id);
        return [];
      },
      update: async (id, patch) => {
        const index = page.findIndex((row) => row.id === id);
        page[index] = { ...page[index], ...patch };
        updates.push({ id, patch });
        return page[index];
      },
    },
  };

  return {
    entities,
    edits,
    creates,
    updates,
    page: () => page,
  };
}

describe('accepted ADI proposal wording uses the proposal revision authority', () => {
  it('recovers the opening writer sections without changing their ownership', () => {
    const { input } = editWorld();
    const edited = toneSections(input);
    const body = composeWriterSectionBodies({
      output: { sections: edited },
      mode: 'comparison',
    }).bodies.find((row) => row.section_type === 'system_design_summary').html;

    const drafts = writerDraftsFromProposalSectionBody({
      sectionType: 'system_design_summary',
      body,
      mode: 'comparison',
    });

    expect(drafts.decision_summary).toBe(
      edited.find((row) => row.section === 'decision_summary').text,
    );
    expect(drafts.what_stays_same).toBe(
      edited.find((row) => row.section === 'what_stays_same').text,
    );
    expect(drafts.what_changes).toBe(
      edited.find((row) => row.section === 'what_changes').text,
    );
  });

  it('appends one validated edit and hands that exact copy to the page', async () => {
    const { input, generation } = editWorld();
    const original = sectionsOf(input);
    const improved = toneSections(input);
    const store = proposalStore({ generation, writerSections: original });
    const target = store.page().find((row) => row.section_type === 'system_design_summary');
    const improvedBody = composeWriterSectionBodies({
      output: { sections: improved },
      mode: 'comparison',
    }).bodies.find((row) => row.section_type === 'system_design_summary').html;
    const marker = {
      previous_body: target.body,
      improved_at: NOW,
      source_fingerprint: 'source',
      improved_fingerprint: 'improved',
    };

    const result = await persistAdiProposalSectionRevision({
      entities: store.entities,
      proposalId: generation.proposal_id,
      section: target,
      body: improvedBody,
      sectionPatch: {
        body: improvedBody,
        last_gpt_generated_at: NOW,
        metadata: { ...target.metadata, adi_editorial: marker },
      },
      user: { email: 'designer@example.com' },
      now: NOW,
    });

    expect(result.accepted).toBe(true);
    expect(store.creates).toHaveLength(1);
    expect(store.creates[0].validation_status).toBe('valid');

    const current = resolveEditorLayer({
      generationRecords: [generation],
      editRecords: store.edits,
      proposalId: generation.proposal_id,
    });
    const published = composeWriterSectionBodies({
      output: { sections: current.export_sections },
      mode: 'comparison',
    }).bodies;
    const publishedTarget = published.find((row) => row.section_type === 'system_design_summary');
    const storedTarget = store.page().find((row) => row.section_type === 'system_design_summary');

    expect(storedTarget.body).toBe(publishedTarget.html);
    expect(storedTarget.body).toBe(improvedBody);
    expect(storedTarget.last_gpt_generated_at).toBe(NOW);
    expect(storedTarget.last_user_edited_at).toBeNull();
    expect(storedTarget.metadata.adi_editorial).toEqual(marker);
    expect(storedTarget.metadata.publication_revision.edit_id).toBe(store.creates[0].edit_id);

    const unchanged = store.page().find((row) => row.section_type === 'spatial_resolution');
    expect(unchanged.last_gpt_generated_at).toBe('2026-10-18T18:00:00.000Z');
    expect(unchanged.last_user_edited_at).toBeNull();
    expect(unchanged.metadata.publication_revision.edit_id).toBe(store.creates[0].edit_id);
  });

  it('writes nothing when the frozen writer contract rejects the candidate', async () => {
    const { input, generation } = editWorld();
    const original = sectionsOf(input);
    const invalid = changedParameterSections(input, 'P12');
    const store = proposalStore({ generation, writerSections: original });
    const target = store.page().find((row) => row.section_type === 'key_performance_highlights');
    const invalidBody = composeWriterSectionBodies({
      output: { sections: invalid },
      mode: 'comparison',
    }).bodies.find((row) => row.section_type === 'key_performance_highlights').html;

    const result = await persistAdiProposalSectionRevision({
      entities: store.entities,
      proposalId: generation.proposal_id,
      section: target,
      body: invalidBody,
      sectionPatch: {
        body: invalidBody,
        last_gpt_generated_at: NOW,
        metadata: { ...target.metadata, adi_editorial: { previous_body: target.body } },
      },
      user: { email: 'designer@example.com' },
      now: NOW,
    });

    expect(result.accepted).toBe(false);
    expect(result.violations.some((entry) => entry.code === 'changed_parameter_value')).toBe(true);
    expect(store.creates).toHaveLength(0);
    expect(store.updates).toHaveLength(0);
    expect(store.page().find((row) => row.id === target.id).body).toBe(target.body);
  });
});
