/**
 * design-intent-visual-context.test.mjs
 * -------------------------------------
 * STAGE 3 + STAGE 4 — THE PROJECT LIBRARY'S OWN IMAGES, CONNECTED TO THE ONE
 * EXISTING ASTRA DESIGN INTENT WRITER. Injected provider throughout: nothing here
 * reaches a model.
 *
 * WHAT THIS PROVES. The designer already uploads the cinema's renders before a
 * report is written, and until now the writer was never shown them: it read a
 * frozen pack of engineering results and described a cinema it had never seen.
 * The pictures are now attached to the SAME provider call that already writes the
 * Design Intent — no second model, no second writer, no separate image-analysis
 * pass — and the accepted words are bound to the identity of the images they were
 * written from, so a narrative is never presented as current once the designer has
 * replaced them.
 *
 * The engineering rule is absolute and is asserted here: an image is EDITORIAL
 * context and never evidence. No figure, distance, loudspeaker position, product,
 * capability or RP22 result may be read from a photograph, and the visual block the
 * writer receives says exactly that.
 *
 * The provider and the validator are injected so the test is decisive about the
 * WIRING and the IDENTITY rather than about prose quality or model behaviour.
 */

import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * TEST ENVIRONMENT ONLY — no production file is touched by this block.
 *
 * The Project Summary screen reaches the app's SDK, and src/lib/app-params.js reads
 * `window` as it loads. vitest runs in node here and no DOM environment is installed
 * (no jsdom, no happy-dom), so the browser boundary is stubbed and the two modules
 * that need it — the auth context and the SDK client — are replaced. This test
 * inspects one page's PRESENTATION of already-accepted words: it must not reach a
 * network, a session or a model, so stubbing them is also the honesty of the test.
 * Nothing about how the report renders changes.
 */
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'admin', email: 'designer@soundproof.test' } }),
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {},
    functions: { invoke: async () => ({ data: {} }) },
  },
}));

vi.hoisted(() => {
  const storage = () => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
      clear: () => map.clear(),
    };
  };
  const noop = () => {};

  globalThis.window = globalThis.window || {
    location: { href: 'https://app.test/RP22Report', search: '', pathname: '/RP22Report', hash: '' },
    history: { replaceState: noop },
    localStorage: storage(),
    sessionStorage: storage(),
    addEventListener: noop,
    removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  };
  globalThis.localStorage = globalThis.localStorage || globalThis.window.localStorage;
  globalThis.sessionStorage = globalThis.sessionStorage || globalThis.window.sessionStorage;
  globalThis.addEventListener = globalThis.addEventListener || noop;
  globalThis.removeEventListener = globalThis.removeEventListener || noop;
});

import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { marqueeVersion, MARQUEE_GENERATED_AT } from './fixtures/marqueeOriginalGuardFixture.mjs';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import {
  DESIGN_INTENT_REFUSAL,
  runReportDesignIntent,
} from '../base44/shared/reportDesignIntent/reportDesignIntentRunner.js';
import { readAcceptedDesignIntent } from '../base44/shared/reportDesignIntent/reportDesignIntentRecord.js';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { assertWriterInputCarriesNoLiveState } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import {
  MAX_VISUAL_IMAGES,
  VISUAL_CONTEXT_RULE,
  buildReportVisualContext,
  visualContextSources,
} from '../base44/shared/reportDesignIntent/reportVisualContext.js';
// The frontend reaches the SAME authority through the root `shared/` re-export.
// Reading both here proves the two paths resolve to one implementation, so the
// report page and the backend can never disagree about a selection.
import { buildReportVisualContext as buildVisualContextFromFrontendPath } from '../src/shared/reportVisualContext.js';
import {
  DESIGN_INTENT_SOURCE,
  resolveDesignIntent,
} from '../src/components/report/projectReport/designIntentAuthority.js';
import ProjectReportDesignSummary from '../src/components/report/projectReport/ProjectReportDesignSummary.jsx';

const AT = MARQUEE_GENERATED_AT;
const VERSION_ID = 'version-1';
const OTHER_VERSION_ID = 'version-2';

