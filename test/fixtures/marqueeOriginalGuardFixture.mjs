/**
 * marqueeOriginalGuardFixture.mjs (test fixture)
 * ---------------------------------------------
 * THE FROZEN MARQUEE ORIGINAL CASE — the minimum evidence the guard suite needs.
 *
 * Marquee Home / Original Design is a 100" TV, a 5.1 system approach, a rear
 * SUB2-12 pair, the ranked stories the failed generation carried, and the scoped
 * seat results behind them. Nothing here is calculated and nothing is invented:
 * every claim ID is one the evidence pack itself mints from this frozen input,
 * and the draft below is only the wording those claims support.
 */

import { buildProposalEvidence } from '../../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { option, seatScopes } from './proposalEvidenceFixtures.mjs';

export const MARQUEE_GENERATED_AT = '2026-10-14T21:42:07.437Z';

/** The frozen Marquee version: 100" TV, 5.1, SUB2-12 pair, L4 technical results. */
export function marqueeVersion() {
  return option('a', {
    savedName: 'Original Design',
    liveName: 'Original Design',
    screen: '100" TV',
    layout: '5.1',
    subwoofers: 'SUB2-12 x 2',
    levels: { 4: 'L4', 6: 'L4', 12: 'L4', 13: 'L4', 14: 'L4', 18: 'L2', 19: 'L4', 20: 'L4' },
    values: {
      4: '+/-0.5 dB', 6: '+/-1.5 dB', 12: '112 dBC', 13: '108 dBC',
      14: '115 dB', 18: '26 Hz', 19: '+/-1 dB', 20: '+/-3 dB',
    },
    seatScopes: seatScopes({
      primary: { p4: 'L4', p6: 'L4', p19: 'L4', p20: 'L4' },
      secondary: { p4: 'L4', p6: 'L2', p19: 'L1', p20: 'L1' },
      primarySeats: 2,
      secondarySeats: 2,
    }),
  });
}

/** The claim identities the guards turn on, as the pack mints them. */
export const MARQUEE_CLAIMS = Object.freeze({
  spatial: 'claim_story_spatial-resolution_01',
  bass: 'claim_story_bass-extension-and-response_01',
  tonal: 'claim_story_tonal-consistency_01',
  lowFrequency: 'claim_story_low-frequency-extension_01',
  p4: 'claim_p4_primary_performance_01',
  p6: 'claim_p6_primary_performance_01',
  p20: 'claim_p20_primary_consistency_01',
});

/** The ranked strength stories the Marquee generation carried, as it carried them. */
const MARQUEE_STORIES = Object.freeze([
  {
    claim_id: MARQUEE_CLAIMS.spatial,
    area: 'spatial_resolution',
    label: 'Spatial resolution',
    kind: 'strength_story',
    statement: 'The loudspeakers hold their recommended geometry, supporting exceptionally precise placement and seamless movement around the room.',
    option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
    favours: false,
    scope: null,
    level: 'L4',
    wording_class: 'strength',
    wording: 'Exceptionally precise placement',
  },
  {
    claim_id: MARQUEE_CLAIMS.bass,
    area: 'bass_extension_and_response',
    label: 'Bass extension and response',
    kind: 'strength_story',
    statement: 'Bass reaches 26 Hz and the modelled response at the reference position is within +/-1 dB, adding scale while remaining remarkably composed.',
    option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
    favours: false,
    scope: null,
    level: 'L4',
    wording_class: 'strength',
    wording: 'Remarkably composed bass',
  },
  {
    claim_id: MARQUEE_CLAIMS.tonal,
    area: 'tonal_consistency',
    label: 'Tonal consistency',
    kind: 'strength_story',
    statement: 'Screen and surround tonal consistency is excellent across the assessed seats.',
    option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
    favours: false,
    scope: null,
    level: 'L4',
    wording_class: 'strength',
    wording: 'Excellent tonal consistency',
  },
  {
    claim_id: MARQUEE_CLAIMS.lowFrequency,
    area: 'bass_extension',
    label: 'Low-frequency extension',
    kind: 'strength_story',
    statement: 'The system reaches 26 Hz in the room: deep bass that adds scale, impact and excitement to films and music.',
    option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
    favours: false,
    scope: null,
    level: 'L2',
    wording_class: 'strength',
    wording: 'Deep bass that adds scale, impact and excitement to films and music.',
  },
]);

/**
 * The frozen Marquee evidence pack: the saved-report evidence, plus the ranked
 * stories and scoped seat results the generation was written from.
 */
