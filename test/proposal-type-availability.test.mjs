/**
 * Proposal type availability — Step 2 of Create Proposal.
 *
 * A System Design Comparison compares two design versions, so it may be offered
 * only when the project genuinely holds two or more. The count comes from the ONE
 * shared canonical version selector, never from raw version records, so a
 * migration artefact left beside a real design is never counted as a second
 * version. The availability rule itself lives in proposalTypes; these tests pin
 * the acceptance cases and the wiring that makes them true.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PROPOSAL_TYPES,
  availableProposalTypes,
  isProposalTypeAvailable,
  getProposalType,
} from '../src/components/proposal/proposalTypes.js';
import { selectCanonicalVersions } from '../src/lib/canonicalVersionSelection.js';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const TYPE_STEP = read('src/components/proposal/wizard/ProposalTypeStep.jsx');
const VERSIONS_STEP = read('src/components/proposal/wizard/VersionSelectStep.jsx');
const WIZARD = read('src/components/proposal/CreateProposalWizard.jsx');
const VERSION_READ_HOOK = read('src/components/proposal/wizard/useCanonicalProjectVersions.js');

const SUMMARY = 'system_summary';
const COMPARISON = 'comparison';

/** Genesis — the real design version, and the empty migration artefact beside it. */
const GENUINE_V1 = '6ac7a189d093a8d8a68eec91';
const DUPLICATE_V1 = '6ac7a18981cec7fe2a1072ff';

const designState = (speakers = 0, seats = 0, subs = 0) => ({
  selected_speakers: Array.from({ length: speakers }, (_, i) => ({ id: `S${i}`, role: 'FL' })),
  seating_positions: Array.from({ length: seats }, (_, i) => ({ id: `seat${i}` })),
  subwooferInstances: Array.from({ length: subs }, (_, i) => ({ id: `sub${i}` })),
});

const version = (id, slot, name, extra = {}) => ({
  id,
  project_id: 'P1',
  version_number: slot,
  version_name: name,
  design_state: {},
  ...extra,
});

/** The count the wizard counts with: the shared selector, never raw records. */
const genuineCount = (versions, activeVersionId = null) =>
  selectCanonicalVersions({ versions, activeVersionId }).versions.length;

/** The Step 2 cards that project would offer, in render order. */
const offeredTypes = (versions, activeVersionId = null) =>
  availableProposalTypes(genuineCount(versions, activeVersionId)).map((type) => type.value);

