/**
 * designContextDiscovery.js (shared)
 * ------------------------------------
 * HYBRID QUESTION DISCOVERY: identifies up to three design decisions whose
 * reasons are not established by the engineering data, so ADI can ask the
 * designer rather than assume.
 *
 * The principle: when ADI knows WHAT was designed but not WHY, ask the designer
 * rather than assume.
 *
 * THE THREE LAYERS ADI DISTINGUISHES:
 *   1. Engineering facts — established by the design and its calculations.
 *   2. Technical interpretations — that can reasonably follow from those facts.
 *   3. Human design intent — explaining why a decision was made.
 *
 * ADI must never present a technical interpretation as the designer's motivation
 * unless that motivation has been explicitly supplied. For example, if seating
 * is positioned unusually far from the rear wall, ADI can recognise that geometry
 * and its potential acoustic consequences. It must NOT conclude that the seating
 * was positioned there to improve acoustics. Instead, ask the designer.
 *
 * HYBRID APPROACH:
 *   - Deterministic checks for known patterns (seating clearance, subwoofer
 *     arrangement, overhead count, acoustic treatment, single-row in a large
 *     room).
 *   - Tightly guarded AI discovery for other clearly evidenced anomalies, only
 *     when the deterministic checks found fewer than three questions.
 *
 * Each question carries a decision_fingerprint: a fingerprint of the specific
 * design inputs that prompted it. When those inputs change, the saved answer is
 * marked as needing reconfirmation.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. The AI call is injected.
 */

import { readSeatBoundaryGeometry } from '../seatingBoundaryPrinciple.js';
import {
  decisionKeyForQuestion,
  decisionKeyForQuestionId,
  canonicalSubwooferFingerprint,
} from './designContextDecisionIdentity.js';
import {
  readVerifiedDesignFacts,
  questionContradictsFacts,
} from './designContextFacts.js';

/** The maximum number of questions discovery may return. */
export const MAX_DISCOVERY_QUESTIONS = 3;

/** The areas a question may belong to. */
export const CONTEXT_AREA = Object.freeze({
  SEATING: 'seating',
  SUBWOOFERS: 'subwoofers',
  OVERHEADS: 'overheads',
  TREATMENT: 'treatment',
  SCREEN: 'screen',
  LAYOUT: 'layout',
});

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** A stable fingerprint for one decision's specific inputs. */
function decisionFingerprint(area, inputs) {
  const text = `${area}:${JSON.stringify(inputs, Object.keys(inputs).sort())}`;
  return `dc1-${fnv1a(text)}-${text.length.toString(16)}`;
}

