/**
 * A display-authority or wording change must never make an unchanged design
 * read as out of date:
 *
 *   A. the engineering fingerprint hashes only PHYSICAL design authority — the
 *      screen's derived display identity is excluded;
 *   B. a version whose publication moved past a saved report for presentation
 *      only is recognised from both publications' frozen physical facts;
 *   C. the saved-report status therefore stays Current, with no DESIGN UPDATED
 *      banner and no Create Updated Report action — while a real physical
 *      change, or a bass change, still marks the report stale.
 */
import { describe, it, expect } from 'vitest';

import { computeEngineeringFingerprint } from '../components/proposal/engineeringAuthority/engineeringFingerprint.js';
import {
  engineeringDifferenceIsPresentationOnly,
  samePhysicalDesign,
} from '../components/report/designIdentityComparison.js';
import {
  REPORT_SNAPSHOT_STATUS,
  resolveSnapshotStatus,
} from '../components/report/reportSnapshotAuthority.js';
import {
  beginPreparingWindow,
  clearPreparingWindow,
  preparingElapsedSeconds,
  preparingKey,
} from '../components/report/reportPreparingClock.js';

const VERSIONS = {
  engineVersion: '1.1',
  rp22Version: '21',
  algorithmVersion: '8',
  instanceAuthorityVersion: 4,
  summarySchemaVersion: 1,
  publicationContractVersion: 2,
  bassFingerprint: 'cal:v1:abc',
};

// One unchanged television design, exactly as hydration states it: the TV
// evidence is physical (preset key + saved width), the resolved display type is
// derived presentation on top of it.
const designState = (overrides = {}) => ({
  roomDims: { widthM: 5.0, lengthM: 6.4, heightM: 2.6 },
  roomOrientation: 'length_front',
  screen: {
    visibleWidthInches: 87.8,
    aspectRatio: '16:9',
    tvPresetKey: 'tv100',
    tvWidthMm: 2230,
    manualMode: false,
    heightFromFloorM: 0.65,
    mountMode: 'floating',
    manualSize: { displayType: 'projector_screen' },
    displayType: 'projector_screen',
  },
  screenFrontPlaneM: 0.1,
  seatingPositions: [{ id: 's1', x: 2.5, y: 3.0, z: 1.2, priority: 'primary' }],
  seatsPerRowByRow: [1],
  rowSpacingM: 1.8,
  selectedSpeakersByRole: { FL: { role: 'FL', modelKey: 'C41' } },
  subwooferInstances: [{ id: 'sub1', model: 'SUB3-12', position: { x: 1, y: 0.3 }, bottomHeightM: 0.1 }],
  dolbyLayout: '9.4.4',
  rspMode: 'auto_from_screen',
  targetSpl: 85,
  acousticTreatmentEnabled: false,
  selectedAbfuserQty: 0,
  ...overrides,
});

describe('A. the engineering fingerprint is display-inert', () => {
  it('is unchanged when only the derived display identity changes', () => {
    const asProjectionScreen = computeEngineeringFingerprint(designState(), VERSIONS);
    const asTelevision = computeEngineeringFingerprint(designState({
      screen: { ...designState().screen, displayType: 'tv' },
    }), VERSIONS);
    expect(asTelevision).toBe(asProjectionScreen);
  });

  it('is unchanged when the derived identity is absent altogether', () => {
    const screen = { ...designState().screen };
    delete screen.displayType;
    expect(computeEngineeringFingerprint(designState({ screen }), VERSIONS))
      .toBe(computeEngineeringFingerprint(designState(), VERSIONS));
  });

  it('still changes for a physical screen change', () => {
    expect(computeEngineeringFingerprint(designState({
      screen: { ...designState().screen, visibleWidthInches: 100 },
    }), VERSIONS)).not.toBe(computeEngineeringFingerprint(designState(), VERSIONS));
  });

  it('still changes for a real design change', () => {
    expect(computeEngineeringFingerprint(designState({
      roomDims: { widthM: 5.4, lengthM: 6.4, heightM: 2.6 },
    }), VERSIONS)).not.toBe(computeEngineeringFingerprint(designState(), VERSIONS));
    expect(computeEngineeringFingerprint(designState({
      seatingPositions: [{ id: 's1', x: 2.5, y: 3.4, z: 1.2, priority: 'primary' }],
    }), VERSIONS)).not.toBe(computeEngineeringFingerprint(designState(), VERSIONS));
  });
});

