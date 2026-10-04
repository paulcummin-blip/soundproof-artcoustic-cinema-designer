/**
 * engineeringSnapshotEvidence.js (shared)
 * ---------------------------------------
 * Turns the frozen Engineering Snapshot into two things the report generator
 * needs:
 *
 *   1. buildEngineeringEvidence() — a compact, deterministic text block of the
 *      Sound Proof calculated results, injected into every report prompt so
 *      the model writes about the real parameters, levels and values.
 *      The Design Index is deliberately excluded: it is an internal designer
 *      diagnostic and must never reach client-facing copy.
 *
 *   2. selectHighlightRows() — the Key Performance Highlights table rows.
 *      The Result column is read straight out of calculated data here, in the
 *      app, so the AI can never invent, regrade or alter a table value.
 *
 * The AI supplies only prose: the section narrative in body copy, and the
 * "What the room gains" cell for the rows selected here (stored under the
 * what_the_room_gains key; the legacy what_you_hear key is still read).
 * mergeHighlightRows() joins the two, keeping the
 * calculated Result values untouched.
 *
 * Reads the snapshot passively. Never calculates, grades, regroups or
 * re-interprets an engineering result.
 *
 * Evidence rules (see adiReportEvidenceRules.js):
 *   - Results are grouped under the three design structures the report is
 *     written around: Spatial Resolution, Dynamic Range, Timbre Matching.
 *   - Parameters excluded from client-facing reports (P8, P15, P21) are never
 *     offered to the writer, and neither is any result that is not reliable:
 *     unreliable results are listed as not used instead.
 *   - Bass consistency (P20) is offered only when the P20 rule admits it:
 *     current, positive (L3 or L4) and useful across more than one seat.
 *   - The Design Index is internal: it is never supplied as a value, never a
 *     highlight row and never evidence in the prose.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

import {
  REPORT_STRUCTURES,
  HIGHLIGHT_ROW_LIMIT,
  EXCLUDED_PARAMETERS,
  orderHighlightRows,
  plainLanguageName,
  resolveBassEvidence,
  splitParameterEvidence,
} from './adiReportEvidenceRules.js';
import { DESIGN_LED_VOICE_RULES, DESIGN_INDEX_HARD_RULES, isDesignIndexRow } from './reportWritingStyleContract.js';
import { summariseSubwooferConfiguration } from './subwooferConfigurationSummary.js';

function compose(...parts) {
  const clean = parts
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean);
  return clean.length === 0 ? null : clean.join(' · ');
}

/**
 * Engineering Authority wraps some facts in { statement, confidence, source }.
 * Read the statement itself; plain values pass through unchanged.
 */
function statement(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value.statement ?? null;
  return value;
}

/**
 * A compact block of the authoritative Sound Proof calculated data.
 * Returns '' when the snapshot carries no usable engineering results.
 *
 * @param {Object} snapshot — frozen Engineering Snapshot (Proposal.engineering_snapshot)
 * @returns {string}
 */
