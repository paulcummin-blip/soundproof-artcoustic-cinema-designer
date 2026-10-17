/**
 * design-intent-preview-read-only.test.mjs
 * ----------------------------------------
 * THE ADMIN DESIGN INTENT PREVIEW CANNOT WRITE — proven, not asserted.
 *
 * It is proven twice over, because either proof alone can be defeated by a future
 * edit that looks innocent:
 *
 *   STRUCTURALLY. The preview's own source is read as text and must reference NO
 *   entity mutation API at all — no create, no update, no delete, in any of their
 *   SDK spellings — and it must import the pure generation core and nothing that can
 *   persist. The production save wrapper, which is the only module in the path that
 *   may write, must not be on its import list.
 *
 *   BEHAVIOURALLY. The whole core is then RUN, with a real writer input, a real
 *   evidence pack, a real validator and a provider draft the validator genuinely
 *   accepts — against an in-memory entity store that really does mutate when it is
 *   asked to. The store is serialised before and after and must be identical
 *   bit-for-bit, and the mutation counts must be CREATE 0, UPDATE 0, DELETE 0.
 *
 * The same store then proves the SAVE still works: through the production save
 * wrapper exactly one write happens, to exactly one record, and a refused attempt
 * writes nothing at all.
 *
 * No provider call is made: the provider and the clock are injected.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { MARQUEE_GENERATED_AT, marqueeVersion } from './fixtures/marqueeOriginalGuardFixture.mjs';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import {
  WRITER_CONTRACT_VERSION,
  WRITER_PROMPT_VERSION,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildReportDesignIntentAttempt } from '../base44/shared/reportDesignIntent/buildReportDesignIntentAttempt.js';
import { generateAndSaveReportDesignIntent } from '../base44/shared/reportDesignIntent/generateAndSaveReportDesignIntent.js';
import {
  buildDesignIntentGenerationReport,
  wordCount,
} from '../base44/shared/reportDesignIntent/reportDesignIntentGenerationReport.js';

const AT = MARQUEE_GENERATED_AT;

const PREVIEW_ENTRY = 'base44/functions/previewReportDesignIntent/entry.ts';
const PURE_CORE = 'base44/shared/reportDesignIntent/buildReportDesignIntentAttempt.js';
const GENERATION_REPORT = 'base44/shared/reportDesignIntent/reportDesignIntentGenerationReport.js';
const SAVE_WRAPPER = 'base44/shared/reportDesignIntent/generateAndSaveReportDesignIntent.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Every entity MUTATION API, named exactly as the SDK names it on an entity client.
 * A leading dot keeps the count honest: a sentence that merely uses the word
 * "create" or "delete" is not a way to write, and `.create(` is.
 */
const MUTATION_APIS = Object.freeze({
  CREATE: ['.create(', '.bulkCreate(', '.upsert('],
  UPDATE: ['.update(', '.bulkUpdate(', '.updateMany('],
  DELETE: ['.delete(', '.deleteMany('],
});

