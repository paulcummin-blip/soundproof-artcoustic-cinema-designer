/**
 * engineeringSnapshotEvidence.js (shared)
 * ---------------------------------------
 * Turns the frozen Engineering Snapshot into two things the report generator
 * needs:
 *
 *   1. buildEngineeringEvidence() — a compact, deterministic text block of the
 *      Sound Proof calculated results, injected into every report prompt so
 *      the model writes about the real parameters, levels and values.
 *      The Design Index is deliberately excluded: it is an internal score and
 *      must never reach client-facing copy.
 *
 *   2. selectHighlightRows() — the Key Performance Highlights table rows.
 *      The Result column is read straight out of calculated data here, in the
 *      app, so the AI can never invent, regrade or alter a table value.
 *
 * The AI supplies only prose: the section narrative in body copy, and the
 * "What you hear" cell for the rows selected here. mergeHighlightRows() joins
 * the two, keeping the calculated Result values untouched.
 *
 * Reads the snapshot passively. Never calculates, grades, regroups or
 * re-interprets an engineering result.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

function compose(...parts) {
  const clean = parts
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean);
  return clean.length === 0 ? null : clean.join(' · ');
}

function isAssessed(level) {
  return level && level !== 'N/A' && level !== 'NONE';
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

function paramValue(parameter) {
  if (!parameter) return null;
  const value = parameter.formatted_value ?? parameter.raw_value;
  return value == null ? null : value;
}

function parameterRows(snapshot) {
  const list = snapshot?.rp22?.parameter_headlines;
  return Array.isArray(list) ? list.filter((row) => row && row.parameter_id != null) : [];
}

function findParameter(snapshot, parameterId) {
  return parameterRows(snapshot).find((row) => Number(row.parameter_id) === Number(parameterId)) || null;
}

function levelAndValue(level, value) {
  return compose(isAssessed(level) ? level : null, isAssessed(level) ? value : value);
}

function spreadText(perSeat) {
  if (!Array.isArray(perSeat) || perSeat.length < 2) return null;
  const values = perSeat.map((seat) => Number(seat?.raw_value)).filter(Number.isFinite);
  if (values.length < 2) return null;
  const spread = Math.max(...values) - Math.min(...values);
  return `${spread.toFixed(1)} dB spread across ${values.length} assessed seats`;
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
  if (system.amplification?.specified) lines.push(`Amplification: ${system.amplification.text}`);
  if (snapshot.product_coherence?.text) lines.push(`Speaker families: ${snapshot.product_coherence.text}`);

  // ── RP22 parameter results ──
  const parameters = parameterRows(snapshot)
    .map((row) => {
      const result = compose(isAssessed(row.achieved_level) ? row.achieved_level : null, paramValue(row));
      return result ? `  P${row.parameter_id} ${row.title || ''}: ${result}`.trim() : null;
    })
    .filter(Boolean);
  if (parameters.length > 0) {
    lines.push('', 'RP22 parameter results (achieved level · measured result):', ...parameters);
  }

  // ── Design Index deliberately excluded ──
  // The Design Index is an internal Sound Proof score. It is not a percentage
  // and it is never supplied to a client-facing report writer.

  // ── Bass detail ──
  const bass = snapshot.bass || {};
  const bassLines = [];
  const bassRow = (label, entry) => {
    const result = compose(isAssessed(entry?.achieved_level) ? entry.achieved_level : null, entry?.formatted_value ?? entry?.raw_value);
    if (result) bassLines.push(`  ${label}: ${result}`);
  };
  bassRow('P14 LFE and subwoofer output', bass.p14);
  bassRow('P18 bass extension', bass.p18);
  if (bass.p19?.rsp) {
    const result = compose(
      isAssessed(bass.p19.rsp.level) ? bass.p19.rsp.level : null,
      bass.p19.rsp.display_value ?? bass.p19.rsp.raw_value,
    );
    if (result) bassLines.push(`  P19 bass response at the reference seat: ${result}`);
  }
  if (bass.p20) {
    const result = compose(
      isAssessed(bass.p20.project_floor) ? bass.p20.project_floor : null,
      spreadText(bass.p20.per_seat),
    );
    if (result) bassLines.push(`  P20 bass consistency seat to seat: ${result}`);
  }
  if (bassLines.length > 0) lines.push('', 'Bass results:', ...bassLines);

  // ── Viewing / RP23 ──
  const viewing = snapshot.viewing || {};
  if (viewing.available && viewing.summary) {
    lines.push('', `RP23 viewing: ${compose(viewing.summary, viewing.primary_floor ? `primary floor ${viewing.primary_floor}` : null) || viewing.summary}`);
  }

  // ── Assumed parameters and assessment basis ──
  const assumed = snapshot.rp22?.assumed || {};
  const assumedLines = [
    assumed.p15_noise_floor ? `P15 noise floor: ${compose(assumed.p15_noise_floor.level, assumed.p15_noise_floor.formatted ?? assumed.p15_noise_floor.value)}` : null,
    assumed.p21_early_reflections ? `P21 early reflections: ${compose(assumed.p21_early_reflections.level, assumed.p21_early_reflections.formatted ?? assumed.p21_early_reflections.value)}` : null,
  ].filter(Boolean);
  if (assumedLines.length > 0) lines.push('', 'Assumed parameters:', ...assumedLines);

  const basis = snapshot.rp22?.assessment_basis;
  if (basis) lines.push(`Assessment basis: P12 ${basis.p12_mode}, P13 ${basis.p13_mode}`);

  // ── Strongest and weakest parameters ──
  // The ranked lists carry parameter ids; the achieved level is read from the
  // parameter headlines so the prompt never states a level we cannot resolve.
  const levelById = new Map(
    parameterRows(snapshot).map((row) => [Number(row.parameter_id), row.achieved_level]),
  );
  const describe = (entry) => {
    const id = Number(entry?.parameter_id);
    if (!id) return null;
    const level = levelById.get(id) || entry?.achieved_level || null;
    return level ? `P${id} (${level})` : null;
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

  const rows = [];
  const push = (key, area, result) => {
    const text = compose(result);
    if (text) rows.push({ key, area, result: text });
  };
  const pushParameter = (parameterId, area) => {
    const parameter = findParameter(snapshot, parameterId);
    if (!parameter) return;
    push(`p${parameterId}`, area, levelAndValue(parameter.achieved_level, paramValue(parameter)));
  };

  // Screen and viewing
  const screen = snapshot.room?.screen;
  if (screen) {
    push('screen_size', 'Screen size', screen.manual_dimensions
      ? compose(screen.manual_width_m ? `${screen.manual_width_m}m` : null, screen.manual_height_m ? `${screen.manual_height_m}m` : null, 'manual')
      : (screen.size_inches ? `${screen.size_inches}" ${screen.aspect_ratio || ''}` : null));
  }
  const viewing = snapshot.viewing;
  if (viewing?.available && viewing.summary && !/not calculated/i.test(viewing.summary)) {
    push('rp23_viewing', 'RP23 viewing', viewing.summary);
  }

  // Layout
  if (snapshot.system?.configuration?.text) {
    push('system_layout', 'System layout', snapshot.system.configuration.text);
  }

  // Spatial Resolution
  pushParameter(2, 'Main channels / P2 discrete channel count');
  pushParameter(4, 'Screen consistency / P4');
  pushParameter(5, 'Surround spacing / P5');
  pushParameter(6, 'Surround level consistency / P6');
  pushParameter(7, 'Front wide position / P7');
  pushParameter(9, 'Overhead spacing / P9');
  pushParameter(10, 'Overhead level consistency / P10');

  // Dynamic Range
  pushParameter(12, 'Screen Dynamic Range / P12');
  pushParameter(13, 'Non-screen Dynamic Range / P13');
  const bass = snapshot.bass || {};
  const pushBass = (key, area, entry) => {
    if (!entry) return;
    push(key, area, levelAndValue(entry.achieved_level, entry.formatted_value ?? entry.raw_value));
  };
  pushBass('p14', 'LFE and subwoofer Dynamic Range / P14', bass.p14);

  // Timbre Matching and bass
  pushParameter(16, 'Screen timbre / P16');
  pushParameter(17, 'Surround and overhead timbre / P17');
  pushBass('p18', 'Bass extension / P18', bass.p18);
  if (bass.p19?.rsp) {
    push('p19', 'Bass response / P19', levelAndValue(bass.p19.rsp.level, bass.p19.rsp.display_value ?? bass.p19.rsp.raw_value));
  }
  if (bass.p20) {
    push('p20', 'Bass consistency seat to seat / P20', compose(
      isAssessed(bass.p20.project_floor) ? bass.p20.project_floor : null,
      spreadText(bass.p20.per_seat),
    ));
  }

  // The Design Index is deliberately not a client-facing highlight row. Reports
  // generated before that change may still carry rows keyed dpi_primary,
  // dpi_secondary and dpi_all_seat; the client table filters them at render time.

  return rows;
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
          what_you_hear: { type: 'string' },
        },
        required: ['key', 'what_you_hear'],
      },
    },
  },
  required: ['intro_html', 'rows'],
};

/**
 * The prompt that asks the model for the highlights prose: a short section
 * introduction plus the "What you hear" cell for each calculated row.
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
    'You are writing the Key Performance Highlights section of a client-facing system design summary.',
    '',
    'Return two things:',
    'a) intro_html: one or two sentences introducing the section as the measured summary of this design, as simple HTML with a <p> tag.',
    'b) rows: one entry per row above, using its key exactly, giving the "What you hear" cell.',
    '',
    'Each "What you hear" cell must be one short, specific sentence (about 15 words) telling the client what that result means for them, in plain language.',
    '',
    'RULES:',
    '- Never change, reorder, add or remove a row. The Result values are calculated by Sound Proof and are already final.',
    '- Never invent a value. If a row needs numbers, use only the numbers shown in that row.',
    '- Reference only the RP22 parameters present in the Sound Proof calculated data.',
  ].join('\n');
}

/**
 * Joins the calculated rows with the generated prose, keeping the calculated
 * Result values exactly as selected.
 *
 * @param {Array<{ key, area, result }>} rows
 * @param {Array<{ key, what_you_hear }>} aiRows
 * @returns {Array<{ key, area, result, what_you_hear }>}
 */
export function mergeHighlightRows(rows, aiRows) {
  const byKey = new Map(
    (Array.isArray(aiRows) ? aiRows : [])
      .filter((row) => row && row.key)
      .map((row) => [String(row.key), String(row.what_you_hear || '').trim()]),
  );

  return (rows || []).map((row) => ({
    key: row.key,
    area: row.area,
    result: row.result,
    what_you_hear: byKey.get(String(row.key)) || '',
  }));
}