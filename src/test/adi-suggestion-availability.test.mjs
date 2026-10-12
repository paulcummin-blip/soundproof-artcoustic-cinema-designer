/**
 * ADI suggestion availability — acceptance suite.
 * -----------------------------------------------
 * The Client Brief examples are ALWAYS on screen: general examples the instant
 * the step opens, project-specific examples the instant this version's frozen
 * evidence is readable. Nothing about the suggestion area waits on a model, and
 * the background refinement can only ADD examples.
 *
 * A. general examples appear immediately
 * B. frozen evidence produces project-specific examples
 * C. the examples do not wait for an LLM
 * D. six examples, one per narrative area, in priority order
 * E. no invented facts, no bass claim from subwoofer quantity
 * F. a late refinement preserves the designer's selected chips
 * G. a failed or timed-out refinement preserves the examples
 * H. stable evidence identity prevents request loops
 * I. project/version changes discard a stale response
 * J. the Client Brief text is never overwritten; Next is never gated
 *
 * The Genesis and Marquee cases run the REAL path: the project and version
 * records and the engineering publication are the live ones read from the
 * database (src/test/fixtures/*LiveDesign.json), merged and frozen through the
 * same snapshot builder the wizard uses. Nothing is generated, nothing is
 * written, no model is called.
 *
 * Run: npx vitest run src/test/adi-suggestion-availability.test.mjs
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  COMPARISON_GENERAL_EXAMPLES,
  EVIDENCE_SUGGESTION_LIMIT,
  GENERAL_EXAMPLES,
  GENERAL_NOTICE,
  buildEvidenceSuggestions,
  mergeSuggestions,
  pruneSelection,
} from '../components/proposal/wizard/adiEvidenceSuggestions.js';
import { buildEngineeringSnapshot } from '../components/proposal/engineeringAuthority/buildEngineeringSnapshot.js';
import { mergeProjectAndVersion } from '../lib/versionAuthority.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const CHIPS = source('../components/proposal/wizard/AdiSuggestionChips.jsx');
const EVIDENCE = source('../components/proposal/wizard/adiEvidenceSuggestions.js');
const BRIEF_STEP = source('../components/proposal/wizard/ClientBriefStep.jsx');
const WIZARD = source('../components/proposal/CreateProposalWizard.jsx');

/** The live published designs, captured from the database. */
const GENESIS = fixture('genesisLiveDesign.json');
const MARQUEE = fixture('marqueeLevel4LiveDesign.json');

/** The publication each fixture is, so this suite can never drift onto another. */
const GENESIS_FINGERPRINT = 'eng:v1:5739e42a60819e44';
const MARQUEE_FINGERPRINT = 'eng:v1:bcd7564a7c3136f8';

/** The frozen Engineering Snapshot, built exactly as the wizard builds it. */
function liveSnapshot(design) {
  const { project, version, engineering_summary: engineeringSummary } = design;
  const mergedProject = mergeProjectAndVersion(project, version);
  return buildEngineeringSnapshot({
    projectId: project.id,
    versionId: version.id,
    project,
    version,
    mergedProject,
    engineeringSummary,
    seats: version.design_state?.seating_positions || [],
    placedSpeakers: version.design_state?.spl_speaker_nodes || [],
    priceCalculation: null,
  });
}

const genesisSnapshot = liveSnapshot(GENESIS);
const marqueeSnapshot = liveSnapshot(MARQUEE);

const labelsFor = (snapshot) => buildEvidenceSuggestions({ snapshot, proposalType: 'single' });

/** The live designs' exact six examples, as displayed. */
const GENESIS_EXPECTED = [
  'Emphasise the 115" TV',
  'Explain front-row and rear-row viewing differences',
  'Explain the 9.1.6 system layout',
  'Show the L2 Screen Dynamic Range result',
  'Explain the overhead loudspeaker arrangement and what its assessed spacing means for this room',
  'Explain the L4 screen timbre result',
];

const MARQUEE_EXPECTED = [
  'Emphasise the 170 inch 2.35:1 screen',
  'Explain front-row and rear-row viewing differences',
  'Explain the 9.1.6 system layout',
  'Show the L4 Screen Dynamic Range result',
  'Explain the overhead loudspeaker arrangement and what its assessed spacing means for this room',
  'Explain the L4 screen timbre result',
];