function countMutations(source) {
  const counts = {};
  for (const [family, tokens] of Object.entries(MUTATION_APIS)) {
    counts[family] = tokens.reduce((total, token) => total + (source.split(token).length - 1), 0);
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PROOF: the preview has nothing that writes.
// ─────────────────────────────────────────────────────────────────────────────

describe('the preview is structurally incapable of writing', () => {
  it('references no entity mutation API at all — CREATE 0, UPDATE 0, DELETE 0', () => {
    expect(countMutations(read(PREVIEW_ENTRY))).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });
  });

  it('imports the pure generation core, and nothing that can persist', () => {
    const source = read(PREVIEW_ENTRY);
    const imports = [...source.matchAll(/^import .*?from '([^']+)';$/gm)].map((match) => match[1]);

    // The whole import list, stated: the request client, the pure core, and the
    // wrapper that refuses writes. There is no persistence helper to call.
    expect(imports).toEqual([
      'npm:@base44/sdk@0.8.52',
      '../../shared/reportDesignIntent/buildReportDesignIntentAttempt.js',
      '../../shared/reportDesignIntent/readOnlyEntities.js',
    ]);
    // The save wrapper is the one module that may write, and the preview cannot reach
    // it: it is not on the import list above, so there is nothing to call.
    expect(imports.some((path) => path.includes('generateAndSaveReportDesignIntent'))).toBe(false);
  });

  it('has a pure generation core with no mutation API either', () => {
    expect(countMutations(read(PURE_CORE))).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });
    expect(countMutations(read(GENERATION_REPORT))).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });
  });

  it('keeps the one production write in one place, outside the preview path', () => {
    const counts = countMutations(read(SAVE_WRAPPER));
    expect(counts.CREATE).toBe(0);
    expect(counts.UPDATE).toBe(1);
    expect(counts.DELETE).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PROOF: run the whole core, and watch the store.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT = { id: 'p1', name: 'Marquee Home', client_name: 'Marquee', account_id: 'acct-1', notes: '' };
const VERSION = { id: 'a', project_id: 'p1', version_number: 1, version_name: 'Original Design' };
const SNAPSHOT = {
  id: 's1',
  project_id: 'p1',
  version_id: 'a',
  report_type: 'project',
  status: 'current',
  generated_at: AT,
  source_fingerprints: {
    engineeringFingerprint: 'eng:original-design',
    calculationFingerprint: 'calc:original-design',
    seatPriorityFingerprint: 'seat:original-design',
  },
  payload: { pages: ['cover'], design_intent: null },
};

const SEED = {
  Project: [PROJECT],
  ProjectVersion: [VERSION],
  ReportSnapshot: [SNAPSHOT],
  ProposalAsset: [],
  SystemConfig: [{ id: 'cfg', gpt_proposal_writer: { enabled: true, accounts: [], emails: [] } }],
};

/**
 * An entity client over a REAL, mutable in-memory store. Reads pass through; every
 * mutation is recorded AND performed, so a write by anything under test changes the
 * store and the before/after comparison fails rather than passing silently.
 */
function makeStore(seed = SEED) {
  const state = JSON.parse(JSON.stringify(seed));
  const calls = [];
  const mutations = [];

  const matches = (row, query) => Object.entries(query || {}).every(([key, want]) => {
    if (want && typeof want === 'object') {
      if (Array.isArray(want.$in)) return want.$in.includes(row[key]);
      return false;
    }
    return row[key] === want;
  });

  const page = (rows) => ({ items: rows, next_cursor: null, has_more: false });

  const entity = (name) => ({
    get: async (id) => {
      calls.push(`${name}.get`);
      return (state[name] || []).find((row) => row.id === id) || null;
    },
    filter: async (query) => {
      calls.push(`${name}.filter`);
      return page((state[name] || []).filter((row) => matches(row, query)));
    },
    list: async () => {
      calls.push(`${name}.list`);
      return page((state[name] || []).slice());
    },
    count: async () => (state[name] || []).length,
    aggregate: async () => ({ rows: [] }),

    create: async (data) => {
      mutations.push({ entity: name, method: 'create' });
      const row = { id: `made-${mutations.length}`, ...data };
      state[name] = [...(state[name] || []), row];
      return row;
    },
    bulkCreate: async (rows) => {
      mutations.push({ entity: name, method: 'bulkCreate' });
      return rows;
    },
    upsert: async () => {
      mutations.push({ entity: name, method: 'upsert' });
      return { created: 0, updated: 0, records: [] };
    },
    update: async (id, patch) => {
      mutations.push({ entity: name, method: 'update', id });
      const rows = [...(state[name] || [])];
      const index = rows.findIndex((row) => row.id === id);
      const next = { ...(rows[index] || { id }), ...patch };
      if (index >= 0) rows[index] = next;
      else rows.push(next);
      state[name] = rows;
      return next;
    },
    updateMany: async () => {
      mutations.push({ entity: name, method: 'updateMany' });
      return { updated: 0 };
    },
    bulkUpdate: async () => {
      mutations.push({ entity: name, method: 'bulkUpdate' });
      return [];
    },
    delete: async (id) => {
      mutations.push({ entity: name, method: 'delete', id });
      state[name] = (state[name] || []).filter((row) => row.id !== id);
      return true;
    },
    deleteMany: async () => {
      mutations.push({ entity: name, method: 'deleteMany' });
      return { deleted: 0 };
    },
  });

  const client = new Proxy({}, {
    get: (target, key) => (typeof key === 'string' ? entity(key) : undefined),
  });

  return {
    client,
    state: () => state,
    serialised: () => JSON.stringify(state),
    mutations: () => [...mutations],
    calls: () => [...calls],
    record: (name, id) => (state[name] || []).find((row) => row.id === id),
    counts: () => ({
      CREATE: mutations.filter((row) => ['create', 'bulkCreate', 'upsert'].includes(row.method)).length,
      UPDATE: mutations.filter((row) => ['update', 'bulkUpdate', 'updateMany'].includes(row.method)).length,
      DELETE: mutations.filter((row) => ['delete', 'deleteMany'].includes(row.method)).length,
    }),
  };
}

/** The frozen pack, and the reference draft the real validator genuinely accepts. */
const referencePack = () => buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });

