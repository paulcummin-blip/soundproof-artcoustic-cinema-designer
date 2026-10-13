/**
 * proposal-preparation-journey.test.mjs
 * -------------------------------------
 * The designer's journey from Generate Proposal to Proposal Centre.
 *
 * What is protected here:
 *   - a version whose completed assessment exists but whose saved publication
 *     does not resolve is prepared through the DESIGN, in one action, and the
 *     designer is never told about a fingerprint, a pointer or a cache;
 *   - a version whose publication resolves but whose Project Report is out of
 *     date goes to the report's own existing workflow;
 *   - a version with a genuinely incomplete assessment asks for the missing
 *     calculation, and the gate is never weakened;
 *   - the step offers exactly ONE action, and never sends the designer anywhere
 *     for a read that simply failed.
 */

import { describe, it, expect } from 'vitest';
import {
  PREPARATION_ACTION,
  PREPARATION_STATE,
  resolvePreparation,
  resolveVersionNeed,
} from '../components/proposal/preparation/proposalPreparationAuthority.js';

const row = (overrides = {}) => ({
  versionId: 'v1',
  versionName: 'Original Design',
  ready: false,
  checking: false,
  project: { state: 'stale' },
  publicationStatus: 'stale',
  hasCompletedAuthority: true,
  ...overrides,
});

describe('preparation — what each blocked version needs', () => {
  it('a complete assessment whose saved publication does not resolve is prepared through the design', () => {
    expect(resolveVersionNeed(row({ publicationStatus: 'stale', hasCompletedAuthority: true })))
      .toBe(PREPARATION_ACTION.RECORD_ASSESSMENT);
    expect(resolveVersionNeed(row({ publicationStatus: 'not_calculated', hasCompletedAuthority: true })))
      .toBe(PREPARATION_ACTION.RECORD_ASSESSMENT);
  });

  it('an assessment that is genuinely incomplete asks for the calculation, never for a publication', () => {
    expect(resolveVersionNeed(row({ publicationStatus: 'not_calculated', hasCompletedAuthority: false })))
      .toBe(PREPARATION_ACTION.FINISH_DESIGN);
    expect(resolveVersionNeed(row({ publicationStatus: null, hasCompletedAuthority: false })))
      .toBe(PREPARATION_ACTION.FINISH_DESIGN);
  });

  it('a resolved publication with an out-of-date Project Report goes to the report workflow', () => {
    const need = resolveVersionNeed(row({ publicationStatus: 'published', project: { state: 'stale' } }));
    expect(need).toBe(PREPARATION_ACTION.UPDATE_REPORT);
  });

  it('a publication that could not be read is retried, never sent to the design', () => {
    expect(resolveVersionNeed(row({ publicationStatus: 'read_failed' })))
      .toBe(PREPARATION_ACTION.RETRY_READ);
  });
});

describe('preparation — the step the designer sees', () => {
  it('every selected version current means the proposal simply proceeds', () => {
    const result = resolvePreparation({ rows: [row({ ready: true })], projectId: 'p1' });
    expect(result.state).toBe(PREPARATION_STATE.READY);
    expect(result.action).toBeNull();
  });

  it('holds the wizard while the readiness read is in flight, with no action', () => {
    const result = resolvePreparation({ rows: [], loading: true, projectId: 'p1' });
    expect(result.state).toBe(PREPARATION_STATE.PREPARING);
    expect(result.action).toBeNull();
  });

  it('offers exactly one action, and names the design workflow it belongs to', () => {
    const result = resolvePreparation({ rows: [row()], projectId: 'proj-1' });
    expect(result.state).toBe(PREPARATION_STATE.ACTION_REQUIRED);
    expect(result.action.key).toBe(PREPARATION_ACTION.RECORD_ASSESSMENT);
    expect(result.action.href).toBe('/RoomDesigner?projectId=proj-1&versionId=v1');
  });

  it('sends an incomplete design to its own design, with the missing calculation named in words only', () => {
    const result = resolvePreparation({
      rows: [row({ publicationStatus: 'not_calculated', hasCompletedAuthority: false })],
      projectId: 'proj-1',
    });
    expect(result.action.key).toBe(PREPARATION_ACTION.FINISH_DESIGN);
    expect(result.line).toMatch(/one more calculation/i);
    expect(result.line).not.toMatch(/fingerprint|publication|pointer|cache/i);
  });

  it('keeps the internal reason inside the Engineer details, never on the designer line', () => {
    const result = resolvePreparation({ rows: [row()], projectId: 'proj-1' });
    expect(result.line).not.toMatch(/fingerprint|publication|pointer|cache/i);
    expect(result.detail).toMatch(/publication/);
  });

  it('never sends the whole step to the design when a saved read simply failed', () => {
    const result = resolvePreparation({ rows: [], error: 'read failed', projectId: 'proj-1' });
    expect(result.state).toBe(PREPARATION_STATE.UNREADABLE);
    expect(result.action.key).toBe(PREPARATION_ACTION.RETRY_READ);
    expect(result.action.href).toBeNull();
  });

  it('asks for the one thing the most blocked version needs, never two at once', () => {
    const result = resolvePreparation({
      rows: [
        row({ publicationStatus: 'published', project: { state: 'stale' } }),
        row({ versionId: 'v2', publicationStatus: 'not_calculated', hasCompletedAuthority: false }),
      ],
      projectId: 'proj-1',
    });
    expect(result.action.key).toBe(PREPARATION_ACTION.FINISH_DESIGN);
    expect(result.versions).toEqual(['Original Design', 'Original Design']);
  });
});