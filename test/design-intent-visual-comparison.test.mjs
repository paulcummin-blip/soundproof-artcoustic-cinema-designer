/**
 * design-intent-visual-comparison.test.mjs
 * ----------------------------------------
 * THE SAFETY AND CONTROL BOUNDARIES of the read-only Design Intent comparison,
 * proven with an INJECTED provider BEFORE any real model call is made.
 *
 * What must be demonstrably true:
 *   1. the preview is read-only — every write primitive is refused, none forwarded;
 *   2. the comparison runs the EXISTING production attempt, not a second writer;
 *   3. the ONLY intentional difference between A and B is the visual context;
 *   4. the engineering evidence fingerprint is identical across the two runs;
 *   5. an empty visual context makes NO second model call (the text-only control);
 *   6. no image address is ever returned.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { marqueeVersion, MARQUEE_GENERATED_AT } from './fixtures/marqueeOriginalGuardFixture.mjs';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { buildReportVisualContext } from '../base44/shared/reportDesignIntent/reportVisualContext.js';
import {
  COMPARISON_RUN,
  COMPARISON_SKIP,
  runDesignIntentVisualComparison,
  wordCount,
} from '../base44/shared/reportDesignIntent/designIntentComparison.js';
import {
  READ_ONLY_METHODS,
  ReadOnlyViolation,
  readOnlyEntities,
} from '../base44/shared/reportDesignIntent/readOnlyEntities.js';

const AT = MARQUEE_GENERATED_AT;
const VERSION_ID = 'version-1';
const HOST = 'https://files.soundproof.test';
const FLAG = { enabled: true, model: null };

const asset = (id, slot, file, extra = {}) => ({
  id,
  project_id: 'project-1',
  scope: 'project',
  version_id: null,
  slot,
  asset_type: 'gallery',
  file_url: `${HOST}/public/${file}`,
  caption: null,
  usage: 'gallery',
  seating_style: null,
  comparison_enabled: false,
  image_purpose: 'whole_room',
  ...extra,
});

const RENDERS = [
  asset('r1', 'cover', 'aa11_cover.jpg'),
  asset('r2', 'image_1', 'bb22_screen-wall.jpg'),
  asset('r3', 'image_2', 'cc33_rear.jpg'),
];

const TEXT = 'This cinema is arranged around the room it actually stands in, and the seating, '
  + 'the picture and the sound system are balanced to serve it.';

const draftFor = (pack) => ({
  contract_version: 2,
  pack_fingerprint: pack.pack_fingerprint,
  sections: [{ section: DESIGN_INTENT_SECTION, text: TEXT, claim_ids: [] }],
});

const packFor = () => buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });

/** One comparison against the injected provider. */
async function compare({ assets, captured = [] }) {
  const pack = packFor();
  return runDesignIntentVisualComparison({
    flag: FLAG,
    versionIds: [VERSION_ID],
    sourceFingerprints: { engineeringFingerprint: 'eng:cmp' },
    project: { id: 'project-1' },
    now: AT,
    readEvidence: async () => [marqueeVersion()],
    readVisualContext: async () => buildReportVisualContext({ assets, versionId: VERSION_ID }),
    invokeLLM: async (request) => {
      captured.push(request);
      return draftFor(pack);
    },
    // Wiring and control are under test, not the prose rules.
    validate: () => ({ valid: true, violations: [], output: null }),
  });
}