const CITED_CLAIM_IDS = Object.freeze([
  'claim_p4_primary_performance_01',
  'claim_p6_primary_performance_01',
  'claim_p20_primary_consistency_01',
  'claim_p4_secondary_performance_01',
  'claim_p6_secondary_performance_01',
]);

const ACCEPTED_TEXT = 'This cinema is arranged around a large television and a single loudspeaker system. '
  + 'The display occupies the front wall, the viewing position is set so the distance suits its scale, '
  + 'and the screen channels, the surrounds and the rear subwoofer pair work together as one system. '
  + 'The arrangement keeps dialogue, music and effects in their proper places around the listener.';

function acceptedDraft() {
  const input = buildDesignIntentWriterInput({ pack: referencePack() });
  return JSON.stringify({
    contract_version: input.contract_version,
    pack_fingerprint: input.evidence_pack.pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text: ACCEPTED_TEXT, claim_ids: [...CITED_CLAIM_IDS] }],
  });
}

/** The whole core, driven with a live-shaped store and an injected provider. */
function input(store, invokeLLM) {
  return {
    // ONE client for both doors, so a write through either is caught.
    entities: store.client,
    authorityEntities: store.client,
    invokeLLM,
    projectId: 'p1',
    versionId: 'a',
    user: { email: 'admin@example.com' },
    isMasterAdmin: true,
    now: AT,
    // The frozen saved-report evidence a live read would return for this version.
    evidenceReader: async () => [marqueeVersion()],
  };
}

describe('the preview leaves every record exactly as it found it', () => {
  it('generates the narrative and touches nothing: 0 creates, 0 updates, 0 deletes', async () => {
    const store = makeStore();
    const before = store.serialised();

    const outcome = await buildReportDesignIntentAttempt(input(store, async () => acceptedDraft()));

    const after = store.serialised();

    // The attempt really ran: a validated narrative came back, written by the writer.
    expect(outcome.ok).toBe(true);
    expect(outcome.generation.status).toBe('accepted');
    expect(outcome.generation.text).toBe(ACCEPTED_TEXT);
    expect(outcome.generation.word_count).toBe(wordCount(ACCEPTED_TEXT));

    // And the store is untouched — bit-for-bit.
    expect(after).toBe(before);
    expect(store.mutations()).toEqual([]);
    expect(store.counts()).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });

    // The saved report still holds no Design Intent: the preview saved none.
    expect(store.record('ReportSnapshot', 's1').payload.design_intent).toBe(null);
    // The reads it did make are plain reads.
    expect(store.calls().every((call) => /\.(get|filter|list)$/.test(call))).toBe(true);
  });

  it('leaves the store identical when the writer refuses as well', async () => {
    const store = makeStore();
    const before = store.serialised();

    const outcome = await buildReportDesignIntentAttempt(input(store, async () => 'not a draft at all'));

    expect(outcome.generation.status).toBe('refused');
    expect(outcome.generation.refused_draft).toBe('not a draft at all');
    expect(store.serialised()).toBe(before);
    expect(store.counts()).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });
  });
});