export function buildEngineeringEvidence(snapshot) {
  if (!snapshot || snapshot.available !== true) return '';

  const lines = ['=== SOUND PROOF CALCULATED DATA (authoritative, never alter or invent) ==='];

  // ── Room, screen, seating ──
  const room = snapshot.room || {};
  if (room.dimensions_text) {
    lines.push(`Room: ${compose(room.dimensions_text, statement(room.classification), room.volume_m3 ? `${room.volume_m3} m3` : null) || room.dimensions_text}`);
  }
  if (room.screen?.interpretation) lines.push(`Screen: ${room.screen.interpretation}`);
  if (room.seating?.interpretation) lines.push(`Seating: ${room.seating.interpretation}`);
  if (room.acoustic_treatment?.enabled) lines.push(`Acoustic treatment: ${room.acoustic_treatment.interpretation}`);

  // ── System and products ──
  const system = snapshot.system || {};
  if (system.configuration?.text) lines.push(`System: ${system.configuration.text}`);
  if (system.channel_layout?.total_discrete) {
    lines.push(`Discrete channels: ${system.channel_layout.total_discrete}`);
  }
  const roles = Array.isArray(system.product_roles) ? system.product_roles : [];
  if (roles.length > 0) {
    lines.push(`Loudspeakers: ${roles.map((role) => `${role.role_description || role.role}: ${role.model_label || role.model_key}`).join(' | ')}`);
  }
  if (system.subwoofer_strategy?.strategy_text) {
    lines.push(`Subwoofers: ${system.subwoofer_strategy.strategy_text}`);
  }
  // The configuration is stated from this version's own subwoofer instances, so
  // the writer and the example chips state the same count and front/rear layout.
  const subwoofers = summariseSubwooferConfiguration(system);
  if (subwoofers.humanReadableSummary) {
    lines.push(`Subwoofer configuration: ${subwoofers.humanReadableSummary}`);
  }
  if (system.amplification?.specified) lines.push(`Amplification: ${system.amplification.text}`);
  if (snapshot.product_coherence?.text) lines.push(`Speaker families: ${snapshot.product_coherence.text}`);

  // ── The three design structures the report is written around ──
  const primaryCategories = snapshot.rp22?.categories?.primary?.available
    ? snapshot.rp22.categories.primary.categories
    : snapshot.rp22?.categories?.all_seat?.categories;
  const structureFloors = (Array.isArray(primaryCategories) ? primaryCategories : [])
    .filter((category) => category?.label && category?.floor)
    .map((category) => `${category.label}: ${category.floor}`);
  if (structureFloors.length > 0) {
    lines.push('', `Design structures (write around these, not around the parameters): ${structureFloors.join(' | ')}`);
  }

  // ── RP22 results, grouped under those structures ──
  // Reliable bass results sit inside the structure they support: P14 under
  // Dynamic Range, P18 and P19 under Timbre Matching.
  const parameterEvidence = splitParameterEvidence(snapshot);
  const bassEvidence = resolveBassEvidence(snapshot);
  const bassByStructure = {
    'Dynamic Range': [bassEvidence.p14].filter(Boolean),
    'Timbre Matching': [bassEvidence.p18, bassEvidence.p19, bassEvidence.p20].filter(Boolean),
  };
  const structureLines = [];
  for (const structure of REPORT_STRUCTURES) {
    // A bass result that is also present in the parameter headlines (P20) is
    // listed once.
    const rows = [
      ...(parameterEvidence.byStructure[structure] || []),
      ...(bassByStructure[structure] || []),
    ].filter((row, index, all) => all.findIndex((other) => other.parameter_id === row.parameter_id) === index);
    if (rows.length === 0) continue;
    structureLines.push(`  ${structure}:`);
    for (const row of rows) {
      structureLines.push(`    ${row.label} (P${row.parameter_id}): ${row.text}`);
    }
  }
  if (structureLines.length > 0) {
    lines.push('', 'RP22 evidence inside those structures (achieved level · measured result):', ...structureLines);
  } else {
    lines.push('', 'RP22 evidence: no result was assessed reliably for this design.');
  }

  // Every result the report must not use, so the writer cannot reach for it:
  // the rule list is stated whether or not the result is present in the data.
  const notUsed = [];
  const addNotUsed = (entry) => {
    if (!entry) return;
    if (notUsed.some((existing) => existing.parameter_id === entry.parameter_id)) return;
    notUsed.push(entry);
  };
  // The rule list goes first so its canonical plain-language wording is kept.
  for (const [id, reason] of Object.entries(EXCLUDED_PARAMETERS)) {
    const parameterId = Number(id);
    addNotUsed({ parameter_id: parameterId, label: plainLanguageName(parameterId), reason });
  }
  for (const entry of parameterEvidence.omitted) addNotUsed(entry);
  for (const entry of bassEvidence.omitted) addNotUsed(entry);
  if (notUsed.length > 0) {
    // Plain language, no parameter codes: the writer never sees a code it could
    // echo into client-facing text.
    lines.push(
      '',
      'Not used in this report (never reference these):',
      ...notUsed.map((entry) => `  ${entry.label} - ${entry.reason}`),
    );
  }

  // ── Design Index: deliberately withheld ──
  // It is an internal designer diagnostic, so no value from snapshot.rp22.dpi is
  // supplied to the writer. The rule is stated instead, so a point that used to
  // rest on the index is made from the design evidence above.
  lines.push('', DESIGN_INDEX_HARD_RULES, 'Design Index values are not supplied to this report. Make every point from the design evidence above.');

  // ── Bass availability ──
  // When nothing reliable exists the writer is told so, rather than being left
  // to fill the gap with a claim.
  if (bassEvidence.usable.length === 0) {
    lines.push('', 'Bass results: no reliable bass result for this design. Do not describe bass performance, bass extension, bass consistency or subwoofer output.');
  }

  // ── Viewing / RP23 ──
  const viewing = snapshot.viewing || {};
  if (viewing.available && viewing.summary) {
    lines.push('', `RP23 viewing: ${compose(viewing.summary, viewing.primary_floor ? `primary floor ${viewing.primary_floor}` : null) || viewing.summary}`);
  }

  // ── Assumed parameters ──
  // A client-facing report never references an assumed parameter. The facts are
  // recorded here only so the writer knows they must not be used, and they also
  // appear in the "not used" list above.
  const assumed = snapshot.rp22?.assumed || {};
  const assumedNames = [
    assumed.p15_noise_floor ? 'background noise assumption' : null,
    assumed.p21_early_reflections ? 'early reflection assumption' : null,
  ].filter(Boolean);
  if (assumedNames.length > 0) {
    lines.push(`Assumed parameters, never referenced in this report: ${assumedNames.join(', ')}.`);
  }

  const basis = snapshot.rp22?.assessment_basis;
  if (basis) lines.push(`Assessment basis: P12 ${basis.p12_mode}, P13 ${basis.p13_mode}`);

  // ── Strongest and weakest parameters ──
  // The ranked lists carry parameter ids; the achieved level is read from the
  // parameter headlines so the prompt never states a level we cannot resolve.
  const levelById = new Map(
    parameterEvidence.used.map((row) => [row.parameter_id, { level: row.level, label: row.label }]),
  );
  const describe = (entry) => {
    const id = Number(entry?.parameter_id);
    if (!id) return null;
    const known = levelById.get(id);
    // An excluded or unreliable result is never described to the client,
    // whatever the ranking in the snapshot says.
    if (!known) return null;
    return `${known.label} (P${id}, ${known.level || entry?.achieved_level || 'assessed'})`;
  };
  const strengths = (snapshot.rp22?.strengths || []).map(describe).filter(Boolean);
  const weaknesses = (snapshot.rp22?.weaknesses || []).map(describe).filter(Boolean);
  if (strengths.length > 0) lines.push('', `Strongest parameters: ${strengths.join(', ')}`);
  if (weaknesses.length > 0) lines.push(`Weakest parameters (state honestly if relevant): ${weaknesses.join(', ')}`);

  lines.push('=== END SOUND PROOF CALCULATED DATA ===');
  return lines.join('\n');
}

