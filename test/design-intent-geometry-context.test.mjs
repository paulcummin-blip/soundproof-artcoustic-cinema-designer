/**
 * design-intent-geometry-context.test.mjs
 * ---------------------------------------
 * STAGE 2 — THE FROZEN GEOMETRY CONTEXT, with an injected provider and no live
 * model call anywhere.
 *
 * WHAT THIS PROVES. Before this stage the ADI Design Highlights' seating card had
 * an identity, a claim ID and a published P1 level but no authoritative geometry
 * behind its explanation: the frozen evidence pack carries the published results,
 * not the seat coordinates they were assessed from, so a writer working off the pack
 * could not explain the seating decision in this room's own terms.
 *
 * The geometry the report and its drawings were produced from is now carried as its
 * own block, CONFIRMED against the saved report before it is used, FROZEN with the
 * accepted narrative, and included in the freshness check — so a narrative written
 * before a seat or a wall moved is never presented as current.
 *
 * The provider is injected, so nothing here reaches a model, and the validator is
 * injected so the test is decisive about the WIRING and the geometry rather than
 * about prose quality.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { marqueeVersion, MARQUEE_GENERATED_AT } from './fixtures/marqueeOriginalGuardFixture.mjs';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import { runReportDesignIntent } from '../base44/shared/reportDesignIntent/reportDesignIntentRunner.js';
import { readAcceptedDesignIntent } from '../base44/shared/reportDesignIntent/reportDesignIntentRecord.js';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import { assertWriterInputCarriesNoLiveState } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import {
  GEOMETRY_REFUSAL,
  REPORT_GEOMETRY_CONTEXT_VERSION,
  buildReportGeometryContext,
  liveGeometryFingerprint as liveFingerprintFromServerModule,
} from '../base44/shared/reportDesignIntent/reportGeometryContext.js';
// The frontend reaches the SAME authority through the root `shared/` re-export.
// Reading both here proves the two paths resolve to one implementation.
import { liveGeometryFingerprint as liveFingerprintFromFrontendPath } from '../shared/reportDesignIntent/reportGeometryContext.js';
import { DESIGN_INTENT_SOURCE, resolveDesignIntent } from '../src/components/report/projectReport/designIntentAuthority.js';
import { buildSeatingClearanceStory } from '../shared/strengthStories.js';

const AT = MARQUEE_GENERATED_AT;

const FINGERPRINTS = {
  engineeringFingerprint: 'eng:geometry-stage-2',
  calculationFingerprint: 'calc:geometry-stage-2',
  seatPriorityFingerprint: 'seat:geometry-stage-2',
};

const readFixture = (name) => JSON.parse(
  readFileSync(fileURLToPath(new URL(`../src/test/fixtures/${name}`, import.meta.url)), 'utf8'),
);

const genesis = readFixture('genesisReportEvidence.json');
const marquee = readFixture('marqueeReportEvidence.json');

/** The seats the saved report places, in the shape a saved version stores them. */
function versionSeatsFrom(evidence) {
  return (evidence?.seating?.per_seat || [])
    .filter((seat) => seat?.position && Number.isFinite(Number(seat.position.x_m)))
    .map((seat) => ({
      id: seat.seat_id,
      row: seat.row,
      x: seat.position.x_m,
      y: seat.position.y_m,
    }));
}

/** A saved version whose design state holds the geometry the report was produced from. */
function savedVersion(evidence, { moveSeatId = null, shiftM = 0 } = {}) {
  const seats = versionSeatsFrom(evidence).map((seat) => (
    seat.id === moveSeatId ? { ...seat, x: Number(seat.x) + shiftM } : seat
  ));
  return {
    id: 'version-1',
    version_number: 1,
    version_name: 'Original Design',
    design_state: {
      roomDims: {
        widthM: evidence.room.width_m,
        lengthM: evidence.room.length_m,
        heightM: evidence.room.height_m,
      },
      seating_positions: seats,
    },
  };
}

function contextFor(evidence, { moveSeatId = null, shiftM = 0 } = {}) {
  return buildReportGeometryContext({
    reportEvidence: evidence,
    version: savedVersion(evidence, { moveSeatId, shiftM }),
    projectId: 'project-1',
    versionId: 'version-1',
    reportSnapshotId: 'snapshot-1',
  });
}

/** The live side, exactly as the report page reads it: the design's own geometry. */
const liveInput = (evidence) => ({
  roomDims: {
    widthM: evidence.room.width_m,
    lengthM: evidence.room.length_m,
    heightM: evidence.room.height_m,
  },
  seatingPositions: versionSeatsFrom(evidence),
});