/** Parse a value the design state may store as JSON text or as an object. */
function parseMaybe(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read the design state from a version, handling both object and JSON-string forms.
 */
function readDesignState(version) {
  return parseMaybe(version?.design_state) || {};
}

/**
 * Read room dimensions from the design state, handling both naming conventions.
 *
 * Many saved versions do not carry the room dimensions inside their design_state
 * at all — the dimensions live on the parent Project entity (roomDims JSON,
 * room_width/room_length/room_height). The parent Project is supplied as a
 * fallback so a deterministic check that needs the room geometry can still run
 * for those versions. The design state is always preferred: it is the version's
 * own authority for its room, and a version whose room has been edited away from
 * the project's recorded dimensions is read from the version.
 */
function readRoomDims(state, project = null) {
  const dims = parseMaybe(state.roomDims) || {};
  const projDims = parseMaybe(project?.roomDims) || {};
  return {
    widthM: num(dims.widthM ?? dims.width_m) ?? num(state.room_width) ?? num(projDims.widthM ?? projDims.width_m) ?? num(project?.room_width),
    lengthM: num(dims.lengthM ?? dims.length_m) ?? num(state.room_length) ?? num(projDims.lengthM ?? projDims.length_m) ?? num(project?.room_length),
    heightM: num(dims.heightM ?? dims.height_m) ?? num(state.room_height) ?? num(projDims.heightM ?? projDims.height_m) ?? num(project?.room_height),
  };
}

/**
 * Read seating positions from the design state, handling both naming conventions.
 */
function readSeatingPositions(state) {
  const seats = Array.isArray(state.seatingPositions)
    ? state.seatingPositions
    : (Array.isArray(state.seating_positions) ? state.seating_positions : []);
  return seats.map((seat, index) => {
    const x = num(seat?.x ?? seat?.x_m ?? seat?.position?.x);
    const y = num(seat?.y ?? seat?.y_m ?? seat?.position?.y);
    if (x === null || y === null) return null;
    return {
      id: String(seat?.id ?? `seat-${index}`),
      label: String(seat?.label ?? seat?.id ?? `seat-${index}`),
      x,
      y,
      row: num(seat?.row ?? seat?.rowNumber),
      isPrimary: seat?.isPrimary === true,
    };
  }).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check 1: Seating positioned well forward of the rear wall.
 *
 * If the rear row has significant space behind it (>= 1.5m), the designer may
 * have a reason for leaving that space (a bar, furniture, circulation, an
 * architectural constraint). The engineering data records the geometry but not
 * the motivation.
 */
function checkSeatingForwardOfRearWall(state, project = null) {
  const roomDims = readRoomDims(state, project);
  const seats = readSeatingPositions(state);
  if (roomDims.widthM === null || roomDims.lengthM === null || seats.length === 0) return null;

  const geometry = readSeatBoundaryGeometry({
    seats,
    roomDims: { widthM: roomDims.widthM, lengthM: roomDims.lengthM },
  });
  if (!geometry?.available) return null;

  const rearRowRearWallM = num(geometry.rear_row_rear_wall_m);
  if (rearRowRearWallM === null || rearRowRearWallM < 1.5) return null;

  // Only ask when there is genuinely generous space behind the seating.
  // The "generous" band starts at 1.5m.
  if (geometry.rear_clearance !== 'generous') return null;

  return {
    question_id: 'seating_forward_of_rear_wall',
    question: 'The seating is positioned well forward of the rear wall. Is there a particular reason for leaving this space behind the audience?',
    area: CONTEXT_AREA.SEATING,
    decision_fingerprint: decisionFingerprint(CONTEXT_AREA.SEATING, {
      rear_wall_distance_m: Math.round(rearRowRearWallM * 10) / 10,
      row_count: geometry.row_count,
    }),
  };
}

/**
 * Check 2: Subwoofer arrangement.
 *
 * If the design uses a non-standard subwoofer arrangement (e.g., all subwoofers
 * on one wall, or a single subwoofer in a multi-row room), the designer may have
 * a reason that the engineering data does not establish.
 */
function checkSubwooferArrangement(state, project = null) {
  const instances = Array.isArray(state.subwooferInstances)
    ? state.subwooferInstances
    : (Array.isArray(state.subwoofers) ? state.subwoofers : []);
  const enabled = instances.filter((sub) => sub?.enabled !== false);
  if (enabled.length === 0) return null;

  const positions = enabled.map((sub) => ({
    x: num(sub?.position?.x ?? sub?.x),
    y: num(sub?.position?.y ?? sub?.y),
  })).filter((pos) => pos.x !== null && pos.y !== null);
  if (positions.length === 0) return null;

  const roomDims = readRoomDims(state, project);
  if (roomDims.lengthM === null) return null;

  // Classify the arrangement: are all subwoofers in the front half, the rear half, or distributed?
  const midY = roomDims.lengthM / 2;
  const frontCount = positions.filter((pos) => pos.y < midY).length;
  const rearCount = positions.filter((pos) => pos.y >= midY).length;

  // All subwoofers on one wall: a deliberate arrangement worth asking about.
  if (enabled.length >= 2 && (frontCount === 0 || rearCount === 0)) {
    const side = frontCount === 0 ? 'rear' : 'front';
    return {
      question_id: 'subwoofer_single_wall_arrangement',
      question: `All ${enabled.length} subwoofers are placed near the ${side} wall. Is there a particular reason for this arrangement rather than distributing them around the room?`,
      area: CONTEXT_AREA.SUBWOOFERS,
      decision_fingerprint: canonicalSubwooferFingerprint({
        type: 'single_wall',
        count: enabled.length,
        front: frontCount,
        rear: rearCount,
      }),
    };
  }

  // Subwoofers distributed across front and rear: a purposeful arrangement
  // that materially affects the bass response. Worth asking about because
  // the engineering data records the geometry but not the designer's
  // motivation (smooth seat-to-seat response, modal control, etc.).
  if (enabled.length >= 2 && frontCount >= 1 && rearCount >= 1) {
    return {
      question_id: 'subwoofer_front_rear_distribution',
      question: `The ${enabled.length} subwoofers are distributed across the front and rear of the room. Is there a particular reason for this distribution?`,
      area: CONTEXT_AREA.SUBWOOFERS,
      decision_fingerprint: canonicalSubwooferFingerprint({
        type: 'front_rear',
        count: enabled.length,
        front: frontCount,
        rear: rearCount,
      }),
    };
  }

  return null;
}

/**
 * Check 3: Acoustic treatment enabled.
 *
 * If acoustic treatment (Artcoustic Abfuser) is enabled, the designer may have
 * a reason for choosing it. The engineering data records the fact but not the
 * motivation.
 */
function checkAcousticTreatment(state) {
  const enabled = state.acousticTreatmentEnabled === true
    || state.acoustic_treatment_enabled === true;
  if (!enabled) return null;
  const qty = num(state.selectedAbfuserQty) ?? 0;
  if (qty === 0) return null;

  return {
    question_id: 'acoustic_treatment_rationale',
    question: 'Acoustic treatment panels have been included in this design. Is there a particular acoustic concern or client preference that led to this choice?',
    area: CONTEXT_AREA.TREATMENT,
    decision_fingerprint: decisionFingerprint(CONTEXT_AREA.TREATMENT, {
      enabled: true,
      qty,
    }),
  };
}

/**
 * Check 4: Single row in a large room.
 *
 * If the room is long enough to fit a second row but only one row is placed,
 * the designer may have a reason (a preference for a single row, space for
 * other uses, etc.).
 */
function checkSingleRowInLargeRoom(state, project = null) {
  const roomDims = readRoomDims(state, project);
  const seats = readSeatingPositions(state);
  if (roomDims.lengthM === null || seats.length === 0) return null;

  const geometry = readSeatBoundaryGeometry({
    seats,
    roomDims: { widthM: roomDims.widthM, lengthM: roomDims.lengthM },
  });
  if (!geometry?.available) return null;
  if (geometry.row_count > 1) return null;

  // A room >= 7m long with a single row has space for a second.
  if (roomDims.lengthM < 7) return null;

  return {
    question_id: 'single_row_in_large_room',
    question: 'This room is long enough for a second seating row, but only one row has been placed. Is there a particular reason for keeping a single row?',
    area: CONTEXT_AREA.LAYOUT,
    decision_fingerprint: decisionFingerprint(CONTEXT_AREA.LAYOUT, {
      room_length_m: Math.round(roomDims.lengthM * 10) / 10,
      row_count: 1,
    }),
  };
}

/**
 * Check 5: Screen wall construction (floating screen).
 *
 * If the screen is on a floating screen wall, the designer may have a reason
 * for this construction approach.
 */
function checkFloatingScreenWall(state) {
  const screen = parseMaybe(state.screen) || {};
  if (screen.mount_mode !== 'floating' && state.screen_mount_mode !== 'floating') return null;
  const floatDepth = num(state.float_depth_m) ?? 0;
  if (floatDepth === 0) return null;

  return {
    question_id: 'floating_screen_wall',
    question: 'The screen is mounted on a floating screen wall. Is there a particular reason for this construction approach?',
    area: CONTEXT_AREA.SCREEN,
    decision_fingerprint: decisionFingerprint(CONTEXT_AREA.SCREEN, {
      mount_mode: 'floating',
      float_depth_m: floatDepth,
    }),
  };
}

/** The deterministic checks, in priority order. */
const DETERMINISTIC_CHECKS = [
  checkSeatingForwardOfRearWall,
  checkSubwooferArrangement,
  checkAcousticTreatment,
  checkSingleRowInLargeRoom,
  checkFloatingScreenWall,
];

/**
 * Run the deterministic discovery checks against a version's design state.
 * Returns questions in priority order, at most MAX_DISCOVERY_QUESTIONS.
 *
 * The parent Project is supplied so checks that need the room geometry can
 * fall back to the project's recorded dimensions where the version's own
 * design state carries none.
 *
 * @param {Object} version — the ProjectVersion record
 * @param {Object} [project] — the parent Project record
 * @returns {Array<Object>} discovered questions
 */
export function discoverDeterministicQuestions(version, project = null) {
  const state = readDesignState(version);
  const questions = [];
  const seenIds = new Set();
  const seenDecisions = new Set();
  for (const check of DETERMINISTIC_CHECKS) {
    if (questions.length >= MAX_DISCOVERY_QUESTIONS) break;
    try {
      const question = check(state, project);
      if (!question || !question.question_id || seenIds.has(question.question_id)) continue;
      // Never present two questions about the same underlying decision in
      // one review, even if they carry different question IDs.
      const dk = decisionKeyForQuestion(question);
      if (dk && seenDecisions.has(dk)) continue;
      seenIds.add(question.question_id);
      if (dk) seenDecisions.add(dk);
      questions.push(question);
    } catch {
      // A check that fails is simply no question from that check.
    }
  }
  return questions;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI discovery (guarded)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE GUARDED AI DISCOVERY. Only runs when the deterministic checks found fewer
 * than three questions. The LLM is given a summary of the project facts and
 * asked to identify any clearly evidenced anomaly that warrants a question. The
 * output is validated: only questions grounded in the actual project data are
 * accepted, and the total never exceeds MAX_DISCOVERY_QUESTIONS.
 *
 * The AI never writes the answer; it only proposes a question. The designer's
 * answer is the only source of human design intent.
 *
 * @param {Object} input
 * @param {Object} input.version — the ProjectVersion record
 * @param {Object} input.project — the Project record
 * @param {Array<Object>} input.deterministicQuestions — already found
 * @param {Function} input.invokeLLM — the server-side provider call
 * @returns {Promise<Array<Object>>} additional questions, or empty on failure
 */
export async function discoverAiQuestions({
  version = null,
  project = null,
  deterministicQuestions = [],
  invokeLLM = null,
} = {}) {
  if (typeof invokeLLM !== 'function') return [];
  if (deterministicQuestions.length >= MAX_DISCOVERY_QUESTIONS) return [];

  const state = readDesignState(version);
  const verifiedFacts = readVerifiedDesignFacts(version, project);

  // The facts given to the AI are deliberately limited to design decisions
  // whose WHY is not established by the engineering data AND whose explanation
  // would materially improve the client-facing narrative. Ordinary
  // configuration options (such as standard baffle mounting) are excluded:
  // the existence of an option is not itself a meaningful design decision.
  // The AI is never asked to invent a design constraint or speculate about
  // a reason the designer did not record.
  //
  // seating_rows is the VERIFIED row count, read from the actual rowNumber
  // values the seats record (falling back to geometry clustering, and null
  // where neither is available). It is never inferred from the seat count.
  const room = verifiedFacts.room;
  const facts = {
    room: room.widthM !== null && room.lengthM !== null
      ? `${room.widthM}m x ${room.lengthM}m x ${room.heightM ?? '?'}m`
      : 'dimensions not recorded',
    seating_rows: verifiedFacts.seating_rows === null
      ? 'not recorded'
      : verifiedFacts.seating_rows,
    seat_count: verifiedFacts.seat_count,
    subwoofer_count: verifiedFacts.subwoofer_count,
    dolby_config: verifiedFacts.dolby_config || 'not recorded',
    overhead_model: verifiedFacts.overhead_model || 'not recorded',
    acoustic_treatment: verifiedFacts.acoustic_treatment ? 'enabled' : 'not enabled',
  };

  const existingIds = deterministicQuestions.map((q) => q.question_id).join(', ');
  const max = MAX_DISCOVERY_QUESTIONS - deterministicQuestions.length;

  const prompt = [
    'You are a cinema design assistant. Review the following project facts and identify up to ' + max + ' design decisions',
 'whose REASON is not established by the engineering data. For each, propose ONE question to ask the designer.',
    '',
    'Project facts:',
    ...Object.entries(facts).map(([key, value]) => `- ${key}: ${value}`),
    '',
    'Rules:',
    '- Each question must be grounded in the actual project facts above. Never invent a fact.',
    '- Each question asks WHY a meaningful design decision was made, never WHAT was designed.',
    '- Only ask about decisions whose explanation would materially improve the client-facing narrative: unusual seating positions, genuinely significant screen-size compromises, unconventional speaker positioning, or a specific unusual subwoofer arrangement or constraint.',
    '- Do not generate a question merely because a configuration option exists. Ordinary choices (standard baffle mounting, a common channel layout, a typical subwoofer count) are not design decisions that need explanation.',
    '- Subwoofer quantity alone does not determine performance. Two well-positioned subwoofers may be preferable to four poorly positioned ones. Do not routinely ask the designer to explain why two, four or another number of subwoofers was selected — this is normal cinema design judgement, not an unusual decision requiring clarification.',
    '- Using multiple subwoofers to manage room modes, reduce the severity of bass peaks and nulls, and improve bass consistency across listening positions is standard engineering practice. Only ask about a specific unusual arrangement or an architectural constraint (for example, subwoofers located in unusual positions because of cabinetry).',
    '- Never assume a motivation. The question must ask the designer for their reason.',
    '- Never invent a design constraint or speculate about a reason the designer did not record.',
    '- Use only the project facts above for any figure you state. The seating_rows and seat_count facts are the verified counts for this design; do not infer a row count from the seat count or state a different number. Where a fact is "not recorded", do not state a figure for it.',
    '- Never claim that a particular bass improvement has been achieved unless the engineering results support it. Do not state that room modes have been smoothed, peaks reduced, or consistency improved unless measured results are cited.',
    '- Three questions is a maximum, not a target. Zero questions is acceptable when nothing meaningful needs clarification.',
    '- Keep each question to one or two sentences in plain professional English.',
    '- Do not repeat questions already asked: ' + (existingIds || 'none'),
    '',
    'Return a JSON object: {"questions": [{"question_id": "snake_case_id", "question": "...", "area": "seating|subwoofers|overheads|treatment|screen|layout"}]}',
    'Return at most ' + max + ' questions. If no question is warranted, return {"questions": []}.',
  ].join('\n');

  try {
    const response = await invokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question_id: { type: 'string' },
                question: { type: 'string' },
                area: { type: 'string' },
              },
            },
          },
        },
      },
    });

    const raw = Array.isArray(response?.questions) ? response.questions : [];
    const validAreas = new Set(Object.values(CONTEXT_AREA));
    const out = [];
    const seenIds = new Set(deterministicQuestions.map((q) => q.question_id));
    const seenDecisions = new Set(
      deterministicQuestions
        .map((q) => decisionKeyForQuestion(q))
        .filter(Boolean),
    );
    for (const entry of raw) {
      if (out.length >= max) break;
      const questionId = asText(entry?.question_id);
      const question = asText(entry?.question);
      if (!questionId || !question || seenIds.has(questionId)) continue;
      // Never let the AI ask about a decision a deterministic check already
      // covered, even when it uses a different question ID.
      const dk = decisionKeyForQuestionId(questionId);
      if (dk && seenDecisions.has(dk)) continue;
      const area = asText(entry?.area);
      // Factual validation: reject questions that contradict the verified
      // design facts (seating rows, seat count, subwoofer count, room
      // dimensions), or that assert a count the facts cannot verify. A
      // question asking only for a reason makes no verifiable claim and
      // always passes.
      const candidate = {
        question_id: questionId,
        question,
        area: validAreas.has(area) ? area : CONTEXT_AREA.LAYOUT,
        decision_fingerprint: decisionFingerprint(area || CONTEXT_AREA.LAYOUT, { ai: true, question_id: questionId }),
      };
      const contradiction = questionContradictsFacts(candidate, verifiedFacts);
      if (contradiction) {
        // Drop the question rather than display an unsupported or
        // contradictory factual claim to the designer.
        continue;
      }
      seenIds.add(questionId);
      if (dk) seenDecisions.add(dk);
      out.push(candidate);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * THE HYBRID DISCOVERY: deterministic checks first, then guarded AI discovery
 * for any remaining slots.
 *
 * @param {Object} input
 * @param {Object} input.version — the ProjectVersion record
 * @param {Object} [input.project] — the Project record
 * @param {Function} [input.invokeLLM] — the server-side provider call
 * @returns {Promise<Array<Object>>} at most MAX_DISCOVERY_QUESTIONS questions
 */
export async function discoverDesignContextQuestions({
  version = null,
  project = null,
  invokeLLM = null,
} = {}) {
  if (!version?.id) return [];
  const deterministic = discoverDeterministicQuestions(version, project);
  if (deterministic.length >= MAX_DISCOVERY_QUESTIONS) return deterministic;

  const aiQuestions = await discoverAiQuestions({
    version,
    project,
    deterministicQuestions: deterministic,
    invokeLLM,
  });

  // Final safety net: never present two questions about the same underlying
  // decision in one review, across deterministic and AI. Deterministic
  // questions take priority (they were already ordered and deduped).
  const combined = [...deterministic, ...aiQuestions];
  const seenIds = new Set();
  const seenDecisions = new Set();
  const out = [];
  for (const q of combined) {
    if (out.length >= MAX_DISCOVERY_QUESTIONS) break;
    if (!q?.question_id || seenIds.has(q.question_id)) continue;
    const dk = decisionKeyForQuestion(q);
    if (dk && seenDecisions.has(dk)) continue;
    seenIds.add(q.question_id);
    if (dk) seenDecisions.add(dk);
    out.push(q);
  }
  return out;
}

export default discoverDesignContextQuestions;