/**
 * The Key Performance Highlights rows.
 *
 * Reads calculated values straight out of the snapshot. Rows without any
 * result are omitted, so a design is only ever presented with the areas that
 * were genuinely assessed.
 *
 * @param {Object} snapshot
 * @returns {Array<{ key: string, area: string, result: string }>}
 */
export function selectHighlightRows(snapshot) {
  if (!snapshot || snapshot.available !== true) return [];

  const byId = new Map();
  const { byStructure } = splitParameterEvidence(snapshot);
  for (const rows of Object.values(byStructure)) {
    for (const row of rows) byId.set(row.parameter_id, row);
  }
  for (const entry of resolveBassEvidence(snapshot).usable) byId.set(entry.parameter_id, entry);

  const candidates = [];
  const push = (key, area, result) => {
    const text = compose(result);
    if (text) candidates.push({ key, area, result: text });
  };
  const pushParameter = (parameterId) => {
    const entry = byId.get(Number(parameterId));
    if (!entry) return;
    push(`p${parameterId}`, entry.label, entry.text);
  };

  // Screen, viewing and layout describe the room the client is buying.
  const screen = snapshot.room?.screen;
  if (screen) {
    push('screen_size', 'Screen', screen.manual_dimensions
      ? compose(screen.manual_width_m ? `${screen.manual_width_m}m` : null, screen.manual_height_m ? `${screen.manual_height_m}m` : null, 'manual')
      : (screen.size_inches ? `${screen.size_inches}" ${screen.aspect_ratio || ''}` : null));
  }
  const viewing = snapshot.viewing;
  if (viewing?.available && viewing.summary && !/not calculated/i.test(viewing.summary)) {
    push('rp23_viewing', 'RP23 viewing', viewing.summary);
  }
  if (snapshot.system?.configuration?.text) {
    push('system_layout', 'System layout', snapshot.system.configuration.text);
  }

  // Evidence inside the three structures, in client usefulness order. Excluded
  // parameters (P8, P15, P21) and unreliable results are absent from byId, so
  // they can never reach the table. Bass consistency (P20) is present only when
  // the P20 rule admitted it: current, positive and useful.
  const EVIDENCE_ORDER = [2, 4, 5, 7, 9, 12, 13, 14, 16, 17, 18, 19, 20, 6, 10];
  for (const parameterId of EVIDENCE_ORDER) pushParameter(parameterId);

  // The Design Index is an internal designer diagnostic, so it is never a row
  // here; a row arriving from older data is dropped by the shared guard.
  const clientFacing = candidates.filter((row) => !isDesignIndexRow(row));

  // Only the most useful results are carried, and the Result column is read
  // from calculated data.
  return orderHighlightRows(clientFacing).slice(0, HIGHLIGHT_ROW_LIMIT);
}