const FINGERPRINTS = {
  engineeringFingerprint: 'eng:visual-stage-3',
  calculationFingerprint: 'calc:visual-stage-3',
  seatPriorityFingerprint: 'seat:visual-stage-3',
};

const HOST = 'https://files.soundproof.test';

/** One Project Library image record, in the shape the entity stores. */
function image(overrides = {}) {
  return {
    id: 'img',
    project_id: 'project-1',
    account_id: 'account-1',
    scope: 'project',
    version_id: null,
    slot: 'image_1',
    asset_type: 'gallery',
    file_url: `${HOST}/public/aaaaaaaa_genesis-render.jpg`,
    caption: null,
    usage: 'gallery',
    seating_style: null,
    comparison_enabled: false,
    image_purpose: 'whole_room',
    image_presentation: 'full_width',
    ...overrides,
  };
}

/**
 * The library a real project holds: whole-room views, an alternative the client is
 * being offered, a dimensioned plan, an image the designer has hidden, one image
 * belonging to ANOTHER version, and one version-scoped image belonging to this one.
 */
function genesisLibrary() {
  return [
    image({
      id: 'g-cover',
      slot: 'cover',
      file_url: `${HOST}/public/1a2b3c4d_genesis-cover.jpg`,
      caption: 'The finished cinema, seen from the rear row',
    }),
    image({
      id: 'g-room-2',
      slot: 'image_1',
      file_url: `${HOST}/public/5e6f7a8b_genesis-screen-wall.jpg`,
      caption: 'Screen wall and front stage',
    }),
    image({
      id: 'g-room-3',
      slot: 'image_2',
      file_url: `${HOST}/public/9c0d1e2f_genesis-side-elevation.jpg`,
    }),
    // The client is being offered these as alternatives: they are NOT this design.
    image({
      id: 'g-lounge-option',
      slot: 'image_3',
      file_url: `${HOST}/public/33445566_genesis-lounge.jpg`,
      caption: 'Lounge seating option',
      seating_style: 'lounge',
      image_purpose: 'seating_option',
    }),
    image({
      id: 'g-recliner-option',
      slot: 'image_4',
      file_url: `${HOST}/public/778899aa_genesis-recliner.jpg`,
      caption: 'Cinema recliner option',
      comparison_enabled: true,
      image_purpose: 'seating_option',
    }),
    // Character, not dimensions.
    image({
      id: 'g-plan',
      slot: 'image_5',
      asset_type: 'plan',
      file_url: `${HOST}/public/bbccddee_genesis-plan.jpg`,
      image_purpose: 'layout_drawing',
    }),
    // The designer has hidden it from the document.
    image({
      id: 'g-hidden',
      slot: 'image_6',
      file_url: `${HOST}/public/ffee0011_genesis-unused.jpg`,
      usage: 'do_not_use',
    }),
    // ANOTHER version's image: it describes a design this report does not document.
    image({
      id: 'g-v2-room',
      scope: 'version',
      version_id: OTHER_VERSION_ID,
      slot: 'image_1',
      file_url: `${HOST}/public/22334455_genesis-v2-layout.jpg`,
      caption: 'Version 2 layout',
    }),
    // THIS version's own image: it belongs to the design on the page.
    image({
      id: 'g-v1-detail',
      scope: 'version',
      version_id: VERSION_ID,
      slot: 'image_7',
      file_url: `${HOST}/public/99887766_genesis-fabric-detail.jpg`,
      caption: 'Fabric, seating and lighting detail',
      image_purpose: 'interior_detail',
    }),
  ];
}

const contextFor = (assets, { versionId = VERSION_ID } = {}) => buildReportVisualContext({ assets, versionId });

/** The generated draft: one valid Design Intent section, no live call. */
function injectedOutput({ pack, text }) {
  return {
    contract_version: 2,
    pack_fingerprint: pack.pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text, claim_ids: [] }],
  };
}

/** The injected validator: wiring and identity are under test, not the prose rules. */
const injectedValidator = () => ({ valid: true, violations: [], output: null });

