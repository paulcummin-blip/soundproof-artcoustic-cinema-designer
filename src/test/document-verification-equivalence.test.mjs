/**
 * Regression: false document invalidation from legacy subwoofer UI metadata.
 *
 * The defect (Sound Proof — Richer Sounds Leeds 25): a published engineering
 * fingerprint moved from `eng:v1:af281b82b9dcfe74` to `eng:v1:631122e62de64960`
 * with NO engineering change. The only difference between the two frozen
 * publications was the removal of legacy `placementMode`/`isManual` UI flags
 * from `front_subs_cfg`/`rear_subs_cfg`; the canonical `subwooferInstances`
 * (the sole bass-analysis authority) were identical.
 *
 * This suite proves the three guarantees that recover the dealer workflow:
 *   A. `stripLegacySubwooferUiMetadata` drops placementMode/isManual from both
 *      camelCase (design state) and snake_case (frozen report project) keys.
 *   B. `computeEngineeringFingerprint` is stable when only those legacy flags
 *      change — the fingerprint does not move for a non-engineering change.
 *   C. `engineeringDifferenceIsPresentationOnly` recognises the two
 *      publications as the same physical design, so a saved document frozen
 *      against the old publication is not out of date.
 *   D. `identifyDesignChanges` returns [] (equivalent) for the same pair, so
 *      the document workflow status resolves Ready, not Outdated.
 */
import { describe, it, expect } from 'vitest';

import {
  computeEngineeringFingerprint,
  stripLegacySubwooferUiMetadata,
} from '../components/proposal/engineeringAuthority/engineeringFingerprint.js';
import {
  engineeringDifferenceIsPresentationOnly,
  samePhysicalDesign,
} from '../components/report/designIdentityComparison.js';
import { identifyDesignChanges } from '../components/documentWorkflow/documentFreshnessReason.js';

const VERSIONS = {
  engineVersion: '1.1',
  rp22Version: '21',
  algorithmVersion: '8',
  instanceAuthorityVersion: 4,
  summarySchemaVersion: 1,
  publicationContractVersion: 2,
  bassFingerprint: 'cal:v1:abc',
};