/** JSON schema for the highlights prose response. */
export const HIGHLIGHTS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intro_html: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          what_the_room_gains: { type: 'string' },
        },
        required: ['key', 'what_the_room_gains'],
      },
    },
  },
  required: ['intro_html', 'rows'],
};

/**
 * The prompt that asks the model for the highlights prose: a short section
 * introduction plus the "What the room gains" cell for each calculated row.
 *
 * @param {string} evidence — buildEngineeringEvidence() output
 * @param {Array<{ key, area, result }>} rows
 * @returns {string}
 */
export function buildHighlightsPrompt(evidence, rows) {
  const list = (rows || []).map((row, index) => `${index + 1}. [${row.key}] ${row.area} | ${row.result}`);

  return [
    evidence,
    '',
    '=== TABLE ROWS (fixed, calculated by Sound Proof) ===',
    ...list,
    '',
    'Write the Key Performance Highlights section of a client-facing system design report, in the design-led voice defined in the style contract below.',
    '',
    'Return two things:',
    'a) intro_html: one or two sentences introducing the section as the measured summary of this design, as simple HTML with a <p> tag. State that each row carries what the result gives the room. Do not list the rows.',
    'b) rows: one entry per row above, using its key exactly, giving the "What the room gains" cell.',
    '',
    'Each "What the room gains" cell is one short, specific sentence (about 15 words) describing what that result gives the room, in plain language. The numbers support the sentence. They are not the sentence.',
    DESIGN_LED_VOICE_RULES,
    '',
    'RULES:',
    '- Never change, reorder, add or remove a row. The Result values are calculated by Sound Proof and are already final.',
    '- Never invent a value, a product or a result. If a cell needs a number, use only the numbers shown in that row.',
    '- Reference only the results shown in the table above. Do not mention a parameter, a level or a measurement that is not in it.',
    '- Say what the result means for the room, not what the parameter is called, and do not explain an obvious result.',
    "- Where a row's result is Level 1 or Level 2, never describe it as excellent, outstanding or a strength: state plainly what that result gives the room and what limits it.",
    '- Never write a cell for an assumed parameter, and never reference P8, P15 or P21.',
    '- A bass consistency row appears only where it is shown in the table above. Its cell explains more even bass across the seating area. Where there is no such row, write nothing about bass consistency and never suggest moving or adding subwoofers.',
    '- Never mention the Design Index, a design score, a design rating or a percentage: it is an internal designer diagnostic, not a client-facing result.',
    '- Use the voice above: keep the room, the design, the system and the listening result as the subject. Never address the client as "you", and never write "we designed" or "we recommend".',
  ].join('\n');
}

/**
 * Joins the calculated rows with the generated prose, keeping the calculated
 * Result values exactly as selected.
 *
 * @param {Array<{ key, area, result }>} rows
 * @param {Array<{ key, what_the_room_gains }>} aiRows
 * @returns {Array<{ key, area, result, what_the_room_gains }>}
 */
export function mergeHighlightRows(rows, aiRows) {
  const byKey = new Map(
    (Array.isArray(aiRows) ? aiRows : [])
      .filter((row) => row && row.key)
      .map((row) => [String(row.key), String(row.what_the_room_gains ?? row.what_you_hear ?? '').trim()]),
  );

  return (rows || []).map((row) => ({
    key: row.key,
    area: row.area,
    result: row.result,
    // What this result gives the room. Any row that already carries the legacy
    // what_you_hear key is still read, so existing proposals keep rendering.
    what_the_room_gains: byKey.get(String(row.key)) || '',
  }));
}