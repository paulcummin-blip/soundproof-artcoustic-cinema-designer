/**
 * comparisonEvidence.js (shared)
 * ------------------------------
 * The per-version evidence contract for a System Design Comparison.
 *
 * Every selected version gets its own frozen evidence block, built ONLY from
 * that version's frozen Engineering Snapshot and the existing evidence rules
 * (adiReportEvidenceRules). Nothing is calculated, graded, regrouped or
 * invented here: results are copied, labelled and grouped.
 *
 * Excluded parameters (P8, P15, P21) and assumed parameters can never appear:
 * they are filtered by the existing rules and are listed as excluded. Bass
 * consistency (P20) appears only when the P20 rule admits it, which is what
 * lets a comparison show one bass layout as more even across seats than
 * another.
 * The Design Index is also internal: it is never supplied to the writer here,
 * never a comparison row and never expressed as a percentage.
 *
 * Pure: no React, no side effects.
 */

import {
  REPORT_STRUCTURES,
  EXCLUDED_PARAMETERS,
  plainLanguageName,
  resolveBassEvidence,
  splitParameterEvidence,
  readReliableResult,
} from './adiReportEvidenceRules.js';

function compose(...parts) {
  const clean = parts.map((part) => (part == null ? '' : String(part).trim())).filter(Boolean);
  return clean.length === 0 ? null : clean.join(' · ');
}

function describeEvidenceRow(entry) {
  return {
    parameter_id: entry.parameter_id,
    label: entry.label,
    level: entry.level || null,
    value: entry.value || null,
    text: entry.text || null,
  };
}

const EVIDENCE_LIMIT_PER_STRUCTURE = 8;

function evidenceForStructure(parameterEvidence, bassEvidence, structure) {
  const rows = [...(parameterEvidence.byStructure[structure] || [])];
  if (structure === 'Dynamic Range' && bassEvidence.p14) rows.push(bassEvidence.p14);
  if (structure === 'Timbre Matching' && bassEvidence.p18) rows.push(bassEvidence.p18);
  if (structure === 'Timbre Matching' && bassEvidence.p19) rows.push(bassEvidence.p19);
  if (structure === 'Timbre Matching' && bassEvidence.p20) rows.push(bassEvidence.p20);
  // A bass result that is also present in the parameter headlines (P20) is
  // listed once.
  return rows
    .filter((row, index) => rows.findIndex((other) => other.parameter_id === row.parameter_id) === index)
    .map(describeEvidenceRow);
}

/**
 * Build the evidence contract for ONE version.
 *
 * @param {Object} input
 * @param {Object} input.snapshot — that version's frozen Engineering Snapshot
 * @param {string} input.versionId
 * @param {string} input.versionName
 * @param {string} [input.label] — the option label used in the report ("Option A")
 * @param {Object} [input.projectIdentity]
 * @returns {Object} the selected_versions entry
 */