export function marqueePack(narrativeContext = null) {
  const pack = buildProposalEvidence({
    versions: [marqueeVersion()],
    generatedAt: MARQUEE_GENERATED_AT,
    narrativeContext,
  });
  pack.allowed_claims.push(...MARQUEE_STORIES.map((story) => ({ ...story })));
  return pack;
}

/** Marquee Home's equipment package: three front channels, two surrounds, two subs. */
export const MARQUEE_EQUIPMENT = Object.freeze([
  { role: 'Front left', model: 'EVOLVE 3-1', qty: 1 },
  { role: 'Front right', model: 'EVOLVE 3-1', qty: 1 },
  { role: 'Centre', model: 'C4-1', qty: 1 },
  { role: 'Side surrounds', model: 'EVOLVE 2-1', qty: 2 },
  { role: 'Rear subwoofers', model: 'SUB2-12', qty: 2 },
]);

const APPENDIX_NOTE = 'Sources: the Visual Report and the Technical Report saved for each option. '
  + 'Every figure in this proposal is quoted from those reports.';

/**
 * The wording the frozen Marquee pack supports, section by section: one coherent
 * story about this cinema, every sentence grounded by the claims it cites, no
 * seating narrative, no projection wording, and the pack's own figures.
 *
 * The seat-scope citation is read from the pack, so the same draft is correct
 * both with the P20 result available and under a seating exclusion that
 * withdraws it.
 */
export function marqueeAcceptanceDraft(input) {
  const c = MARQUEE_CLAIMS;
  const hasSeatScope = input.allowed_claims.some((claim) => claim.claim_id === c.p20);
  return {
    contract_version: input.contract_version,
    pack_fingerprint: input.evidence_pack.pack_fingerprint,
    sections: [
      {
        section: 'decision_summary',
        text: 'This cinema is arranged around a large television and a single loudspeaker system. '
          + 'The display occupies the front wall, the viewing position is set so the distance suits its scale, '
          + 'and the screen channels, the surrounds and the rear subwoofer pair work together as one system. '
          + 'The arrangement keeps dialogue, music and effects in their proper places around the listener.',
        claim_ids: [c.spatial, c.p4],
      },
      {
        section: 'what_stays_same',
        text: 'The room keeps its shape and the layout stays where it is, with the loudspeakers arranged around it. '
          + 'The front channels sit behind the display, the surrounds sit to the sides of the listeners, '
          + 'and the subwoofers work from the rear of the room.',
        claim_ids: [c.p4, c.p6],
      },
      {
        section: 'what_changes',
        text: 'The front stage, the surrounds and the bass are brought into a single loudspeaker family, '
          + 'so every channel speaks with the same voice. The subwoofers take the low-frequency work, '
          + 'leaving the screen channels free to concentrate on dialogue and detail.',
        claim_ids: [c.bass, c.spatial],
      },
      {
        section: 'key_performance_highlights',
        text: 'Exceptionally precise placement, remarkably composed bass and excellent tonal consistency '
          + 'across the listening positions.',
        claim_ids: [c.spatial, c.bass, c.tonal],
      },
      {
        section: 'spatial_resolution',
        text: 'Sound is placed exactly where the action is, moving around and past the listener without ever '
          + 'sounding handed on from one cabinet to the next. The screen channels, the surrounds and the layout '
          + 'were set together, and the loudspeakers hold their recommended geometry throughout.',
        claim_ids: [c.spatial, c.p4],
      },
      {
        section: 'dynamic_range',
        text: 'The quietest atmosphere and the loudest impact both arrive intact. Bass reaches 26 Hz and the '
          + 'modelled response at the reference position stays within +/-1 dB, so demanding passages keep '
          + 'their composure without strain.',
        claim_ids: hasSeatScope ? [c.bass, c.lowFrequency, c.p20] : [c.bass, c.lowFrequency],
      },
      {
        section: 'timbre_matching',
        text: 'Voices, music and effects keep their character as the system hands them from channel to channel, '
          + 'and the tonal balance holds across the listening positions.',
        claim_ids: [c.tonal, c.p6],
      },
      { section: 'presented_options', text: '', claim_ids: [] },
      {
        section: 'overall_design',
        text: 'The finished cinema gives the room a picture and a sound system that belong together: '
          + 'a large television, one loudspeaker family and bass that reaches the deepest parts of a soundtrack.',
        claim_ids: [c.spatial, c.bass],
      },
      { section: 'appendix_notes', text: APPENDIX_NOTE, claim_ids: [] },
    ],
  };
}

export default marqueePack;