const ACCEPTED_TEXT = 'This cinema is arranged around the room it actually stands in. '
  + 'The seating faces a screen wall that fills the eye, the loudspeakers work with the '
  + 'architecture rather than against it, and the atmosphere of the space is part of what '
  + 'makes a film land here.';

/** One attempt against the injected provider, with whatever library the test supplies. */
async function attemptWith({ pack, assets, text = ACCEPTED_TEXT, captured }) {
  return runReportDesignIntent({
    flag: { enabled: true, model: 'injected-test-model' },
    versionIds: [VERSION_ID],
    sourceFingerprints: FINGERPRINTS,
    project: { id: 'project-1' },
    now: AT,
    readEvidence: async () => [marqueeVersion()],
    readVisualContext: async ({ versionIds }) => contextFor(assets, { versionId: versionIds[0] }),
    invokeLLM: async (request) => {
      if (captured) captured.push(request);
      return injectedOutput({ pack, text });
    },
    validate: injectedValidator,
  });
}

const packFor = () => buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });

describe('Stage 3 — the Project Library images reach the one existing Astra writer', () => {
  it('attaches exactly the selected whole-room images to the existing provider call, and nothing else', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const context = contextFor(assets);
    const captured = [];

    const attempt = await attemptWith({ pack, assets, captured });

    // ONE provider call was made: no second model, no separate image analysis.
    expect(captured).toHaveLength(1);
    const request = captured[0];

    // The images the designer's own selection produced, in order, as the multimodal
    // attachment of the SAME request that carries the engineering.
    expect(context.available).toBe(true);
    expect(request.file_urls).toEqual(visualContextSources(context));
    expect(request.file_urls).toHaveLength(4);
    expect(request.file_urls).toEqual([
      `${HOST}/public/1a2b3c4d_genesis-cover.jpg`,
      `${HOST}/public/5e6f7a8b_genesis-screen-wall.jpg`,
      `${HOST}/public/9c0d1e2f_genesis-side-elevation.jpg`,
      `${HOST}/public/99887766_genesis-fabric-detail.jpg`,
    ]);
    // Four is the ceiling: a fifth view was available and was not sent.
    expect(request.file_urls.length).toBe(MAX_VISUAL_IMAGES);

    // The request is the existing one: the same prompt field, the same response
    // schema, the same explicitly named model.
    expect(typeof request.prompt).toBe('string');
    expect(request.response_json_schema.type).toBe('object');
    expect(request.model).toBe('injected-test-model');

    // The writer is told what the pictures are for, in the words it must follow, and
    // that they are never evidence.
    expect(request.prompt).toContain('design_visual_context');
    expect(request.prompt).toContain(VISUAL_CONTEXT_RULE);
    expect(request.prompt).toContain('Never read a figure, a distance, a loudspeaker position');
    expect(request.prompt).toContain('VISUAL CONTEXT ONLY');

    // The accepted narrative is bound to that exact selection.
    expect(attempt.ok).toBe(true);
    expect(attempt.record.visual_fingerprint).toBe(context.fingerprint);
    expect(attempt.record.visual_context.image_count).toBe(4);
  });

  it('gives the writer no storage address, so the prose context can never depend on a link', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const captured = [];

    await attemptWith({ pack, assets, captured });
    const request = captured[0];

    // The addresses travel in the attachment field ONLY. They never appear in the
    // prompt the writer reads, and they are never stored on the record.
    expect(request.file_urls.every((url) => String(url).startsWith(HOST))).toBe(true);
    expect(request.prompt).not.toContain(HOST);
    expect(request.prompt).not.toContain('genesis-cover.jpg');
  });

  it('excludes images belonging to another version, and keeps the ones belonging to this one', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const context = contextFor(assets);
    const captured = [];

    await attemptWith({ pack, assets, captured });
    const sent = captured[0].file_urls;

    expect(sent).not.toContain(`${HOST}/public/22334455_genesis-v2-layout.jpg`);
    expect(contextFor(assets).rejected).toContainEqual({ id: 'g-v2-room', reason: 'other_version' });
    // A version-scoped image of THIS version is this design's own material.
    expect(sent).toContain(`${HOST}/public/99887766_genesis-fabric-detail.jpg`);

    // Read against another version, the two swap and the project-wide images stay.
    const otherVersion = contextFor(assets, { versionId: OTHER_VERSION_ID });
    const otherSources = visualContextSources(otherVersion);
    expect(otherSources).toContain(`${HOST}/public/22334455_genesis-v2-layout.jpg`);
    expect(otherSources).not.toContain(`${HOST}/public/99887766_genesis-fabric-detail.jpg`);
    expect(otherSources).toContain(`${HOST}/public/1a2b3c4d_genesis-cover.jpg`);
  });

  it('never presents an alternative the client is being offered as the approved design', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const captured = [];

    await attemptWith({ pack, assets, captured });
    const request = captured[0];

    // Neither seating alternative is attached, and neither reaches the writer's prose
    // context, so no wording can be grounded on an option that is not this design.
    expect(request.file_urls).not.toContain(`${HOST}/public/33445566_genesis-lounge.jpg`);
    expect(request.file_urls).not.toContain(`${HOST}/public/778899aa_genesis-recliner.jpg`);
    expect(request.prompt).not.toContain('Lounge seating option');
    expect(request.prompt).not.toContain('Cinema recliner option');
    // A hidden image and a dimensioned drawing are excluded for their own reasons.
    expect(request.file_urls).not.toContain(`${HOST}/public/ffee0011_genesis-unused.jpg`);
    expect(request.file_urls).not.toContain(`${HOST}/public/bbccddee_genesis-plan.jpg`);
  });

  it('carries the designer’s own metadata about each picture into the writer context', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const captured = [];

    await attemptWith({ pack, assets, captured });
    const request = captured[0];

    // What the picture is for, and the caption the designer wrote, reach the writer.
    expect(request.prompt).toContain('The finished cinema, seen from the rear row');
    expect(request.prompt).toContain('Fabric, seating and lighting detail');
    expect(request.prompt).toContain('whole_room');
    expect(request.prompt).toContain('interior_detail');

    // The block states how the selection was made, so the writer knows what it is
    // looking at rather than guessing from filenames.
    expect(request.prompt).toContain('Whole-room views first');
  });

  it('keeps the block outside the frozen evidence and passes the live-state guard', () => {
    const pack = packFor();
    const context = contextFor(genesisLibrary());

    const input = buildDesignIntentWriterInput({ pack, visualContext: context });

    expect(input.design_visual_context.available).toBe(true);
    expect(input.design_visual_context.fingerprint).toBe(context.fingerprint);
    expect(input.design_visual_context.image_count).toBe(4);
    // Visual context never becomes evidence: the frozen pack is untouched.
    expect(input.evidence_pack.pack_fingerprint).toBe(pack.pack_fingerprint);
    // The writer still cannot be handed live design state.
    expect(() => assertWriterInputCarriesNoLiveState(input)).not.toThrow();
  });
});