export function buildVersionEvidence({
  snapshot = null,
  versionId = null,
  versionName = null,
  label = null,
  projectIdentity = null,
} = {}) {
  const base = {
    version_id: versionId,
    version_name: versionName,
    label,
    project_identity: projectIdentity,
    source_identity: { ...(snapshot?.identity || {}), versionId },
    available: false,
    reason: null,
  };

  if (!snapshot || snapshot.available !== true) {
    return {
      ...base,
      reason: 'No calculated engineering result is available for this version.',
      rp22_results: [],
      dynamic_range_evidence: [],
      spatial_resolution_evidence: [],
      timbre_matching_evidence: [],
      bass_evidence_if_reliable: null,
      limitations: [],
      reliable_evidence: [],
      excluded_evidence: [],
    };
  }

  const parameterEvidence = splitParameterEvidence(snapshot);
  const bassEvidence = resolveBassEvidence(snapshot);
  const room = snapshot.room || {};
  const system = snapshot.system || {};
  const viewing = snapshot.viewing || {};

  const limitations = [];
  if (Array.isArray(snapshot.rp22?.weaknesses)) {
    for (const weakness of snapshot.rp22.weaknesses) {
      const id = Number(weakness?.parameter_id);
      const known = parameterEvidence.used.find((row) => row.parameter_id === id);
      if (known) limitations.push(`${known.label} (P${id}, ${known.level || 'assessed'})`);
    }
  }
  if (bassEvidence.usable.length === 0) {
    limitations.push('No reliable bass result for this version.');
  }

  const excluded = [];
  const addExcluded = (entry) => {
    if (!entry) return;
    if (excluded.some((existing) => existing.parameter_id === entry.parameter_id)) return;
    excluded.push(entry);
  };
  for (const [id, reason] of Object.entries(EXCLUDED_PARAMETERS)) {
    addExcluded({ parameter_id: Number(id), label: plainLanguageName(Number(id)), reason });
  }
  for (const entry of parameterEvidence.omitted) addExcluded(entry);
  for (const entry of bassEvidence.omitted) addExcluded(entry);

  return {
    ...base,
    available: true,
    project_identity: projectIdentity || {
      project: snapshot.project?.name || null,
      client: snapshot.project?.client_name || null,
      reference: snapshot.project?.project_reference || null,
    },
    system_format: compose(system.configuration?.text, system.channel_layout?.total_discrete
      ? `${system.channel_layout.total_discrete} discrete channels`
      : null),
    // The short form is used for the comparison table's System layout row, so a
    // change between formats reads as a format change.
    system_format_short: system.configuration?.dolby_config || system.configuration?.text || (system.channel_layout?.total_discrete
      ? `${system.channel_layout.total_discrete} channels`
      : null),
    screen_data: {
      size_inches: room.screen?.size_inches ?? null,
      aspect_ratio: room.screen?.aspect_ratio || null,
      manual_dimensions: room.screen?.manual_dimensions === true,
      manual_width_m: room.screen?.manual_width_m ?? null,
      manual_height_m: room.screen?.manual_height_m ?? null,
      interpretation: room.screen?.interpretation || null,
    },
    seating_data: {
      interpretation: room.seating?.interpretation || null,
      // snapshot.seats is the canonical seat snapshot array.
      seat_count: Array.isArray(snapshot.seats) ? snapshot.seats.length : 0,
      row_count: Array.isArray(snapshot.seats)
        ? new Set(snapshot.seats.map((seat) => seat?.row).filter((row) => row !== null && row !== undefined)).size
        : 0,
    },
    speaker_package: Array.isArray(system.product_roles)
      ? system.product_roles.map((role) => ({
        role: role.role || null,
        role_description: role.role_description || null,
        model: role.model_label || role.model_key || null,
      }))
      : [],
    subwoofer_package: {
      strategy: system.subwoofer_strategy?.count && system.subwoofer_strategy?.models?.length
        ? `${system.subwoofer_strategy.count} × ${[...new Set(system.subwoofer_strategy.models)].map((model) => String(model).toUpperCase()).join(' / ')}`
        : system.subwoofer_strategy?.strategy_text || null,
      summary: snapshot.bass?.subwoofer_strategy_summary || null,
    },
    // The amplification the version specifies, as a clean comparable figure. The
    // dynamic range grades are delivered by the speakers, the subwoofers and the
    // power behind them, so the power is part of the comparison rather than
    // background detail. Read from the snapshot's own statement: never inferred,
    // and null when the version states no power.
    amplification: system.amplification?.specified === true && Number(system.amplification?.power_w)
      ? `${Number(system.amplification.power_w)} W`
      : null,
    // Comparisons disclose assessed weak P20 results neutrally; positive narrative
    // claims still follow the unchanged report evidence rules.
    comparison_p20: readReliableResult((snapshot.rp22?.parameter_headlines || []).find((row) => Number(row.parameter_id) === 20)),
    rp22_results: parameterEvidence.used.map(describeEvidenceRow),
    rp23_results: {
      available: viewing.available === true,
      summary: viewing.summary || null,
      primary_floor: viewing.primary_floor || null,
    },
    dynamic_range_evidence: evidenceForStructure(parameterEvidence, bassEvidence, 'Dynamic Range'),
    spatial_resolution_evidence: evidenceForStructure(parameterEvidence, bassEvidence, 'Spatial Resolution'),
    timbre_matching_evidence: evidenceForStructure(parameterEvidence, bassEvidence, 'Timbre Matching'),
    bass_evidence_if_reliable: bassEvidence.usable.length > 0
      ? {
        p14: bassEvidence.p14 ? describeEvidenceRow(bassEvidence.p14) : null,
        p18: bassEvidence.p18 ? describeEvidenceRow(bassEvidence.p18) : null,
        p19: bassEvidence.p19 ? describeEvidenceRow(bassEvidence.p19) : null,
        p20: bassEvidence.p20 ? describeEvidenceRow(bassEvidence.p20) : null,
      }
      : null,
    limitations,
    reliable_evidence: parameterEvidence.used.map((row) => row.parameter_id),
    excluded_evidence: excluded,
  };
}