describe('the preview is read-only, and that is proven by refusing every write', () => {
  const store = () => ({
    Project: { get: vi.fn(async () => ({ id: 'p' })), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    ReportSnapshot: { filter: vi.fn(async () => ({ items: [] })), update: vi.fn(), create: vi.fn() },
    ProposalAsset: { filter: vi.fn(async () => ({ items: [] })), bulkCreate: vi.fn(), deleteMany: vi.fn() },
  });

  it('forwards reads and refuses create, update, delete, bulk and many-write calls', async () => {
    const raw = store();
    const guard = readOnlyEntities(raw);

    await guard.entities.Project.get('p');
    await guard.entities.ReportSnapshot.filter({});
    await guard.entities.ProposalAsset.filter({});
    expect(guard.reads.map((r) => `${r.entity}.${r.method}`)).toEqual([
      'Project.get', 'ReportSnapshot.filter', 'ProposalAsset.filter',
    ]);

    for (const [entity, method] of [
      ['Project', 'update'], ['Project', 'delete'], ['Project', 'create'],
      ['ReportSnapshot', 'update'], ['ReportSnapshot', 'create'],
      ['ProposalAsset', 'bulkCreate'], ['ProposalAsset', 'deleteMany'],
    ]) {
      expect(() => guard.entities[entity][method]({ x: 1 })).toThrow(ReadOnlyViolation);
    }

    // Every attempt was recorded, and NONE reached the underlying client.
    expect(guard.attempts).toHaveLength(7);
    expect(raw.Project.update).not.toHaveBeenCalled();
    expect(raw.Project.delete).not.toHaveBeenCalled();
    expect(raw.Project.create).not.toHaveBeenCalled();
    expect(raw.ReportSnapshot.update).not.toHaveBeenCalled();
    expect(raw.ReportSnapshot.create).not.toHaveBeenCalled();
    expect(raw.ProposalAsset.bulkCreate).not.toHaveBeenCalled();
    expect(raw.ProposalAsset.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a write method it has never heard of: anything not a named read is a write', () => {
    const guard = readOnlyEntities({ Thing: { get: async () => 1, someFutureWrite: vi.fn() } });
    expect(() => guard.entities.Thing.someFutureWrite()).toThrow(ReadOnlyViolation);
    expect(READ_ONLY_METHODS).toEqual(['get', 'list', 'filter', 'count', 'aggregate']);
  });

  it('the comparison and read-only modules import no SDK, no entity and no write primitive', () => {
    for (const file of [
      '../base44/shared/reportDesignIntent/designIntentComparison.js',
      '../base44/shared/reportDesignIntent/readOnlyEntities.js',
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
        // Comments state the rule; only executable text is checked.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(source).not.toMatch(/npm:@base44\/sdk/);
      expect(source).not.toMatch(/\.(create|update|delete|bulkCreate|bulkUpdate|updateMany|deleteMany|upsert)\s*\(/);
      expect(source).not.toMatch(/ReportSnapshot|ProposalSection|ProposalGeneration|ProposalAsset/);
    }
  });

  it('the preview function never calls a write primitive or the live generate path', () => {
    const source = readFileSync(new URL('../base44/functions/previewReportNarrativeComparison/entry.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Nothing in the file writes, and the live generate path is never invoked.
    expect(source).not.toMatch(/\.(create|update|delete|bulkCreate|bulkUpdate|updateMany|deleteMany|upsert)\s*\(/);
    expect(source).not.toMatch(/generateReportDesignIntent/);
  });

  it('the comparison branch reaches BOTH entity clients only through the guard', () => {
    const source = readFileSync(new URL('../base44/functions/previewReportNarrativeComparison/entry.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const branch = source.slice(
      source.indexOf('async function designIntentVisualComparison'),
      source.indexOf('export default async function (req)'),
    );
    expect(branch.length).toBeGreaterThan(500);
    // The user client and the service client are both wrapped before any read.
    expect(branch).toContain('readOnlyEntities(base44.entities)');
    expect(branch).toContain('readOnlyEntities(base44.asServiceRole.entities)');
    // No call in the branch reaches an unguarded client.
    expect(branch).not.toMatch(/base44\.entities\./);
    expect(branch).not.toMatch(/base44\.asServiceRole\.entities\./);
    expect(branch).not.toMatch(/\bupdate\b|\bcreate\b|\bdelete\b/);
  });
});

describe('the comparison runs the EXISTING writer, with one intentional difference', () => {
  it('A is engineering only and B carries the images on the same provider path', async () => {
    const captured = [];
    const result = await compare({ assets: RENDERS, captured });

    expect(captured).toHaveLength(2);
    const [a, b] = captured;

    // A: the text-only request the writer has always sent — no image field at all.
    expect(a.file_urls).toBeUndefined();
    expect(a.prompt).not.toContain('design_visual_context');

    // B: the same request plus the pictures, attached to the one call.
    expect(b.file_urls).toEqual([
      `${HOST}/public/aa11_cover.jpg`,
      `${HOST}/public/bb22_screen-wall.jpg`,
      `${HOST}/public/cc33_rear.jpg`,
    ]);
    expect(b.prompt).toContain('design_visual_context');

    // Same model, same schema.
    expect(b.model).toBe(a.model);
    expect(b.response_json_schema).toEqual(a.response_json_schema);

    expect(result.model_calls).toBe(2);
    expect(result.text_only.run).toBe(COMPARISON_RUN.TEXT_ONLY);
    expect(result.with_images.run).toBe(COMPARISON_RUN.WITH_IMAGES);
    expect(result.with_images.images_attached).toBe(3);
    expect(result.text_only.images_attached).toBe(0);
  });

  it('removing the visual block from B leaves a prompt identical to A: vision is the ONLY difference', async () => {
    const captured = [];
    await compare({ assets: RENDERS, captured });
    const [a, b] = captured;

    // Strip the one visual key from B's serialised writer input and the prompts agree
    // everywhere except the input fingerprint, which necessarily covers the block.
    const stripVisual = (prompt) => prompt
      .replace(/"design_visual_context":\{.*?\},"design_intent_scope"/, '"design_intent_scope"')
      .replace(/"input_fingerprint":"[^"]*"/, '"input_fingerprint":"X"');
    expect(stripVisual(b.prompt)).toBe(stripVisual(a.prompt));
  });

  it('proves the engineering evidence fingerprint is identical while the input fingerprints differ', async () => {
    const result = await compare({ assets: RENDERS });

    expect(result.proof.evidence_fingerprint_identical).toBe(true);
    expect(result.text_only.evidence_pack_fingerprint).toBe(result.with_images.evidence_pack_fingerprint);
    expect(result.proof.evidence_pack_fingerprint).toBe(packFor().pack_fingerprint);

    // The visual block is part of the input, so the complete fingerprints differ.
    expect(result.proof.input_fingerprints_differ).toBe(true);
    expect(result.proof.same_model).toBe(true);
    expect(result.proof.same_prompt_version).toBe(true);
    expect(result.proof.same_contract_version).toBe(true);
  });

  it('records which pictures were shown by identity only, and never returns an address', async () => {
    const result = await compare({ assets: RENDERS });
    expect(result.visual_identity.image_count).toBe(3);
    expect(result.visual_identity.images.map((i) => i.id)).toEqual(['r1', 'r2', 'r3']);

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(HOST);
    expect(serialised).not.toContain('https://');
  });
});

describe('the text-only control makes no duplicate model call', () => {
  it('Barton: an empty library runs A only, states why, and makes ONE call', async () => {
    const captured = [];
    const result = await compare({ assets: [], captured });

    expect(captured).toHaveLength(1);
    expect(captured[0].file_urls).toBeUndefined();
    expect(result.model_calls).toBe(1);
    expect(result.with_images).toBeNull();
    expect(result.skipped).toBe(COMPARISON_SKIP.NO_VISUAL_CONTEXT);
    expect(result.visual_reason).toBe('no_library_images');
    expect(result.text_only.ok).toBe(true);
    expect(result.proof.evidence_fingerprint_identical).toBeNull();
  });

  it('a library whose images are all ineligible is also a one-call control', async () => {
    const captured = [];
    const result = await compare({
      assets: [
        asset('hidden', 'cover', 'h.jpg', { usage: 'do_not_use' }),
        asset('plan', 'image_1', 'p.jpg', { image_purpose: 'layout_drawing', asset_type: 'plan' }),
        asset('opt', 'image_2', 'o.jpg', { seating_style: 'lounge', image_purpose: 'seating_option' }),
      ],
      captured,
    });
    expect(captured).toHaveLength(1);
    expect(result.model_calls).toBe(1);
    expect(result.visual_reason).toBe('no_eligible_images');
  });

  it('an unreadable library is a one-call control, never a failure of the comparison', async () => {
    const captured = [];
    const pack = packFor();
    const result = await runDesignIntentVisualComparison({
      flag: FLAG,
      versionIds: [VERSION_ID],
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      readVisualContext: async () => { throw new Error('library unreadable'); },
      invokeLLM: async (request) => { captured.push(request); return draftFor(pack); },
      validate: () => ({ valid: true, violations: [], output: null }),
    });
    expect(captured).toHaveLength(1);
    expect(result.model_calls).toBe(1);
    expect(result.text_only.ok).toBe(true);
  });
});

describe('a refusal is reported, never invented', () => {
  it('a refused draft carries the validator rule and no text, and the comparison does not rewrite it', async () => {
    const pack = packFor();
    const result = await runDesignIntentVisualComparison({
      flag: FLAG,
      versionIds: [VERSION_ID],
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      readVisualContext: async () => buildReportVisualContext({ assets: RENDERS, versionId: VERSION_ID }),
      invokeLLM: async () => draftFor(pack),
      validate: () => ({ valid: false, violations: [{ code: 'rule_x', rejection: 'rule_x', detail: 'refused' }] }),
    });
    expect(result.text_only.ok).toBe(false);
    expect(result.text_only.text).toBeNull();
    expect(result.text_only.reason).toBe('validation_failed');
    expect(result.with_images.ok).toBe(false);
    expect(JSON.stringify(result.with_images.validation_errors)).toContain('rule_x');
  });

  it('a switched-off writer makes no provider call at all', async () => {
    const invokeLLM = vi.fn();
    const result = await runDesignIntentVisualComparison({
      flag: { enabled: false },
      versionIds: [VERSION_ID],
      readEvidence: async () => [marqueeVersion()],
      readVisualContext: async () => buildReportVisualContext({ assets: RENDERS, versionId: VERSION_ID }),
      invokeLLM,
    });
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(result.text_only.reason).toBe('writer_flag_off');
  });

  it('counts words the way the editorial check does', () => {
    expect(wordCount('one two  three\nfour')).toBe(4);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});