describe('Proposal type availability', () => {
  test('one version offers System Design Summary only', () => {
    const versions = [version('v1', 1, 'Original Design', { design_state: designState(16, 8, 4) })];

    expect(genuineCount(versions, 'v1')).toBe(1);
    expect(offeredTypes(versions, 'v1')).toEqual([SUMMARY]);
  });

  test('two versions offer System Design Summary and System Design Comparison', () => {
    const versions = [
      version('v1', 1, 'Original Design', { design_state: designState(16, 8, 4) }),
      version('v2', 2, 'Alternative Layout', { design_state: designState(18, 9, 6) }),
    ];

    expect(genuineCount(versions, 'v1')).toBe(2);
    expect(offeredTypes(versions, 'v1')).toEqual([SUMMARY, COMPARISON]);
  });

  test('five versions offer both', () => {
    const versions = Array.from({ length: 5 }, (_, index) => version(
      `v${index + 1}`,
      index + 1,
      `Design ${index + 1}`,
      { design_state: designState(16, 8, 4) },
    ));

    expect(genuineCount(versions, 'v1')).toBe(5);
    expect(offeredTypes(versions, 'v1')).toEqual([SUMMARY, COMPARISON]);
  });

  test('one genuine version beside a migration duplicate offers Summary only', () => {
    const versions = [
      version(DUPLICATE_V1, 1, 'Original Design', {
        design_state: { screen_size: 120, target_spl: 105 },
      }),
      version(GENUINE_V1, 1, 'Original Design', {
        design_state: designState(16, 8, 4),
        published_fingerprint: 'fp-canonical',
      }),
    ];

    expect(versions.length).toBe(2); // two records in the database…
    expect(genuineCount(versions, GENUINE_V1)).toBe(1); // …one genuine design
    expect(offeredTypes(versions, GENUINE_V1)).toEqual([SUMMARY]);
  });

  test('the duplicate is excluded by evidence too, when no pointer names the slot', () => {
    const versions = [
      version('empty-v1', 1, 'Original Design', { design_state: { screen_size: 120 } }),
      version('real-v1', 1, 'Original Design', {
        design_state: designState(12, 6, 2),
        published_fingerprint: 'fp-canonical',
      }),
    ];

    expect(genuineCount(versions, null)).toBe(1);
    expect(offeredTypes(versions, null)).toEqual([SUMMARY]);
  });

  test('an unknown count never offers the comparison', () => {
    expect(availableProposalTypes(null).map((type) => type.value)).toEqual([SUMMARY]);
    expect(availableProposalTypes(undefined).map((type) => type.value)).toEqual([SUMMARY]);
    expect(isProposalTypeAvailable(getProposalType(COMPARISON), null)).toBe(false);
  });

  test('the summary is never withdrawn, however many versions exist', () => {
    for (const count of [0, 1, 2, 5, 20]) {
      expect(isProposalTypeAvailable(getProposalType(SUMMARY), count)).toBe(true);
    }
  });

  test('both offered types remain selectable, and a comparison needs two versions', () => {
    expect(PROPOSAL_TYPES.map((type) => type.value)).toEqual([SUMMARY, COMPARISON]);
    expect(getProposalType(SUMMARY).minVersions).toBe(1);
    expect(getProposalType(COMPARISON).minVersions).toBe(2);
    expect(offeredTypes([
      version('v1', 1, 'A', { design_state: designState(16, 8, 4) }),
      version('v2', 2, 'B', { design_state: designState(16, 8, 4) }),
    ], 'v1')).toHaveLength(2);
  });
});

describe('Step 2 renders from the shared availability rule', () => {
  test('the type step offers only the available types and hides the rest', () => {
    expect(TYPE_STEP).toContain('availableProposalTypes(versionCount)');
    expect(TYPE_STEP).not.toContain('PROPOSAL_TYPES.map');
    expect(TYPE_STEP).not.toContain('disabled'); // hidden, never shown greyed out
    expect(TYPE_STEP).toContain('onSelect(type.value)');
  });

  test('the wizard counts genuine versions through the shared canonical selector', () => {
    expect(WIZARD).toContain('useCanonicalProjectVersions(selectedProjectId)');
    expect(WIZARD).toContain('canonicalVersions.length');
    expect(WIZARD).not.toContain('ProjectVersion.filter'); // never a raw record read
    expect(WIZARD).not.toContain('ProjectVersion.list');
    expect(WIZARD).toContain('availableProposalTypes(canonicalVersionCount)');
    expect(WIZARD).toContain('versionCount={versionsLoading ? null : canonicalVersionCount}');

    expect(VERSION_READ_HOOK).toContain('selectCanonicalVersions({');
    expect(VERSION_READ_HOOK).toContain('base44.entities.ProjectVersion.filter({ project_id: projectId })');
  });

  test('a single-version project keeps the summary selected', () => {
    expect(WIZARD).toMatch(/if \(available\.length === 1\) \{/);
    expect(WIZARD).toContain('setProposalType(available[0]);');
  });

  test('one canonical list is shared with the Versions step', () => {
    expect(WIZARD).toContain('versions={canonicalVersions}');
    expect(WIZARD).toContain('collisions={versionCollisions}');
    expect(VERSIONS_STEP).not.toContain('base44.entities.ProjectVersion'); // no second read
    expect(VERSIONS_STEP).toContain('versions = []');
  });

  test('comparison rules and readiness checks are unchanged', () => {
    expect(WIZARD).toContain('selectedVersionIds.length >= (typeDef?.minVersions || 2)');
    expect(WIZARD).toContain('useProposalReadiness({');
    expect(WIZARD).toContain('readiness={readiness}');
    expect(VERSIONS_STEP).toContain('<VersionReadinessTable gate={readiness} projectId={projectId} />');
  });
});