/**
 * Build the whole selected_versions contract.
 *
 * @param {Array<{ version_id, version_name, snapshot }>} entries
 * @returns {Array<Object>}
 */
export function buildSelectedVersionEvidence(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return list.map((entry, position) => buildVersionEvidence({
    snapshot: entry?.snapshot || null,
    versionId: entry?.version_id || entry?.snapshot?.identity?.versionId || null,
    versionName: entry?.version_name || entry?.snapshot?.version?.name || null,
    label: optionLabel(position),
    projectIdentity: entry?.snapshot?.project
      ? {
        project: entry.snapshot.project.name || null,
        client: entry.snapshot.project.client_name || null,
        reference: entry.snapshot.project.project_reference || null,
      }
      : null,
  }));
}

/** The client-facing option label for a version position: Option A, Option B... */
export function optionLabel(position = 0) {
  const letter = String.fromCharCode(65 + (Number(position) || 0));
  return `Option ${letter}`;
}

/**
 * The prompt block carrying every version's evidence.
 *
 * @param {Array<Object>} versions — buildSelectedVersionEvidence output
 * @returns {string}
 */
export function formatVersionEvidenceForPrompt(versions) {
  const list = Array.isArray(versions) ? versions : [];
  const lines = ['=== VERSION EVIDENCE (Sound Proof calculated data, frozen at generation, never alter or invent) ==='];

  for (const version of list) {
    lines.push('', `--- ${version.label || 'Option'}: ${version.version_name || 'Unnamed version'} ---`);
    if (!version.available) {
      lines.push(`No calculated engineering result is available for this version (${version.reason || 'not calculated'}). Do not describe its performance.`);
      continue;
    }

    if (version.system_format) lines.push(`System: ${version.system_format}`);
    if (version.screen_data?.interpretation) lines.push(`Screen: ${version.screen_data.interpretation}`);
    else if (version.screen_data?.size_inches) {
      lines.push(`Screen: ${version.screen_data.size_inches}" ${version.screen_data.aspect_ratio || ''}`.trim());
    }
    if (version.seating_data?.interpretation) lines.push(`Seating: ${version.seating_data.interpretation}`);
    if (version.speaker_package?.length > 0) {
      lines.push(`Loudspeakers: ${version.speaker_package
        .map((role) => `${role.role_description || role.role}: ${role.model}`)
        .join(' | ')}`);
    }
    if (version.subwoofer_package?.strategy) lines.push(`Subwoofers: ${version.subwoofer_package.strategy}`);
    if (version.amplification) lines.push(`Amplification: ${version.amplification}`);
    if (version.rp23_results?.summary) lines.push(`RP23 viewing: ${version.rp23_results.summary}`);

    for (const structure of REPORT_STRUCTURES) {
      const key = structure === 'Spatial Resolution'
        ? 'spatial_resolution_evidence'
        : structure === 'Dynamic Range'
          ? 'dynamic_range_evidence'
          : 'timbre_matching_evidence';
      const rows = (version[key] || []).slice(0, EVIDENCE_LIMIT_PER_STRUCTURE);
      if (rows.length === 0) continue;
      lines.push(`${structure}:`);
      for (const row of rows) {
        lines.push(`  ${row.label} (P${row.parameter_id}): ${row.text}`);
      }
    }

    if (version.limitations?.length > 0) {
      lines.push(`Limitations in this version (state honestly where relevant): ${version.limitations.join(', ')}`);
    }
  }

  // The exclusion list is the rule list, stated once for the whole report.
  lines.push(
    '',
    'Never reference these in any version:',
    ...Object.entries(EXCLUDED_PARAMETERS).map(([id, reason]) => `  ${plainLanguageName(Number(id))} - ${reason}`),
    '  Assumed parameters (background noise, early reflections) are never referenced either.',
  );

  return lines.join('\n');
}