// Canonical subwoofer instances — the sole bass authority. Identical on both
// publications.
const SUBWOOFER_INSTANCES = [
  { id: 'sub-1', model: 'SUB2-12', enabled: true, position: { x: 1.888, y: 0.1375 }, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
  { id: 'sub-2', model: 'SUB2-12', enabled: true, position: { x: 3.458, y: 0.1375 }, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
];

const baseDesignState = {
  roomDims: { widthM: 5.2, lengthM: 6.8, heightM: 2.7 },
  roomOrientation: 'length_front',
  screen: { visibleWidthInches: 87.8, aspectRatio: '16:9', mountMode: 'projector', heightFromFloorM: 0.6 },
  seatingPositions: [{ id: 'seat-1', x: 2.6, y: 4.2, z: 1.2, priority: 'primary', isPrimary: true, earHeightM: 1.2 }],
  selectedSpeakersByRole: { LCR: [{ role: 'LCR', modelKey: 'SPK-1' }] },
  subwooferInstances: SUBWOOFER_INSTANCES,
  splConfig: { globalPowerW: 200, radiationMode: 'half_space' },
  targetSpl: 105,
};

// The OLD publication's frozen report project carried the legacy UI flags.
const reportProjectWithLegacyFlags = {
  roomDims: { widthM: 5.2, lengthM: 6.8, heightM: 2.7 },
  subwooferInstances: SUBWOOFER_INSTANCES,
  front_subs_cfg: { model: 'SUB2-12', count: 2, placementMode: 'manual', isManual: true },
  rear_subs_cfg: { model: 'SUB2-12', count: 0, placementMode: 'default', isManual: false },
  report_screen: { visibleWidthInches: 87.8, aspectRatio: '16:9', mountMode: 'projector' },
};

// The NEW publication dropped them (a normalisation/migration on hydration).
const reportProjectWithoutLegacyFlags = {
  roomDims: { widthM: 5.2, lengthM: 6.8, heightM: 2.7 },
  subwooferInstances: SUBWOOFER_INSTANCES,
  front_subs_cfg: { model: 'SUB2-12', count: 2 },
  rear_subs_cfg: { model: 'SUB2-12', count: 0 },
  report_screen: { visibleWidthInches: 87.8, aspectRatio: '16:9', mountMode: 'projector' },
};

const publicationWithFlags = { report_snapshot: { report_project: reportProjectWithLegacyFlags } };
const publicationWithoutFlags = { report_snapshot: { report_project: reportProjectWithoutLegacyFlags } };

describe('stripLegacySubwooferUiMetadata', () => {
  it('removes placementMode and isManual from camelCase cfg keys', () => {
    const stripped = stripLegacySubwooferUiMetadata({
      frontSubsCfg: { model: 'SUB2-12', count: 2, placementMode: 'manual', isManual: true },
      rearSubsCfg: { model: 'SUB2-12', count: 0, placementMode: 'default', isManual: false },
      other: 1,
    });
    expect(stripped.frontSubsCfg).toEqual({ model: 'SUB2-12', count: 2 });
    expect(stripped.rearSubsCfg).toEqual({ model: 'SUB2-12', count: 0 });
    expect(stripped.other).toBe(1);
  });

  it('removes placementMode and isManual from snake_case cfg keys', () => {
    const stripped = stripLegacySubwooferUiMetadata({
      front_subs_cfg: { model: 'SUB2-12', count: 2, placementMode: 'manual', isManual: true },
      rear_subs_cfg: { model: 'SUB2-12', count: 0, placementMode: 'default' },
    });
    expect(stripped.front_subs_cfg).toEqual({ model: 'SUB2-12', count: 2 });
    expect(stripped.rear_subs_cfg).toEqual({ model: 'SUB2-12', count: 0 });
  });

  it('leaves unrelated fields and missing cfg untouched', () => {
    const stripped = stripLegacySubwooferUiMetadata({ roomDims: { widthM: 5 }, subwooferInstances: [1] });
    expect(stripped).toEqual({ roomDims: { widthM: 5 }, subwooferInstances: [1] });
  });
});

describe('engineering fingerprint stability (Leeds scenario)', () => {
  it('does not change when only legacy placementMode/isManual are removed', () => {
    const withFlags = {
      ...baseDesignState,
      frontSubsCfg: { model: 'SUB2-12', count: 2, placementMode: 'manual', isManual: true },
      rearSubsCfg: { model: 'SUB2-12', count: 0, placementMode: 'default', isManual: false },
    };
    const withoutFlags = {
      ...baseDesignState,
      frontSubsCfg: { model: 'SUB2-12', count: 2 },
      rearSubsCfg: { model: 'SUB2-12', count: 0 },
    };
    const fpWith = computeEngineeringFingerprint(withFlags, VERSIONS);
    const fpWithout = computeEngineeringFingerprint(withoutFlags, VERSIONS);
    expect(fpWithout).toBe(fpWith);
  });

  it('still changes for a genuine engineering change (subwoofer position)', () => {
    const a = computeEngineeringFingerprint(baseDesignState, VERSIONS);
    const moved = {
      ...baseDesignState,
      subwooferInstances: [
        { ...SUBWOOFER_INSTANCES[0], position: { x: 2.0, y: 0.1375 } },
        SUBWOOFER_INSTANCES[1],
      ],
    };
    expect(computeEngineeringFingerprint(moved, VERSIONS)).not.toBe(a);
  });
});

describe('design identity comparison (Leeds scenario)', () => {
  it('recognises the two publications as the same physical design', () => {
    expect(samePhysicalDesign(publicationWithFlags, publicationWithoutFlags)).toBe(true);
    expect(engineeringDifferenceIsPresentationOnly(publicationWithFlags, publicationWithoutFlags)).toBe(true);
  });

  it('identifyDesignChanges returns [] (equivalent) for the legacy-metadata-only move', () => {
    expect(identifyDesignChanges(publicationWithFlags, publicationWithoutFlags)).toEqual([]);
  });

  it('still flags a genuine subwoofer change as materially different', () => {
    const changedCurrent = {
      report_snapshot: {
        report_project: {
          ...reportProjectWithoutLegacyFlags,
          subwooferInstances: [
            { ...SUBWOOFER_INSTANCES[0], position: { x: 2.5, y: 0.1375 } },
            SUBWOOFER_INSTANCES[1],
          ],
        },
      },
    };
    expect(identifyDesignChanges(publicationWithFlags, changedCurrent)).toContain('subwoofer');
    expect(samePhysicalDesign(publicationWithFlags, changedCurrent)).toBe(false);
  });
});