/** A snapshot carrying one assessed result, for the rule-by-rule cases. */
function snapshotWith(parameterHeadlines, extra = {}) {
  return {
    available: true,
    room: { seating: { total_seats: 8, row_count: 2 }, screen: { size_inches: 170, aspect_ratio: '2.35:1' } },
    system: { configuration: { dolby_config: '9.1.6' }, channel_layout: { total_discrete: 15 } },
    rp22: { parameter_headlines: parameterHeadlines },
    viewing: { available: true },
    seats: [{ id: 'a' }, { id: 'b' }],
    ...extra,
  };
}

describe('A. the general examples are available immediately', () => {
  it('are built with no evidence at all, and say so', () => {
    const built = buildEvidenceSuggestions({ snapshot: null, proposalType: 'single' });

    expect(built.suggestions).toEqual([]);
    expect(built.evidenceBacked).toBe(false);
    // The examples the component shows in that state are the general set,
    // labelled so they can never be read as this design's facts.
    expect(GENERAL_EXAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(GENERAL_NOTICE).toMatch(/not based on this project/i);
  });

  it('offers comparison prompts before the versions are readable', () => {
    const built = buildEvidenceSuggestions({ snapshot: null, versionSnapshots: [], proposalType: 'comparison' });

    expect(built.evidenceBacked).toBe(false);
    expect(COMPARISON_GENERAL_EXAMPLES.length).toBeGreaterThanOrEqual(6);
  });

  it('shows the examples from the first render — there is no loading gate', () => {
    // The chips are rendered unconditionally, from the synchronous build.
    expect(CHIPS).toContain('const baseChips = evidence.evidenceBacked');
    expect(CHIPS).toContain('generalChips.map');
    expect(CHIPS).toMatch(/<div className="flex flex-wrap gap-2">\{chips\.map\(renderChip\)\}/);
    // No loading state exists that could hide them.
    expect(CHIPS).not.toContain('const busy =');
    expect(CHIPS).not.toContain('setLoading');
    expect(CHIPS).not.toMatch(/animate-spin/);
    expect(CHIPS).not.toMatch(/\bLoading\b/);
    expect(CHIPS).not.toMatch(/if \(busy\)/);
  });
});

describe('B. frozen evidence produces project-specific examples', () => {
  it('the Genesis fixture is the project version it claims to be', () => {
    expect(GENESIS.project.name).toBe('Genesis AV');
    expect(GENESIS.version.version_name).toBe('Original Design');
    expect(GENESIS.engineering_fingerprint).toBe(GENESIS_FINGERPRINT);

    expect(genesisSnapshot.available).toBe(true);
    expect(genesisSnapshot.version.name).toBe('Original Design');
    // The design the examples must reflect.
    expect(genesisSnapshot.room.screen.display_type).toBe('tv');
    expect(genesisSnapshot.room.screen.diagonal_inches).toBe(115);
    expect(genesisSnapshot.room.seating.row_count).toBe(2);
    expect(genesisSnapshot.system.configuration.dolby_config).toBe('9.1.6');
    expect(genesisSnapshot.system.channel_layout.overhead_channels).toBe(6);
    expect(genesisSnapshot.system.subwoofer_strategy.count).toBe(4);
  });

  it('the Marquee fixture is the project version it claims to be', () => {
    expect(MARQUEE.project.name).toBe('Marquee Home');
    expect(MARQUEE.version.version_name).toBe('Level 4 version');
    expect(MARQUEE.engineering_fingerprint).toBe(MARQUEE_FINGERPRINT);

    expect(marqueeSnapshot.available).toBe(true);
    expect(marqueeSnapshot.version.name).toBe('Level 4 version');
    expect(marqueeSnapshot.room.screen.display_type).toBe('projector_screen');
    expect(marqueeSnapshot.room.screen.size_inches).toBe(170);
    expect(marqueeSnapshot.system.configuration.dolby_config).toBe('9.1.6');
  });

  it('reads results only from the frozen publication', () => {
    const genesis = labelsFor(genesisSnapshot);
    const marquee = labelsFor(marqueeSnapshot);

    expect(genesis.evidenceBacked).toBe(true);
    expect(marquee.evidenceBacked).toBe(true);
    // The two versions publish different screen Dynamic Range results, and each
    // set of examples states its own: no cross-version confusion.
    expect(genesis.suggestions.map((entry) => entry.label)).toContain('Show the L2 Screen Dynamic Range result');
    expect(marquee.suggestions.map((entry) => entry.label)).toContain('Show the L4 Screen Dynamic Range result');
    expect(marquee.suggestions.map((entry) => entry.label)).not.toContain('Emphasise the 115" TV');
    expect(marquee.suggestions.map((entry) => entry.label)).not.toContain('Show the L2 Screen Dynamic Range result');
  });

  it('states no result at all when the version has none', () => {
    const built = buildEvidenceSuggestions({ snapshot: snapshotWith([]), proposalType: 'single' });
    // Only the layout, seating and screen facts remain; no level is invented.
    expect(built.suggestions.join(' | ')).not.toMatch(/L1|L2|L3|L4/);
  });
});

describe('C. the examples do not wait for an LLM', () => {
  it('the builder is pure and synchronous — no request, no timer, no SDK', () => {
    expect(EVIDENCE).not.toContain('await');
    expect(EVIDENCE).not.toMatch(/base44\.(functions|entities|integrations|auth)/);
    expect(EVIDENCE).not.toContain('@/api/base44Client');
    expect(EVIDENCE).not.toContain('fetch(');
    expect(EVIDENCE).not.toContain('setTimeout');
    expect(EVIDENCE).not.toContain('import React');
  });

  it('the component builds them in a memo, not from the response', () => {
    expect(CHIPS).toMatch(/const evidence = useMemo\(\(\) => \{[\s\S]{0,400}buildEvidenceSuggestions\(\{/);
    // The response can only add: it writes the refined list, never the base one.
    expect(CHIPS).toContain('setRefined(list.map(');
    expect(CHIPS).toContain('mergeSuggestions({ base: baseChips, refined })');
  });

  it('the refinement status never decides what is shown', () => {
    // The only status text is a quiet note; the chips themselves are rendered
    // before it and unconditionally.
    expect(CHIPS.indexOf('{chips.map(renderChip)}')).toBeLessThan(CHIPS.indexOf('{statusNote && ('));
    expect(CHIPS).not.toMatch(/chips\.length === 0\s*&&/);
  });
});

describe('D. six examples, one per narrative area, in priority order', () => {
  it('returns exactly six for each live design', () => {
    expect(labelsFor(genesisSnapshot).suggestions).toHaveLength(EVIDENCE_SUGGESTION_LIMIT);
    expect(labelsFor(marqueeSnapshot).suggestions).toHaveLength(EVIDENCE_SUGGESTION_LIMIT);
  });

  it('never asks about the same area twice', () => {
    for (const snapshot of [genesisSnapshot, marqueeSnapshot]) {
      const areas = labelsFor(snapshot).suggestions.map((entry) => entry.area);
      expect(new Set(areas).size).toBe(areas.length);
    }
  });

  it('keeps the narrative priority order: display, seating, layout, dynamic, spatial, timbre', () => {
    for (const snapshot of [genesisSnapshot, marqueeSnapshot]) {
      expect(labelsFor(snapshot).suggestions.map((entry) => entry.area)).toEqual([
        'display_viewing',
        'client_experience',
        'loudspeaker_configuration',
        'dynamic_capability',
        'spatial_resolution',
        'timbre_matching',
      ]);
    }
  });

  it('fits the comparison mode to the same six', () => {
    const built = buildEvidenceSuggestions({
      versionSnapshots: [
        { version_id: 'g', snapshot: genesisSnapshot },
        { version_id: 'm', snapshot: marqueeSnapshot },
      ],
      proposalType: 'comparison',
    });
    // Only what holds in BOTH versions is stated as a fact; the rest are
    // comparison prompts, and the list is still six.
    expect(built.suggestions.length).toBeLessThanOrEqual(EVIDENCE_SUGGESTION_LIMIT);
    const labels = built.suggestions.map((entry) => entry.label);
    expect(labels).toContain('Explain the 9.1.6 system layout');
    expect(labels).not.toContain('Emphasise the 115" TV');
  });
});

describe('E. no invented facts', () => {
  it('every figure in a suggestion is a figure of the frozen snapshot', () => {
    for (const [snapshot, expected] of [[genesisSnapshot, GENESIS_EXPECTED], [marqueeSnapshot, MARQUEE_EXPECTED]]) {
      const published = JSON.stringify(snapshot);
      for (const label of expected) {
        const figures = label.match(/\d+(?:\.\d+)?/g) || [];
        for (const figure of figures) {
          expect(published).toContain(figure);
        }
      }
    }
  });

  it('states a television by its diagonal and the word TV, never as a screen', () => {
    const labels = labelsFor(genesisSnapshot).suggestions.map((entry) => entry.label);
    expect(labels).toContain('Emphasise the 115" TV');
    expect(labels.join(' ')).not.toMatch(/115[^|]{0,20}(screen|viewable|inch)/i);
    expect(labels.join(' ')).not.toMatch(/\b170\b/);
  });

  it('never asks for a reason the design does not record', () => {
    for (const snapshot of [genesisSnapshot, marqueeSnapshot]) {
      for (const entry of labelsFor(snapshot).suggestions) {
        expect(entry.label).not.toMatch(/\bwhy\b|because|chosen|intended to|we decided/i);
      }
    }
  });

  it('never claims proven bass consistency from subwoofer quantity', () => {
    // Genesis has four subwoofers and a P20 result of L1: quantity is not used.
    const labels = labelsFor(genesisSnapshot).suggestions.map((entry) => entry.label).join(' | ');
    expect(labels).not.toMatch(/consistency|subwoofer|LFE/i);

    const fourSubsLowConsistency = snapshotWith([
      { parameter_id: 20, achieved_level: 'L1', formatted_value: '9 dB' },
    ]);
    expect(labelsFor(fourSubsLowConsistency).suggestions.map((entry) => entry.label).join(' | '))
      .not.toMatch(/consistency/i);

    // At L3 or L4 with more than one seat, the report admits it and so does ADI.
    const admitted = snapshotWith([
      { parameter_id: 20, achieved_level: 'L3', formatted_value: '3 dB' },
    ]);
    expect(labelsFor(admitted).suggestions.map((entry) => entry.label))
      .toContain('Explain bass consistency across the seating');

    // A single-seat room never carries a seat-to-seat consistency claim.
    const oneSeat = snapshotWith(
      [{ parameter_id: 20, achieved_level: 'L4', formatted_value: '2 dB' }],
      { seats: [{ id: 'only' }], room: { seating: { total_seats: 1, row_count: 1 } } },
    );
    expect(labelsFor(oneSeat).suggestions.map((entry) => entry.label).join(' | '))
      .not.toMatch(/consistency/i);
  });

  it('never references an assumed or administrative parameter', () => {
    const assumed = snapshotWith([
      { parameter_id: 15, achieved_level: 'L2', formatted_value: 'NCB 22' },
      { parameter_id: 21, achieved_level: 'L2', formatted_value: '−8 dB' },
      { parameter_id: 8, achieved_level: 'L4', formatted_value: '4' },
    ]);
    expect(labelsFor(assumed).suggestions.map((entry) => entry.label).join(' | '))
      .not.toMatch(/noise|NCB|reflection|P8|P15|P21/i);
  });
});

describe('F. a late refinement preserves the designer’s selection', () => {
  it('adds to the examples already on screen, in order', () => {
    const base = labelsFor(genesisSnapshot).suggestions;
    const merged = mergeSuggestions({ base, refined: [{ label: 'A late example', reason: 'late' }] });

    expect(merged.slice(0, base.length).map((entry) => entry.label)).toEqual(base.map((entry) => entry.label));
    expect(merged.map((entry) => entry.label)).toContain('A late example');
  });

  it('keeps a selected chip, and drops only one that is no longer offered', () => {
    const chips = mergeSuggestions({
      base: labelsFor(genesisSnapshot).suggestions,
      refined: [{ label: 'A late example' }],
    });
    expect(pruneSelection(['Emphasise the 115" TV', 'A late example'], chips))
      .toEqual(['Emphasise the 115" TV', 'A late example']);
    expect(pruneSelection(['An example that is gone'], chips)).toEqual([]);
  });

  it('the component prunes on the chip list, and the load never clears a selection', () => {
    expect(CHIPS).toContain('pruneSelection(current, chips)');
    expect(CHIPS).toMatch(/pruneSelection\(current, chips\)[\s\S]{0,300}\}, \[chipsKey\]\);/);
    const load = CHIPS.slice(CHIPS.indexOf('const load = useCallback'), CHIPS.indexOf('}, [hasResults]);'));
    expect(load).not.toContain('setSelected(');
  });
});

describe('G. a failed or timed-out refinement preserves the examples', () => {
  it('adds nothing at all when the refinement returns nothing', () => {
    const base = labelsFor(marqueeSnapshot).suggestions;
    expect(mergeSuggestions({ base, refined: [] })).toEqual(
      base.map((entry) => ({ label: entry.label, reason: entry.reason || '', area: entry.area })),
    );
  });

  it('the timeout and failure branches only record how it ended', () => {
    const failure = CHIPS.slice(
      CHIPS.indexOf("if (result.status === 'timeout')"),
      CHIPS.indexOf('const data = result.response?.data || {};'),
    );
    expect(failure).toContain("setRefinement('timedOut')");
    expect(failure).toContain("setRefinement('failed')");
    expect(failure).not.toContain('setRefined(');
    expect(failure).not.toContain('setSelected(');
    expect(failure).not.toContain('onAddSelected');
    expect(failure).not.toContain('onChange');
    expect(failure).not.toMatch(/buildEvidenceSuggestions|evidenceBacked/);
  });
});

describe('H. a stable evidence identity prevents request loops', () => {
  it('the examples are keyed on the evidence identity, not on object identity', () => {
    expect(CHIPS).toContain('const evidenceKey = [');
    expect(CHIPS).toMatch(/\}, \[evidenceKey, proposalType\]\);/);
  });

  it('the request is not re-created by a parent re-render', () => {
    // load() depends only on whether results exist; the payload is read from a ref.
    expect(CHIPS).toMatch(/\}, \[hasResults\]\);/);
    expect(CHIPS).toContain('payloadRef.current = {');
    expect(CHIPS).toContain('snapshotRef.current');
    expect(CHIPS).toContain('versionSnapshotsRef.current');
  });

  it('one run per evidence identity, and no state it sets can re-trigger it', () => {
    expect(CHIPS).toMatch(/\}, \[evidenceKey, hasResults, load\]\);/);
    const effect = CHIPS.slice(
      CHIPS.indexOf('useEffect(() => {\n    requestRef.current += 1;\n    setRefined([]);'),
      CHIPS.indexOf('}, [evidenceKey, hasResults, load]);'),
    );
    expect(effect).toContain('load();');
    expect(effect).toContain('if (!hasResults) return;');
    expect(effect).not.toMatch(/refinement|refined\b|chipsKey|selected/);
  });

  it('the evidence identity changes with the version and with the publication', () => {
    const key = CHIPS.slice(CHIPS.indexOf('const evidenceKey = ['), CHIPS.indexOf('].join(\'|\');'));
    expect(key).toContain('projectId');
    expect(key).toContain('selectedVersionIds');
    expect(key).toContain('engineeringFingerprint');
    expect(key).toContain('versionSnapshots');
  });
});

