/**
 * Acceptance tests for the relative subwoofer group-offset display.
 *
 * The ADI panel must state subwoofer timing as the RELATIVE offset between the
 * sub groups — "Rear sub group +1 ms relative to the front group" — because bass
 * summation depends on the timing relationship, not on the two absolute
 * processor delays. The absolute saved values move to Engineer details.
 *
 * Genesis AV / Original Design is the reference case: front group 3 ms, rear
 * group 4 ms → rear group +1 ms relative to the front group.
 *
 * Nothing here scores a design or changes a value: the authority is pure, and
 * the wiring assertions read the panel sources.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  ABSOLUTE_GROUP_DELAY_TITLE,
  RELATIVE_GROUP_DELAY_NOTE,
  RELATIVE_GROUP_DELAY_TITLE,
  buildRelativeGroupDelays,
  formatRelativeGroupDelayMs,
  resolveGroupDelays,
} from '../components/room/bass/optimiserPlan/relativeGroupDelayAuthority.js';

// Repo-root relative: this suite lives two levels below the project root.
const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** Genesis AV / Original Design: front group 3 ms, rear group 4 ms. */
const genesisInstances = () => ([
  { id: 'sub-front-l', enabled: true, legacyGroup: 'front', delayMs: 3, position: { x: 5.0, y: 0.4 } },
  { id: 'sub-front-r', enabled: true, legacyGroup: 'front', delayMs: 3, position: { x: 7.6, y: 0.4 } },
  { id: 'sub-rear-l', enabled: true, legacyGroup: 'rear', delayMs: 4, position: { x: 4.6, y: 8.4 } },
  { id: 'sub-rear-r', enabled: true, legacyGroup: 'rear', delayMs: 4, position: { x: 8.0, y: 8.4 } },
]);

const GENESIS_ROOM = { widthM: 6.4, lengthM: 9.2, heightM: 2.6 };

describe('Subwoofer delay — the panel states the relative group offset', () => {
  const display = () => buildRelativeGroupDelays({ instances: genesisInstances(), roomDims: GENESIS_ROOM });

  it('shows the rear group one millisecond later than the front group', () => {
    expect(display().statement).toBe('Rear sub group +1 ms relative to the front group');
  });

  it('never leads with the two absolute processor delays', () => {
    const statement = display().statement;
    expect(statement).not.toMatch(/3 ms|4 ms/);
    expect(statement).not.toMatch(/front subs|rear subs/i);
  });

  it('states the front group as the 0 ms reference', () => {
    const resolved = display();
    expect(resolved.reference.role).toBe('front');
    expect(resolved.reference.label).toBe('Front sub group');
    expect(resolved.reference.text).toBe('0 ms (reference)');
    expect(resolved.relativeRows.map((row) => `${row.label} ${row.text}`)).toEqual([
      'Front sub group 0 ms (reference)',
      'Rear sub group +1 ms',
    ]);
  });

  it('keeps the offset sign pointing at the later group', () => {
    expect(display().offset.relativeMs).toBe(1);
    expect(display().offset.text).toBe('+1 ms');
    expect(display().offset.role).toBe('rear');
    // The reference group is never the one carrying the offset.
    expect(display().offset.role).not.toBe(display().reference.role);
    // The front group one millisecond later is stated the other way round.
    const frontLater = buildRelativeGroupDelays({
      instances: genesisInstances().map((sub) => ({
        ...sub, delayMs: sub.legacyGroup === 'front' ? 4 : 3,
      })),
      roomDims: GENESIS_ROOM,
    });
    expect(frontLater.statement).toBe('Front sub group +1 ms relative to the rear group');
    expect(frontLater.reference.role).toBe('rear');
    expect(frontLater.offset.relativeMs).toBe(1);
  });

  it('states alignment instead of inventing an offset', () => {
    const aligned = buildRelativeGroupDelays({
      instances: genesisInstances().map((sub) => ({ ...sub, delayMs: 3.5 })),
      roomDims: GENESIS_ROOM,
    });
    expect(aligned.hasOffset).toBe(false);
    expect(aligned.offset).toBe(null);
    expect(aligned.statement).toMatch(/already aligned/i);
    expect(aligned.statement).not.toMatch(/\+\d/);
  });

  it('carries the mandated explanation of why timing is relative', () => {
    expect(RELATIVE_GROUP_DELAY_NOTE).toBe(
      'Subwoofer timing is shown as a relative group offset because bass summation depends on the timing relationship between the sub groups.',
    );
    expect(display().note).toBe(RELATIVE_GROUP_DELAY_NOTE);
  });
});