describe('Stage 3 — a design with no usable image writes exactly as it did before', () => {
  it('sends the text-only request, byte for byte, when the library holds nothing usable', async () => {
    const pack = packFor();
    const before = [];

    // THE PRE-STAGE-3 PATH: a caller that reads no visual context at all. This is
    // the request the writer has always been sent.
    const unchanged = await runReportDesignIntent({
      flag: { enabled: true, model: 'injected-test-model' },
      versionIds: [VERSION_ID],
      sourceFingerprints: FINGERPRINTS,
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      invokeLLM: async (request) => { before.push(request); return injectedOutput({ pack, text: ACCEPTED_TEXT }); },
      validate: injectedValidator,
    });

    // THE STAGE 3 PATH against an empty library.
    const captured = [];
    const attempt = await attemptWith({ pack, assets: [], captured });
    const request = captured[0];

    // No attachment field at all, so the request is exactly the one that predates
    // images, and the writer input is the same agreement it has always been.
    expect(before).toHaveLength(1);
    expect('file_urls' in request).toBe(false);
    expect(request).toEqual(before[0]);
    expect(attempt.input_fingerprint).toBe(unchanged.input_fingerprint);

    // And no visual identity was frozen, because none was read.
    expect(attempt.record.visual_fingerprint).toBeNull();
    expect(attempt.record.visual_context).toBeNull();
    expect(attempt.ok).toBe(true);
  });

  it('leaves the writer input unchanged, fingerprint included, when the selection is unusable', () => {
    const pack = packFor();
    const plain = buildDesignIntentWriterInput({ pack });

    // Only unusable images: a plan, a hidden file and an offered option.
    const unusable = [
      image({ id: 'p', asset_type: 'plan', file_url: `${HOST}/p.jpg`, image_purpose: 'layout_drawing' }),
      image({ id: 'h', file_url: `${HOST}/h.jpg`, usage: 'do_not_use' }),
      image({ id: 'o', file_url: `${HOST}/o.jpg`, seating_style: 'recliner' }),
    ];
    const refused = contextFor(unusable);
    expect(refused.available).toBe(false);

    const built = buildDesignIntentWriterInput({ pack, visualContext: refused });
    expect(built.design_visual_context).toBeUndefined();
    expect(built.input_fingerprint).toBe(plain.input_fingerprint);
  });

  it('writes the narrative without pictures when the library cannot be read at all', async () => {
    const pack = packFor();

    const attempt = await runReportDesignIntent({
      flag: { enabled: true, model: 'injected-test-model' },
      versionIds: [VERSION_ID],
      sourceFingerprints: FINGERPRINTS,
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      // The library read throws: a report must keep working.
      readVisualContext: async () => { throw new Error('The library is unavailable.'); },
      invokeLLM: async () => injectedOutput({ pack, text: ACCEPTED_TEXT }),
      validate: injectedValidator,
    });

    expect(attempt.ok).toBe(true);
    expect(attempt.text).toBe(ACCEPTED_TEXT);
    expect(attempt.record.visual_fingerprint).toBeNull();
  });
});