/** The injected provider's draft: one valid Design Intent section, no live call. */
function injectedOutput({ pack, text }) {
  return {
    contract_version: 2,
    pack_fingerprint: pack.pack_fingerprint,
    sections: [{ section: DESIGN_INTENT_SECTION, text, claim_ids: [] }],
  };
}

/** The injected validator: the wiring and the geometry are under test, not the prose rules. */
const injectedValidator = () => ({ valid: true, violations: [], output: null });

const ACCEPTED_TEXT = 'This cinema is arranged around the room the seats actually stand in. '
  + 'The seating answers to the picture, the loudspeakers and the space the client wants to keep, '
  + 'and the distance the seats hold from the walls is part of that balance rather than an afterthought.';

describe('Stage 2 — the frozen geometry context', () => {
  it('reads the geometry the saved report was produced from, and keeps the two seating measurements apart', () => {
    const context = contextFor(genesis);
    const marqueeContext = contextFor(marquee);

    console.log('[geometry] Genesis', JSON.stringify({
      available: context.available,
      room: context.room,
      seats: context.seats.length,
      nearest_boundary_m: context.boundary?.nearest_boundary_m,
      nearest_boundary: context.boundary?.nearest_boundary,
      rear_row_rear_wall_m: context.boundary?.rear_row_rear_wall_m,
      clearance: context.boundary?.clearance,
      rear_clearance: context.boundary?.rear_clearance,
      agreement: context.agreement,
      fingerprint: context.fingerprint,
    }));
    console.log('[geometry] Marquee', JSON.stringify({
      available: marqueeContext.available,
      room: marqueeContext.room,
      seats: marqueeContext.seats.length,
      nearest_boundary_m: marqueeContext.boundary?.nearest_boundary_m,
      rear_row_rear_wall_m: marqueeContext.boundary?.rear_row_rear_wall_m,
      clearance: marqueeContext.boundary?.clearance,
      agreement: marqueeContext.agreement,
      fingerprint: marqueeContext.fingerprint,
    }));

    expect(context.version).toBe(REPORT_GEOMETRY_CONTEXT_VERSION);
    expect(context.available).toBe(true);
    expect(context.reason).toBeNull();
    expect(context.seats).toHaveLength(genesis.seating.per_seat.length);
    expect(context.room.width_m).toBe(genesis.room.width_m);
    expect(context.room.length_m).toBe(genesis.room.length_m);

    // The nearest boundary is a real distance, and the rear-wall clearance is carried
    // as its own measurement rather than inferred from it.
    expect(typeof context.boundary.nearest_boundary_m).toBe('number');
    expect(context.boundary.rear_row_rear_wall_m === null
      || typeof context.boundary.rear_row_rear_wall_m === 'number').toBe(true);
    expect(context.boundary.nearest_boundary_m)
      .toBeLessThanOrEqual(context.boundary.closest_rear_wall_m + 0.001);

    // The version the report was generated from agrees with the report itself.
    expect(context.agreement.checked).toBe(true);
    expect(context.agreement.agrees).toBe(true);

    // Both projects are real rooms with real seating, and two different identities.
    expect(marqueeContext.available).toBe(true);
    expect(context.fingerprint).toMatch(/^rg1-/);
    expect(context.fingerprint).not.toBe(marqueeContext.fingerprint);
  });

  it('refuses the geometry when the saved version no longer matches the room the report describes', () => {
    const moved = contextFor(genesis, { moveSeatId: 'seat-r1-c1', shiftM: 0.5 });

    expect(moved.available).toBe(false);
    expect(moved.reason).toBe(GEOMETRY_REFUSAL.VERSION_MOVED);
    expect(moved.fingerprint).toBeNull();
    expect(moved.agreement.agrees).toBe(false);
    expect(moved.agreement.seating).toBe('mismatch');
  });

  it('refuses the geometry when the saved report states none', () => {
    const noRoom = buildReportGeometryContext({
      reportEvidence: { seating: genesis.seating },
      version: savedVersion(genesis),
      projectId: 'project-1',
      versionId: 'version-1',
    });
    expect(noRoom.available).toBe(false);
    expect(noRoom.reason).toBe(GEOMETRY_REFUSAL.NO_REPORT_GEOMETRY);
    expect(noRoom.fingerprint).toBeNull();
  });

  it('fingerprints the frozen geometry and the design on screen through ONE authority', () => {
    const context = contextFor(genesis);
    const { roomDims, seatingPositions } = liveInput(genesis);

    // Identical geometry, reached from the server module and from the frontend path.
    expect(liveFingerprintFromServerModule({ roomDims, seatingPositions })).toBe(context.fingerprint);
    expect(liveFingerprintFromFrontendPath({ roomDims, seatingPositions })).toBe(context.fingerprint);

    // One seat moves: the design on screen no longer matches the narrative's geometry.
    const movedLive = seatingPositions.map((seat) => (
      seat.id === 'seat-r1-c1' ? { ...seat, x: Number(seat.x) + 0.5 } : seat
    ));
    expect(liveFingerprintFromServerModule({ roomDims, seatingPositions: movedLive }))
      .not.toBe(context.fingerprint);

    // A wall moves: the room's own dimensions are part of the same identity.
    expect(liveFingerprintFromServerModule({
      roomDims: { ...roomDims, lengthM: Number(roomDims.lengthM) + 0.4 },
      seatingPositions,
    })).not.toBe(context.fingerprint);
  });

  it('carries the geometry as its own writer block, beside the frozen evidence and outside the live-state guard', () => {
    const pack = buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });
    const context = contextFor(genesis);

    const input = buildDesignIntentWriterInput({ pack, geometryContext: context });
    const block = input.design_geometry_context;

    expect(block.available).toBe(true);
    expect(block.fingerprint).toBe(context.fingerprint);
    expect(block.room.width_m).toBe(genesis.room.width_m);
    expect(block.seats).toHaveLength(genesis.seating.per_seat.length);
    expect(block.seating_position.nearest_boundary_m).toBe(context.boundary.nearest_boundary_m);
    // The two measurements are stated separately, and the block says so.
    expect(block.two_measurements_rule).toContain('nearest boundary');
    // The frozen pack is untouched: the geometry is a sibling of it, never inside it.
    expect(input.evidence_pack.pack_fingerprint).toBe(pack.pack_fingerprint);

    // The writer input still proves it carries the evidence and the contract only.
    expect(() => assertWriterInputCarriesNoLiveState(input)).not.toThrow();
  });

  it('leaves a writer input built with no geometry byte-identical to the input that predates this block', () => {
    const pack = buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });
    const plain = buildDesignIntentWriterInput({ pack });
    expect(plain.design_geometry_context).toBeUndefined();

    // A context that could not be confirmed supplies no block at all.
    const unconfirmed = buildDesignIntentWriterInput({
      pack,
      geometryContext: contextFor(genesis, { moveSeatId: 'seat-r1-c1', shiftM: 0.5 }),
    });
    expect(unconfirmed.design_geometry_context).toBeUndefined();
    expect(unconfirmed.input_fingerprint).toBe(plain.input_fingerprint);
  });

  it('writes an accepted narrative with the geometry frozen beside it, and only via the injected provider', async () => {
    const pack = buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });
    const context = contextFor(genesis);
    let providerCalls = 0;

    const attempt = await runReportDesignIntent({
      flag: { enabled: true, model: 'injected-test-model' },
      versionIds: ['version-1'],
      sourceFingerprints: FINGERPRINTS,
      project: { id: 'project-1' },
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      readGeometryContext: async ({ evidence }) => {
        expect(evidence).toHaveLength(1);
        return context;
      },
      invokeLLM: async ({ prompt, response_json_schema }) => {
        providerCalls += 1;
        // The prompt the provider was sent carries the geometry, and names why.
        expect(typeof prompt).toBe('string');
        expect(prompt).toContain('design_geometry_context');
        expect(prompt).toContain(context.fingerprint);
        expect(response_json_schema.type).toBe('object');
        return injectedOutput({ pack, text: ACCEPTED_TEXT });
      },
      validate: injectedValidator,
    });

    expect(providerCalls).toBe(1);
    expect(attempt.ok).toBe(true);
    expect(attempt.text).toBe(ACCEPTED_TEXT);
    expect(attempt.record.status).toBe('accepted');
    // The geometry the explanation was written from is frozen with the words.
    expect(attempt.record.geometry_fingerprint).toBe(context.fingerprint);
    expect(attempt.record.evidence_fingerprints).toMatchObject(FINGERPRINTS);
  });

  it('writes exactly as before when no geometry can be confirmed, and freezes none', async () => {
    const pack = buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });

    const attempt = await runReportDesignIntent({
      flag: { enabled: true, model: 'injected-test-model' },
      versionIds: ['version-1'],
      sourceFingerprints: FINGERPRINTS,
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      readGeometryContext: async () => contextFor(genesis, { moveSeatId: 'seat-r1-c1', shiftM: 0.5 }),
      invokeLLM: async () => injectedOutput({ pack, text: ACCEPTED_TEXT }),
      validate: injectedValidator,
    });

    expect(attempt.ok).toBe(true);
    expect(attempt.record.geometry_fingerprint).toBeNull();
    expect(attempt.geometry_fingerprint).toBeNull();
  });

  it('never presents a narrative written in one arrangement as current in another', async () => {
    const pack = buildProposalEvidence({ versions: [marqueeVersion()], generatedAt: AT });
    const context = contextFor(genesis);

    const attempt = await runReportDesignIntent({
      flag: { enabled: true, model: 'injected-test-model' },
      versionIds: ['version-1'],
      sourceFingerprints: FINGERPRINTS,
      now: AT,
      readEvidence: async () => [marqueeVersion()],
      geometryContext: context,
      invokeLLM: async () => injectedOutput({ pack, text: ACCEPTED_TEXT }),
      validate: injectedValidator,
    });
    expect(attempt.ok).toBe(true);

    const { roomDims, seatingPositions } = liveInput(genesis);
    const current = liveFingerprintFromServerModule({ roomDims, seatingPositions });

    // The design still holds the geometry the narrative was written from.
    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS, {
      currentGeometryFingerprint: current,
    }).displayable).toBe(true);
    expect(resolveDesignIntent({
      deterministic: 'The report’s own Design Intent.',
      saved: attempt.record,
      currentSourceFingerprints: FINGERPRINTS,
      currentGeometryFingerprint: current,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.ASTRA, reason: null });

    // A seat moves: the narrative explains seating the design no longer has.
    const movedSeats = seatingPositions.map((seat) => (
      seat.id === 'seat-r1-c2' ? { ...seat, x: Number(seat.x) - 0.6 } : seat
    ));
    const moved = liveFingerprintFromServerModule({ roomDims, seatingPositions: movedSeats });
    expect(moved).not.toBe(current);

    expect(readAcceptedDesignIntent(attempt.record, FINGERPRINTS, {
      currentGeometryFingerprint: moved,
    })).toMatchObject({ displayable: false, reason: 'geometry_moved', text: null });
    expect(resolveDesignIntent({
      deterministic: 'The report’s own Design Intent.',
      saved: attempt.record,
      currentSourceFingerprints: FINGERPRINTS,
      currentGeometryFingerprint: moved,
    })).toMatchObject({ source: DESIGN_INTENT_SOURCE.DETERMINISTIC, reason: 'geometry_moved' });

    // The evidence freshness rule is unchanged and still decides on its own.
    expect(readAcceptedDesignIntent(attempt.record, {
      ...FINGERPRINTS,
      engineeringFingerprint: 'eng:changed',
    }, { currentGeometryFingerprint: current }))
      .toMatchObject({ displayable: false, reason: 'evidence_moved:engineeringFingerprint' });

    // A narrative written before geometry was frozen is never hidden for it.
    expect(readAcceptedDesignIntent({ ...attempt.record, geometry_fingerprint: null }, FINGERPRINTS, {
      currentGeometryFingerprint: moved,
    }).displayable).toBe(true);
  });

  it('explains the Genesis seating decision from its own geometry, and never presents L1 as generous clearance', () => {
    // Genesis P1 is L1 at its weakest assessed seat, and the highlight authority
    // states the seating card on every design whose evidence carries a P1 result.
    const story = buildSeatingClearanceStory({
      roomDims: { widthM: genesis.room.width_m, lengthM: genesis.room.length_m },
      seatingPositions: versionSeatsFrom(genesis),
    }, { byKey: { p1: { level: 'L1', value: '0.71m', label: 'Seating distance from the room boundaries' } } });

    console.log('[geometry] Genesis seating card', JSON.stringify({
      title: story?.title,
      level: story?.level,
      evidence: story?.evidence,
      explanation: story?.explanation,
    }));

    expect(story).not.toBeNull();
    expect(story.id).toBe('seating-clearance');
    // The published result is stated as its own, and claimed as no positive result.
    expect(story.level).toBe('L1');
    expect(story.sources).toEqual([]);
    // The copy states this room's practical position, never a claim of generous
    // clearance beside a published result that is the lowest passing level.
    expect(String(story.title).toLowerCase()).not.toContain('clear of the room');
    expect(String(story.explanation).toLowerCase()).not.toMatch(/generous|held clear/);
  });
});