describe('I. a project or version change discards a stale response', () => {
  it('the previous selection’s output is abandoned before the new run', () => {
    const effect = CHIPS.slice(
      CHIPS.indexOf('useEffect(() => {\n    requestRef.current += 1;'),
      CHIPS.indexOf('}, [evidenceKey, hasResults, load]);'),
    );
    expect(effect).toContain('requestRef.current += 1;');
    expect(effect).toContain('setRefined([]);');
    expect(effect.indexOf('setRefined([])')).toBeLessThan(effect.indexOf('load();'));
  });

  it('nothing is written after the wait unless the request is still the current one', () => {
    const afterAwait = CHIPS.slice(CHIPS.indexOf('const result = await settleWithin('));
    const gate = afterAwait.indexOf('if (requestRef.current !== token) return;');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(afterAwait.indexOf('setRefined('));
    expect(gate).toBeLessThan(afterAwait.indexOf('setRefinement('));
  });

  it('leaving the step abandons whatever is in flight', () => {
    expect(CHIPS).toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]{0,120}requestRef\.current \+= 1;/);
  });
});

describe('J. the brief and the wizard are untouched by the examples', () => {
  it('the brief keeps its text and only ever gains prompts', () => {
    expect(BRIEF_STEP).toContain('if (result.added.length > 0) onChange(result.next);');
    expect(BRIEF_STEP).toContain('value={value || \'\'}');
    expect(CHIPS).toContain('onAddSelected?.(selected)');
    expect(CHIPS).not.toContain('onChange(');
    // No example is written into the brief by the suggestion area itself.
    expect(CHIPS).not.toMatch(/appendSelectedPrompts|onChange\(/);
  });

  it('Next is never gated on the examples or on the refinement', () => {
    expect(WIZARD).toContain('true, // step 3 — client brief is optional');
    expect(WIZARD).toContain('disabled={!canProceed[step]}');
    expect(WIZARD).not.toMatch(/disabled=\{[^}]*suggestion/i);
    expect(WIZARD).not.toMatch(/disabled=\{[^}]*snapshotLoading/);
    expect(WIZARD).not.toMatch(/disabled=\{[^}]*refin/i);
  });
});

describe('the exact six examples shown, Genesis AV / Original Design', () => {
  it('are these, in this order', () => {
    expect(labelsFor(genesisSnapshot).suggestions.map((entry) => entry.label)).toEqual(GENESIS_EXPECTED);
  });
});

describe('the exact six examples shown, Marquee Home / Level 4 version', () => {
  it('are these, in this order', () => {
    expect(labelsFor(marqueeSnapshot).suggestions.map((entry) => entry.label)).toEqual(MARQUEE_EXPECTED);
  });
});