describe('Stage 4 — the accepted words are bound to the images they were written from', () => {
  it('saves the identity of the selection, never a storage address', async () => {
    const pack = packFor();
    const attempt = await attemptWith({ pack, assets: genesisLibrary() });

    const record = attempt.record;
    expect(record.visual_context.images).toHaveLength(4);
    expect(record.visual_context.images[0]).toMatchObject({
      id: 'g-cover',
      file: '1a2b3c4d_genesis-cover.jpg',
      role: 'whole_room',
      caption: 'The finished cinema, seen from the rear row',
    });
    expect(record.visual_context.images[3]).toMatchObject({
      id: 'g-v1-detail',
      role: 'interior_detail',
      purpose: 'interior_detail',
    });

    // Nothing saved here can depend on a link that expires or moves.
    expect(JSON.stringify(record)).not.toContain('http');
    expect(JSON.stringify(record)).not.toContain('files.soundproof.test');
  });

  it('restores the accepted narrative for the same evidence, geometry and image set', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const context = contextFor(assets);
    const attempt = await attemptWith({ pack, assets });

    // Stored and read back exactly as the report stores it: JSON.
    const stored = JSON.parse(JSON.stringify(attempt.record));
    const current = contextFor(assets).fingerprint;

    expect(readAcceptedDesignIntent(stored, FINGERPRINTS, {
      currentVisualFingerprint: current,
    })).toMatchObject({ displayable: true, reason: null, text: ACCEPTED_TEXT });

    expect(resolveDesignIntent({
      deterministic: 'The report’s own Design Intent.',
      saved: stored,
      currentSourceFingerprints: FINGERPRINTS,
      currentVisualFingerprint: current,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.ASTRA, reason: null, text: ACCEPTED_TEXT });

    // The selection the words were written from is the one the record states.
    expect(context.fingerprint).toBe(attempt.record.visual_fingerprint);
  });

  it('invalidates the narrative when a render is replaced, and not when a URL is merely re-signed', async () => {
    const pack = packFor();
    const assets = genesisLibrary();
    const attempt = await attemptWith({ pack, assets });
    const written = attempt.record.visual_fingerprint;

    // A re-signed or moved link for the SAME file: the identity is unchanged, because
    // identity is never built from the address.
    const resigned = assets.map((asset) => (asset.id === 'g-cover'
      ? { ...asset, file_url: `${HOST}/private/1a2b3c4d_genesis-cover.jpg?token=abc&expires=999` }
      : asset));
    expect(contextFor(resigned).fingerprint).toBe(written);

    // The designer replaces the cover with ANOTHER FILE OF THE SAME NAME. The upload
    // is a different file, so the name it is stored under differs and the identity
    // changes with it.
    const replaced = assets.map((asset) => (asset.id === 'g-cover'
      ? { ...asset, file_url: `${HOST}/public/77aa88bb_genesis-cover.jpg` }
      : asset));
    const moved = contextFor(replaced).fingerprint;
    expect(moved).not.toBe(written);

    // The saved narrative described the images that used to stand for this design.
    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS, {
      currentVisualFingerprint: moved,
    })).toMatchObject({ displayable: false, reason: 'visual_context_moved', text: null });
    expect(resolveDesignIntent({
      deterministic: 'The report’s own Design Intent.',
      saved: attempt.record,
      currentSourceFingerprints: FINGERPRINTS,
      currentVisualFingerprint: moved,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, reason: 'visual_moved' });

    // A caption rewritten, or a different image chosen, moves it too.
    expect(contextFor(assets.map((asset) => (asset.id === 'g-room-2'
      ? { ...asset, caption: 'Screen wall, front stage and equipment' }
      : asset))).fingerprint).not.toBe(written);
    expect(contextFor(assets.slice(0, 5)).fingerprint).not.toBe(written);
  });

  it('never hides a narrative written without pictures, and never hides one for a reason the page cannot state', async () => {
    const pack = packFor();

    // Written from the frozen evidence alone: it is pinned to no image set.
    const noImages = await attemptWith({ pack, assets: [] });
    expect(noImages.record.visual_fingerprint).toBeNull();
    expect(readAcceptedDesignIntent(noImages.record, FINGERPRINTS, {
      currentVisualFingerprint: 'vc1-anything-00',
    }).displayable).toBe(true);

    // A page whose library could not be read states no current selection, so a
    // narrative is never hidden for a reason nobody can state.
    const withImages = await attemptWith({ pack, assets: genesisLibrary() });
    expect(readAcceptedDesignIntent(withImages.record, FINGERPRINTS, {
      currentVisualFingerprint: null,
    }).displayable).toBe(true);

    // The evidence rule still decides on its own.
    expect(readAcceptedDesignIntent(withImages.record, {
      ...FINGERPRINTS,
      engineeringFingerprint: 'eng:changed',
    }, { currentVisualFingerprint: withImages.record.visual_fingerprint }))
      .toMatchObject({ displayable: false, reason: 'evidence_moved:engineeringFingerprint' });
    // The geometry rule still decides on its own.
    expect(readAcceptedDesignIntent(withImages.record, FINGERPRINTS, {
      currentGeometryFingerprint: 'rg1-changed-00',
      currentVisualFingerprint: withImages.record.visual_fingerprint,
    })).toMatchObject({ displayable: false, reason: 'geometry_moved' });
  });
});