describe('the production save flow still works', () => {
  it('saves the accepted narrative through exactly one write, to exactly one record', async () => {
    const store = makeStore();

    const outcome = await generateAndSaveReportDesignIntent(input(store, async () => acceptedDraft()));

    expect(outcome.ok).toBe(true);
    expect(outcome.saved).toBe(true);
    expect(store.mutations()).toEqual([{ entity: 'ReportSnapshot', method: 'update', id: 's1' }]);
    expect(store.counts()).toEqual({ CREATE: 0, UPDATE: 1, DELETE: 0 });

    const saved = store.record('ReportSnapshot', 's1');
    expect(saved.payload.design_intent.text).toBe(ACCEPTED_TEXT);
    expect(saved.payload.design_intent.status).toBe('accepted');
    // The rest of the report's own payload is preserved, not replaced.
    expect(saved.payload.pages).toEqual(['cover']);
  });

  it('writes nothing at all when the writer refuses', async () => {
    const store = makeStore();
    const before = store.serialised();

    const outcome = await generateAndSaveReportDesignIntent(input(store, async () => 'not a draft at all'));

    expect(outcome.ok).toBe(true);
    expect(outcome.saved).toBe(false);
    expect(store.serialised()).toBe(before);
    expect(store.mutations()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PROJECT RENDERS: non-authoritative, and gated on the project's own brief
// ─────────────────────────────────────────────────────────────────────────────

const RENDERS = [{
  id: 'r1',
  project_id: 'p1',
  scope: 'project',
  slot: 'image_1',
  asset_type: 'gallery',
  file_url: 'https://files.test/public/aa11_room.jpg',
  caption: 'The finished room',
  usage: 'gallery',
  image_purpose: 'whole_room',
}];

describe('the renders reach the writer as non-authoritative client experience context', () => {
  it('carries the concept-visual block on the real core, and lets the brief gate the one experience allowance', async () => {
    // NO BRIEF RECORDED: nothing about an intended use may be written.
    const withoutBrief = makeStore({ ...SEED, ProposalAsset: RENDERS });
    const first = await buildReportDesignIntentAttempt(input(withoutBrief, async () => acceptedDraft()));

    const blockWithout = first.writerInput.design_visual_context;
    expect(blockWithout.purpose).toBe('concept_render');
    expect(blockWithout.authority).toBe('non_authoritative');
    expect(blockWithout.intended_use).toBe('client_experience_context');
    expect(blockWithout.social_experience_allowed).toBe(false);
    expect(blockWithout.images).toEqual([{ role: 'whole_room', caption: 'The finished room' }]);
    // The engineering the draft stands on is untouched by the pictures.
    expect(first.writerInput.evidence_pack.pack_fingerprint).toBe(referencePack().pack_fingerprint);
    expect(withoutBrief.counts()).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });

    // THE PROJECT'S OWN BRIEF RECORDED: the room's intended use may be acknowledged.
    const withBrief = makeStore({
      ...SEED,
      Project: [{ ...PROJECT, notes: 'A family cinema for films, sport and shared evenings.' }],
      ProposalAsset: RENDERS,
    });
    const second = await buildReportDesignIntentAttempt(input(withBrief, async () => acceptedDraft()));

    const blockWith = second.writerInput.design_visual_context;
    expect(blockWith.social_experience_allowed).toBe(true);
    // The brief moves the one flag and nothing else: the image identity the accepted
    // narrative is pinned to is the same either way.
    expect(blockWith.fingerprint).toBe(blockWithout.fingerprint);
    expect(blockWith.never).toBe(blockWithout.never);
    expect(withBrief.counts()).toEqual({ CREATE: 0, UPDATE: 0, DELETE: 0 });
  });

  it('attaches the pictures to the ONE provider call and derives no fact from them', async () => {
    const store = makeStore({ ...SEED, ProposalAsset: RENDERS });
    const requests = [];

    const outcome = await buildReportDesignIntentAttempt(input(store, async (request) => {
      requests.push(request);
      return acceptedDraft();
    }));

    expect(outcome.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].file_urls).toEqual(['https://files.test/public/aa11_room.jpg']);

    const block = outcome.writerInput.design_visual_context;
    // The block is instructions about status and one bounded experience allowance: no
    // colour, no finish, no material and no technical fact taken from the picture.
    expect(Object.keys(block).sort()).toEqual([
      'authority', 'authority_rule', 'available', 'client_label', 'disclaimer_rule', 'fingerprint',
      'image_count', 'images', 'intended_use', 'never', 'notes', 'purpose', 'rule', 'selection',
      'social_experience_allowed', 'whole_room_context_available', 'writing',
    ]);
    expect(JSON.stringify(block)).not.toMatch(/#[0-9A-Fa-f]{3,6}/);
    expect(block.never).toMatch(/not the room type, not the display/);
    expect(block.authority_rule).toMatch(/CANONICAL PROJECT AND ENGINEERING DATA ALWAYS WINS/);
  });
});

describe('the generation result the core returns', () => {
  it('carries the text, its word count, the current prompt fingerprint, the validation and the evidence', () => {
    const pack = referencePack();
    const writerInput = buildDesignIntentWriterInput({ pack });

    const report = buildDesignIntentGenerationReport({
      attempt: { ok: true, text: ACCEPTED_TEXT, record: {}, validation_errors: [] },
      writerInput,
      pack,
      snapshot: SNAPSHOT,
    });

    expect(report.status).toBe('accepted');
    expect(report.text).toBe(ACCEPTED_TEXT);
    expect(report.word_count).toBe(wordCount(ACCEPTED_TEXT));
    expect(report.validation_errors).toEqual([]);

    // THE CURRENT PROMPT, identified: the version this build defines, and a content
    // fingerprint of the prompt built from the input the writer was given.
    expect(report.prompt.version).toBe(WRITER_PROMPT_VERSION);
    expect(report.prompt.current).toBe(WRITER_PROMPT_VERSION);
    expect(report.prompt.matches_current).toBe(true);
    expect(typeof report.prompt.fingerprint).toBe('string');
    expect(report.prompt.fingerprint.length).toBeGreaterThan(0);

    expect(report.contract_version).toBe(WRITER_CONTRACT_VERSION);
    expect(report.evidence_pack_fingerprint).toBe(pack.pack_fingerprint);

    // The evidence it used, and the evidence it was kept from.
    expect(report.evidence_used.snapshot_id).toBe('s1');
    expect(report.evidence_used.pack_fingerprint).toBe(pack.pack_fingerprint);
    // Every count is the pack's own, read back — never a second opinion about it.
    expect(report.evidence_used.allowed_claim_count).toBe(pack.allowed_claims.length);
    expect(report.evidence_used.selected_stories)
      .toHaveLength((pack.options[0].strength_stories || []).length);
    expect(report.evidence_used.selected_story_count).toBe(report.evidence_used.selected_stories.length);
    expect(report.evidence_used.design_rationale).toBeTruthy();
    expect(report.evidence_used.sections_in_scope).toEqual([DESIGN_INTENT_SECTION]);
    expect(report.evidence_used.design_scope).toBe(DESIGN_INTENT_SECTION);
    expect(report.evidence_excluded.blocked_claim_count).toBe(pack.blocked_claims.length);
    expect(report.evidence_excluded.blocked_claims)
      .toHaveLength(pack.blocked_claims.length);
    expect(report.evidence_excluded.omitted_story_count)
      .toBe((pack.options[0].omitted_stories || []).length);
    expect(report.evidence_excluded.supporting_results).not.toBeNull();
  });

  it('never returns text from a refused attempt, and keeps the draft for reading', () => {
    const pack = referencePack();

    const report = buildDesignIntentGenerationReport({
      attempt: {
        ok: false,
        text: null,
        reason: 'validation_failed',
        detail: 'The draft cited a claim the pack does not allow.',
        draft: 'refused draft text',
        validation: { valid: false, violations: [] },
        validation_errors: [{ code: 'claim_not_allowed' }],
      },
      writerInput: buildDesignIntentWriterInput({ pack }),
      pack,
      snapshot: SNAPSHOT,
    });

    expect(report.status).toBe('refused');
    expect(report.text).toBe(null);
    expect(report.word_count).toBe(0);
    expect(report.refused_draft).toBe('refused draft text');
    expect(report.validation_result).toEqual({ valid: false, violations: [] });
    expect(report.validation_errors).toHaveLength(1);
    expect(report.reason).toBe('validation_failed');
  });
});