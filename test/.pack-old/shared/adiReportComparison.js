/**
 * adiReportComparison.js (shared)
 * -------------------------------
 * The comparison half of the Stage 1 ADI interpretation.
 *
 * A System Design Comparison uses the same voice as a single report: it
 * explains what stays the same, what changes, and what the client gains from
 * the change. It is not an equipment table.
 *
 * Reads the Stage 1 interpretation objects only. Never recalculates anything.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

import { REPORT_STRUCTURES } from './adiReportEvidenceRules.js';

function listOrNone(values) {
  const list = (values || []).filter(Boolean);
  return list.length > 0 ? list.join('; ') : 'None identified.';
}

function floorFor(interpretation, structure) {
  return (interpretation?.reliable_evidence?.structures || [])
    .find((entry) => entry.structure === structure)?.level || null;
}

/**
 * Compare two or more interpretations from the SAME project.
 *
 * @param {Array<{ label: string, interpretation: Object }>} entries
 * @returns {{ shared: string[], changes: string[], labels: Array<string|null> }}
 */
export function compareInterpretations(entries = []) {
  const list = (entries || []).filter((entry) => entry?.interpretation);
  if (list.length < 2) return { shared: [], changes: [], labels: list.map((entry) => entry?.label || null) };

  const values = (reader) => list.map((entry) => reader(entry.interpretation));
  const shared = [];
  const changes = [];
  const compare = (label, reader) => {
    const readings = values(reader);
    const known = readings.filter((value) => value != null && value !== '');
    if (known.length < 2) return;
    if (new Set(known.map(String)).size === 1) shared.push(`${label}: ${known[0]}`);
    else changes.push(`${label}: ${list.map((entry, index) => `${entry.label} ${readings[index] ?? 'not stated'}`).join('; ')}`);
  };

  compare('Room', (i) => i.room_type);
  compare('Design intent', (i) => i.primary_design_intent);
  compare('Defining feature', (i) => i.defining_feature);
  compare('System format', (i) => i.reliable_evidence?.system?.configuration);
  compare('Discrete channels', (i) => i.reliable_evidence?.system?.discrete_channels);
  compare('Subwoofers', (i) => i.reliable_evidence?.system?.subwoofer_count);
  compare('Screen', (i) => (i.reliable_evidence?.screen?.width_m != null
    ? `${i.reliable_evidence.screen.width_m.toFixed(2)}m`
    : null));
  for (const structure of REPORT_STRUCTURES) {
    compare(structure, (i) => floorFor(i, structure));
  }

  return { shared, changes, labels: list.map((entry) => entry.label) };
}

/**
 * The comparison instruction block for the report writer.
 * Contains no em dashes.
 */
export function formatComparisonInterpretationForPrompt(comparison) {
  if (!comparison) return '';
  return [
    '=== ADI COMPARISON READING (Stage 1 of 2) ===',
    '',
    'What stays the same:',
    listOrNone(comparison.shared),
    '',
    'What changes:',
    listOrNone(comparison.changes),
    '',
    'HOW TO USE THIS:',
    '- Explain what stays the same first, then what changes, then what the client gains from the change.',
    '- Compare the experience, not the equipment. Do not turn this into a specification table.',
    '- Where one system is clearly stronger, say why, without attacking the alternative.',
    '=== END ADI COMPARISON READING ===',
  ].join('\n');
}