describe('Stage 3 — the engineering remains the only authority, and its validation is unchanged', () => {
  it('refuses a draft that does not match the frozen pack, with images attached', async () => {
    const pack = packFor();

    const attempt = await runReportDesignIntent({
      flag: { enabled: true, model: 'injected-test-model' },
      versionIds: [VERSION_ID],
      sourceFingerprints: FINGERPRINTS,
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      visualContext: contextFor(genesisLibrary()),
      // The REAL validator, and a draft whose pack fingerprint is not this pack's.
      invokeLLM: async () => ({
        contract_version: 2,
        pack_fingerprint: 'not-this-pack',
        sections: [{ section: DESIGN_INTENT_SECTION, text: ACCEPTED_TEXT, claim_ids: [] }],
      }),
    });

    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe(DESIGN_INTENT_REFUSAL.VALIDATION_FAILED);
    expect(attempt.text).toBeNull();
    // Nothing was written, and the reason is the real validator's own.
    expect(attempt.record.text).toBeNull();
    expect(attempt.record.status).toBe('rejected');
    expect(JSON.stringify(attempt.validation_errors)).toContain('pack_fingerprint_mismatch');
    // What the attempt READ is still recorded, even though nothing was accepted.
    expect(attempt.record.visual_fingerprint).not.toBeNull();
  });

  it('holds the visual block to the same validator the draft is held to', () => {
    const pack = packFor();
    const input = buildDesignIntentWriterInput({ pack, visualContext: contextFor(genesisLibrary()) });

    const refused = validateWriterOutput({
      input,
      output: {
        contract_version: input.contract_version,
        pack_fingerprint: 'not-this-pack',
        sections: [{ section: DESIGN_INTENT_SECTION, text: ACCEPTED_TEXT, claim_ids: [] }],
      },
    });
    expect(refused.valid).toBe(false);
    expect(JSON.stringify(refused.violations)).toContain('pack_fingerprint_mismatch');

    // The image context adds no claim, no section and no exemption of its own.
    expect(input.section_requirements).toHaveLength(1);
    expect(input.section_requirements[0].section).toBe(DESIGN_INTENT_SECTION);
    expect(JSON.stringify(input).includes('design_visual_context')).toBe(true);
  });
});