describe('Engineer details keep the absolute saved processor delays', () => {
  const display = () => buildRelativeGroupDelays({ instances: genesisInstances(), roomDims: GENESIS_ROOM });

  it('states each group\u2019s absolute delay beside the relative offset', () => {
    expect(display().absoluteRows.map((row) => `${row.label} ${row.text}`)).toEqual([
      'Front sub group 3 ms',
      'Rear sub group 4 ms',
    ]);
    expect(display().offset.text).toBe('+1 ms');
    expect(ABSOLUTE_GROUP_DELAY_TITLE).toBe('Absolute processor delays');
    expect(RELATIVE_GROUP_DELAY_TITLE).toBe('Best acoustic delay');
  });

  it('reads a held candidate\u2019s own applied delay without touching the design', () => {
    const instances = genesisInstances().map((sub) => ({ ...sub, delayMs: 3 }));
    const before = JSON.parse(JSON.stringify(instances));
    const held = buildRelativeGroupDelays({
      instances,
      settings: [{ key: 'delay:sub-rear-l', setting: 'Delay', from: '3 ms', to: '4 ms', group: 'rear' }],
      roomDims: GENESIS_ROOM,
    });
    expect(held.statement).toBe('Rear sub group +1 ms relative to the front group');
    // Display only: the design's own saved delays are byte-identical afterwards.
    expect(instances).toEqual(before);
  });

  it('changes no saved tuning value and reaches no acoustic calculation', () => {
    const source = read('src/components/room/bass/optimiserPlan/relativeGroupDelayAuthority.js');
    // The authority cannot calculate anything: it imports nothing at all.
    expect(source).not.toContain('import ');
    const instances = genesisInstances();
    const tuning = JSON.stringify(instances);
    buildRelativeGroupDelays({ instances, roomDims: GENESIS_ROOM });
    expect(JSON.stringify(instances)).toBe(tuning);
  });
});

describe('A group that is not recorded is never guessed at', () => {
  it('reads the wall group from the room half when no side is stamped', () => {
    const unstamped = genesisInstances().map(({ legacyGroup, ...rest }) => rest);
    const resolved = resolveGroupDelays({ instances: unstamped, roomDims: GENESIS_ROOM });
    expect(resolved.available).toBe(true);
    expect(resolved.groups.map((group) => group.role)).toEqual(['front', 'rear']);
  });

  it('states nothing when the side cannot be read', () => {
    const unreadable = genesisInstances().map(({ legacyGroup, position, ...rest }) => rest);
    expect(buildRelativeGroupDelays({ instances: unreadable })).toBe(null);
    expect(resolveGroupDelays({ instances: unreadable }).reason).toBe('group-not-recorded');
  });

  it('states nothing for a single-group layout', () => {
    const frontOnly = genesisInstances().filter((sub) => sub.legacyGroup === 'front');
    expect(buildRelativeGroupDelays({ instances: frontOnly, roomDims: GENESIS_ROOM })).toBe(null);
    expect(resolveGroupDelays({ instances: frontOnly, roomDims: GENESIS_ROOM }).reason).toBe('single-group');
  });

  it('formats a signed relative offset and a reference distinctly', () => {
    expect(formatRelativeGroupDelayMs(0)).toBe('0 ms (reference)');
    expect(formatRelativeGroupDelayMs(1)).toBe('+1 ms');
    expect(formatRelativeGroupDelayMs(1.5)).toBe('+1.5 ms');
    expect(formatRelativeGroupDelayMs(-2)).toBe('\u22122 ms');
  });
});

describe('The panel wiring that carries the rule', () => {
  const pack = read('src/components/room/bass/optimiserPlan/AdiAppliedBassCalibration.jsx');
  const section = read('src/components/room/bass/optimiserPlan/AdiCalibrationSection.jsx');
  // The card is read as ONE unit: the journey composes the disclosure's evidence
  // groups from AdiJourneyEngineerDetailsSections in place.
  const journey = read('src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx')
    + read('src/components/room/bass/optimiserPlan/AdiJourneyEngineerDetailsSections.jsx');

  it('leads the main panel with the relative statement', () => {
    expect(pack).toContain('<AdiRelativeGroupDelay display={relativeDelay} />');
    // The absolute delay rows leave the main table only when the relative
    // statement replaced them.
    expect(pack).toContain('filter((row) => row?.setting !== "Delay")');
    expect(pack).toContain('showDelay={!relativeDelay}');
  });

  it('gives the calibration section the design\u2019s own subwoofers', () => {
    expect(section).toContain('instances={instances}');
    expect(section).toContain('roomDims={roomDims}');
    expect(journey).toContain('instances={instances}');
  });

  it('keeps the absolute delays inside the collapsed Engineer details', () => {
    expect(journey).toContain('<AdiAbsoluteGroupDelays');
    const engineerDetails = journey.indexOf('data-adi-engineer-details');
    const absoluteBlock = journey.indexOf('<AdiAbsoluteGroupDelays');
    expect(engineerDetails).toBeGreaterThan(-1);
    expect(absoluteBlock).toBeGreaterThan(engineerDetails);
    // The relative statement is not rendered a second time there.
    expect(journey).not.toContain('<AdiRelativeGroupDelay');
  });
});