// A publication as the version's own publication history stores it.
const publication = (reportProject) => ({ report_snapshot: { report_project: reportProject } });
const frozenProject = (displayType, roomWidthM = 5.0) => ({
  room_width: roomWidthM,
  room_length: 6.4,
  room_height: 2.6,
  screen_size: 87.8,
  aspect_ratio: '16:9',
  tv_preset_key: 'tv100',
  tv_width_mm: 2230,
  report_screen: { visibleWidthInches: 87.8, aspectRatio: '16:9', tvPresetKey: 'tv100', displayType },
});

describe('B. a re-publication that changed only presentation is recognised', () => {
  it('sees the same physical design when only the display identity moved', () => {
    expect(engineeringDifferenceIsPresentationOnly(
      publication(frozenProject('projector_screen')),
      publication(frozenProject('tv')),
    )).toBe(true);
  });

  it('sees a different design when any physical fact moved', () => {
    expect(engineeringDifferenceIsPresentationOnly(
      publication(frozenProject('projector_screen')),
      publication(frozenProject('tv', 5.4)),
    )).toBe(false);
  });

  it('never excuses a publication that states no frozen facts', () => {
    expect(samePhysicalDesign(publication(frozenProject('projector_screen')), { engineering_summary: {} })).toBe(false);
    expect(engineeringDifferenceIsPresentationOnly(null, publication(frozenProject('tv')))).toBe(false);
  });
});

const savedReport = (fingerprint, calculationFingerprint = 'cal:v1:abc') => ({
  report_schema_version: 1,
  payload: { engineeringFingerprint: fingerprint },
  generated_at: '2026-10-14T12:12:50.448Z',
  source_fingerprints: { engineeringFingerprint: fingerprint, calculationFingerprint },
});

describe('C. the saved report is not marked out of date', () => {
  it('stays Current when the publication moved for presentation only', () => {
    const status = resolveSnapshotStatus({
      saved: savedReport('eng:v1:196a4366817bddf0'),
      currentFingerprints: { engineeringFingerprint: 'eng:v1:8bc0ea13ef3479b5', calculationFingerprint: 'cal:v1:abc' },
      presentationOnlyMove: true,
    });
    expect(status.status).toBe(REPORT_SNAPSHOT_STATUS.CURRENT);
    expect(status.changedKeys).toEqual([]);
    expect(status.presentationOnlyMove).toBe(true);
  });

  it('is still stale for a physical design change', () => {
    const status = resolveSnapshotStatus({
      saved: savedReport('eng:v1:196a4366817bddf0'),
      currentFingerprints: { engineeringFingerprint: 'eng:v1:8bc0ea13ef3479b5', calculationFingerprint: 'cal:v1:abc' },
      presentationOnlyMove: false,
    });
    expect(status.status).toBe(REPORT_SNAPSHOT_STATUS.STALE);
    expect(status.changedKeys).toEqual(['engineeringFingerprint']);
  });

  it('never excuses a bass or seating-priority change', () => {
    const status = resolveSnapshotStatus({
      saved: savedReport('eng:v1:196a4366817bddf0', 'cal:v1:old'),
      currentFingerprints: { engineeringFingerprint: 'eng:v1:8bc0ea13ef3479b5', calculationFingerprint: 'cal:v1:new' },
      presentationOnlyMove: true,
    });
    expect(status.status).toBe(REPORT_SNAPSHOT_STATUS.STALE);
    expect(status.changedKeys).toContain('calculationFingerprint');
  });

  it('reports a matching publication as Current with nothing changed', () => {
    const status = resolveSnapshotStatus({
      saved: savedReport('eng:v1:8bc0ea13ef3479b5'),
      currentFingerprints: { engineeringFingerprint: 'eng:v1:8bc0ea13ef3479b5', calculationFingerprint: 'cal:v1:abc' },
    });
    expect(status.status).toBe(REPORT_SNAPSHOT_STATUS.CURRENT);
    expect(status.changedKeys).toEqual([]);
  });
});

describe('D. the preparing wait cannot restart', () => {
  it('measures one window per project version, however often it is read', () => {
    const key = preparingKey('project-1', 'version-1');
    const start = 1_000_000;
    expect(preparingElapsedSeconds(key, start)).toBe(0);
    beginPreparingWindow(key, start);
    expect(preparingElapsedSeconds(key, start + 30_000)).toBe(30);
    // A re-read after the report's bound has passed states the same window.
    expect(preparingElapsedSeconds(key, start + 60_000)).toBe(60);
    clearPreparingWindow(key);
    expect(preparingElapsedSeconds(key, start + 60_000)).toBe(0);
  });
});