describe('Stage 3 + 4 — the accepted words reach the report and the printed document', () => {
  /** The report page's own inputs, kept minimal: this test is about the intent block. */
  const summaryProps = {
    projectDetails: { dolby_config: '9.4.6' },
    roomDims: { widthM: 5.18, lengthM: 7.29, heightM: 2.8 },
    seatingPositions: [{ id: 'seat-1', row: 1, x: 2.6, y: 4.1 }],
    productsSelected: { rows: [] },
    opening: { headline: 'A cinema that fits the room', supportingLine: 'Nine seats, 9.4.6.' },
    projectId: 'project-1',
    versionId: VERSION_ID,
  };

  it('prints the accepted narrative in exactly one intent block, on screen and on paper', async () => {
    const pack = packFor();
    const attempt = await attemptWith({ pack, assets: genesisLibrary() });
    const saved = JSON.parse(JSON.stringify(attempt.record));

    const resolved = resolveDesignIntent({
      deterministic: 'The report’s own Design Intent.',
      saved,
      currentSourceFingerprints: FINGERPRINTS,
      currentVisualFingerprint: contextFor(genesisLibrary()).fingerprint,
    });
    expect(resolved.source).toBe(DESIGN_INTENT_SOURCE.ASTRA);

    const screen = renderToStaticMarkup(
      React.createElement(ProjectReportDesignSummary, { ...summaryProps, summaryOpening: resolved.text, print: false }),
    );
    const paper = renderToStaticMarkup(
      React.createElement(ProjectReportDesignSummary, { ...summaryProps, summaryOpening: resolved.text, print: true }),
    );

    // The accepted words are on the page the designer reads AND in the document
    // that is exported.
    expect(screen).toContain(ACCEPTED_TEXT);
    expect(paper).toContain(ACCEPTED_TEXT);

    // ONE block, in both: the visual context adds no page, no heading and no repeat.
    expect(screen.split('Design Intent').length - 1).toBe(1);
    expect(paper.split('Design Intent').length - 1).toBe(1);
    expect(paper.split(ACCEPTED_TEXT).length - 1).toBe(1);

    // The screen-only generation action is never part of the printed document.
    expect(screen).toContain('Rewrite Design Intent');
    expect(paper).not.toContain('Rewrite Design Intent');
    expect(paper).not.toContain('Help ADI understand your design');

    // Every other fact on the page is untouched by which intent is shown.
    const withDeterministic = renderToStaticMarkup(
      React.createElement(ProjectReportDesignSummary, {
        ...summaryProps,
        summaryOpening: 'The report’s own Design Intent.',
        print: true,
      }),
    );
    expect(withDeterministic).toContain('Project Summary');
    expect(withDeterministic).toContain('5.18 × 7.29 × 2.80 m (W × L × H)');
    expect(paper).toContain('5.18 × 7.29 × 2.80 m (W × L × H)');
    expect(paper.split('Project Summary').length).toBe(withDeterministic.split('Project Summary').length);
  });
});