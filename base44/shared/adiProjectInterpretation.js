/**
 * adiProjectInterpretation.js (shared)
 * ------------------------------------
 * STAGE 1 of the two-stage ADI report process.
 *
 * Before any client-facing sentence is written, ADI reads the selected
 * project and version data and produces a short internal interpretation of
 * the design: what kind of room this is, what the design is trying to do,
 * where it is strongest, what constrains it, and which results are reliable
 * enough to be used as evidence.
 *
 * The interpretation is the design story. STAGE 2 (the report writer) then
 * uses RP22 and RP23 results only as evidence inside that story, so the
 * report explains the design instead of translating parameters one by one.
 *
 *   engineering data -> design interpretation -> client narrative
 *
 * The interpretation is deterministic: it is derived from the frozen
 * Engineering Snapshot and the project the dealer selected, never invented,
 * and it is saved with the generated report so the story behind a report can
 * be audited later.
 *
 * Pure: no React, no side effects, no runtime-specific APIs. Importable from
 * backend functions and from tests.
 */

import {
  REPORT_STRUCTURES,
  EXCLUDED_PARAMETERS,
  plainLanguageName,
  isReliableResult,
  readReliableResult,
  splitParameterEvidence,
  resolveBassEvidence,
  statement,
  P20_USE_RULE,
  P20_OMIT_RULE,
} from './adiReportEvidenceRules.js';
import { deriveDesignPhilosophy, prioritisedPositions, rank, usableRows } from './adiDesignPhilosophy.js';
import { designPhilosophyLines } from './designPhilosophyAuthority.js';
import { DISPLAY_TYPE_PROJECTOR, readDisplayIdentity } from './canonicalDisplayIdentity.js';

export const INTERPRETATION_STAGE = 'adi_project_interpretation';
// Bumped to 1.1 when the interpretation gained the design philosophy: the
// professional judgement behind the recommended solution, derived from the same
// project data and recorded so the copy can explain WHY the design is what it is.
// It adds no engineering value and changes no result: the frozen evidence remains
// the sole authority for every figure, level, product and claim.
export const INTERPRETATION_VERSION = '1.1';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Snapshot text helpers. */
function text(value) {
  const clean = statement(value);
  return clean == null ? null : String(clean).trim() || null;
}

function structuresFromCategories(rp22) {
  const categories = rp22?.categories || {};
  const scope = categories.primary?.available
    ? categories.primary
    : categories.all_seat?.available
      ? categories.all_seat
      : categories.secondary?.available
        ? categories.secondary
        : null;
  if (!scope || !Array.isArray(scope.categories)) return [];
  return scope.categories
    .map((category) => {
      const label = String(category?.label || '');
      const structure = REPORT_STRUCTURES.find((name) => label.toLowerCase().includes(name.split(' ')[0].toLowerCase()));
      if (!structure) return null;
      const level = category?.floor || null;
      return { structure, level, rank: rank(level) };
    })
    .filter(Boolean);
}

function allSeatFloors(rp22) {
  const scope = rp22?.categories?.all_seat;
  if (!scope?.available || !Array.isArray(scope.categories)) return [];
  return scope.categories
    .map((category) => {
      const label = String(category?.label || '');
      const structure = REPORT_STRUCTURES.find((name) => label.toLowerCase().includes(name.split(' ')[0].toLowerCase()));
      return structure ? { structure, level: category?.floor || null, rank: rank(category?.floor) } : null;
    })
    .filter(Boolean);
}

function strongestStructures(floors, limit = 3) {
  return [...floors]
    .filter((entry) => entry.rank != null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}

function hasModelMatching(productRoles, pattern) {
  return productRoles.some((role) => {
    const haystack = `${role?.model_key || ''} ${role?.model_label || ''} ${role?.category || ''}`.toLowerCase();
    return pattern.test(haystack);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 derivation
// ─────────────────────────────────────────────────────────────────────────────

function deriveRoomType({ volumeM3, rowCount, totalSeats, projection, tv }) {
  if (tv) return 'TV-based cinema room';
  // More than one seating row defines the room's nature, so multi-row wins over
  // the generic dedicated-cinema classification.
  if (rowCount >= 2) return 'Multi-row cinema';
  if (volumeM3 != null && volumeM3 >= 60) return 'Dedicated cinema';
  if (projection && totalSeats <= 4 && volumeM3 != null && volumeM3 < 40) return 'Compact cinema';
  if (totalSeats > 0 && totalSeats <= 3 && volumeM3 != null && volumeM3 < 30) return 'Media room';
  return projection ? 'Dedicated cinema' : 'Media room';
}

function deriveIntent({ bed, overhead, subCount, rowCount, totalSeats, discreet }) {
  if (overhead > 0 && bed >= 9 && subCount >= 2) return 'Reference-style dedicated cinema';
  if (overhead > 0 && rowCount >= 2 && totalSeats >= 6) return 'High impact family cinema';
  if (overhead > 0 && bed <= 7) return 'Compact high-performance media room';
  if (bed > 0 && bed <= 5 && overhead === 0 && subCount <= 2) return 'Clean, simple surround system';
  if (discreet) return 'Discreet system with low visual impact';
  return overhead > 0 ? 'Compact high-performance media room' : 'Clean, simple surround system';
}

function deriveDefiningFeature({ strongest, screenWidthM, totalSeats, volumeM3, rowCount, overhead, subCount }) {
  if (subCount >= 4 && strongest?.structure === 'Timbre Matching') return 'Four-sub bass consistency';
  if (screenWidthM != null && screenWidthM >= 2.8) return 'Large projection screen';
  if (totalSeats >= 4 && volumeM3 != null && volumeM3 < 45) return 'Compact room with several seats';
  if (rowCount >= 2) return 'Multi-row layout';
  if (overhead >= 4) return 'High channel count';
  if (strongest) return `Strong ${strongest.structure}`;
  return null;
}

function deriveSeatingStory({ rowCount, totalSeats, primaryRank, secondaryRank, mlpBasis }) {
  if (rowCount <= 1 && totalSeats > 0 && totalSeats <= 3) return 'Single row, all seats similar';
  if (primaryRank != null && secondaryRank != null && primaryRank > secondaryRank) {
    if (mlpBasis === 'front') return 'Front row is the reference experience';
    if (mlpBasis === 'back') return 'Rear row is useful but secondary';
    return 'Central seats are strongest';
  }
  if (rowCount <= 1) return 'Single row, all seats similar';
  if (primaryRank != null && secondaryRank != null && primaryRank === secondaryRank) return 'All rows perform closely';
  if (totalSeats >= 4) return 'Outer seats are more compromised';
  return 'Central seats are strongest';
}

/** The wall a recorded doorway sits on, when the frozen design records one. */
function sideWallDoorway(elements) {
  const found = (Array.isArray(elements) ? elements : []).find((element) => {
    const type = String(element?.type || element?.element_type || '').toLowerCase();
    const wall = String(element?.wall || element?.wall_side || '').toLowerCase();
    return type === 'door' && (wall === 'left' || wall === 'right');
  });
  if (!found) return null;
  return String(found.wall || found.wall_side || '').toLowerCase() === 'left' ? 'Left' : 'Right';
}

/**
 * Whether the front-wide placement is recorded below the level its own evidence
 * places it against. Read from the front-wide result itself, so the constraint is
 * derived from the assessment and never assumed from the layout having wides.
 */
function frontWideBelowIdeal(rows) {
  const row = (Array.isArray(rows) ? rows : []).find((entry) => Number(entry?.parameter_id) === 7);
  const level = rank(row?.level);
  return level != null && level < 4;
}

function deriveConstraints({ widthM, heightM, rowCount, overhead, subCount, screenWidthM, bed, classification, sideWallDoor = null, frontWideCompromised = false }) {
  const constraints = [];
  // A recorded doorway on a side wall together with a front-wide result below the
  // ideal it is placed against: the two frozen facts the compromise is made of.
  // Stated only when both are recorded, so a room with a door and ideal front
  // wides is never given a compromise it does not have.
  if (sideWallDoor && frontWideCompromised) {
    constraints.push(`${sideWallDoor} wall doorway limits the ideal front-wide position`);
  }
  if (widthM != null && widthM < 4) constraints.push('Side wall proximity');
  if (rowCount >= 2) constraints.push('Rear row geometry');
  if (heightM != null && heightM < 2.4) constraints.push('Low ceiling');
  if (overhead > 0 && overhead < 4) constraints.push('Limited overhead spacing');
  if (subCount === 2) constraints.push('Two-sub bass compromise');
  if (subCount === 1) constraints.push('Single-sub bass compromise');
  if (screenWidthM != null && screenWidthM >= 3.2) constraints.push('Large screen requires projector care');
  if (bed > 0 && bed <= 5 && overhead === 0) constraints.push('Budget limits channel count');
  const proportions = String(classification || '').toLowerCase();
  if (proportions.includes('near-cubic') || proportions.includes('long tunnel')) {
    constraints.push('Room proportions shape the bass response');
  }
  return constraints;
}

function deriveDecisions({ config, bed, overhead, subCount, productRoles, mountMode, screeningHidden }) {
  const decisions = [];
  if (config) {
    if (overhead === 0 && bed > 0 && bed <= 5) decisions.push(`${config} chosen for simplicity and cost`);
    else if (overhead >= 6) decisions.push(`${config} chosen for three overhead rows`);
    else if (bed >= 9 && overhead >= 4) decisions.push(`${config} chosen for front wides and stronger movement`);
    else if (overhead >= 2) decisions.push(`${config} chosen for full surround plus a height layer`);
  }
  if (hasModelMatching(productRoles, /spitfire|(^|[^a-z])q([^a-z]|$)/)) {
    decisions.push('Spitfire Q Series selected for headroom and dialogue clarity');
  }
  if (hasModelMatching(productRoles, /evolve/)) {
    decisions.push('Evolve Series selected for strong performance with lower visual impact');
  }
  if (hasModelMatching(productRoles, /mikro/)) {
    decisions.push('Mikro models selected for very low visual impact');
  }
  if (hasModelMatching(productRoles, /architect|cloud/)) {
    decisions.push('Architect / Spitfire Cloud selected for dedicated overhead coverage');
  }
  if (subCount === 1) decisions.push('Single subwoofer chosen for a simple, position-led bass foundation');
  if (subCount === 2) decisions.push('Two subs chosen for a practical bass foundation');
  if (subCount >= 4) decisions.push('Four subs chosen for seat-to-seat consistency');
  if (screeningHidden && mountMode !== 'floating') {
    decisions.push('Acoustically transparent screen selected so the LCR can sit behind it');
  } else if (mountMode === 'floating') {
    decisions.push('Floating screen wall selected to keep the speakers at the correct distance');
  }
  return decisions;
}

/**
 * Build the Stage 1 interpretation object.
 *
 * @param {Object} params
 * @param {Object} params.snapshot — frozen Engineering Snapshot
 * @param {Object} [params.project] — Project entity (selected by the dealer)
 * @param {string} [params.clientBrief] — designer Emphasis Notes (emphasis only)
 * @param {string} [params.reportType] — 'single' | 'system_summary' | 'comparison'
 * @param {Array<{id: string, label: string}>} [params.versions] — versions covered
 * @param {string} [params.reportLabel] — human label for the report identity
 * @returns {Object} frozen interpretation object
 */
export function buildProjectInterpretation(params = {}) {
  const {
    snapshot, project, clientBrief, reportType = 'system_summary', versions = [], reportLabel = null,
    // The version's own recorded room elements, when the caller holds them: a
    // doorway the design records is part of the design story and is read here as
    // a physical fact. Omitted by a caller that does not hold them, in which case
    // no doorway constraint is stated.
    designElements = [],
  } = params;

  const available = snapshot?.available === true;
  const room = snapshot?.room || {};
  const dims = room.dimensions || {};
  const widthM = num(dims.width_m);
  const lengthM = num(dims.length_m);
  const heightM = num(dims.height_m);
  const volumeM3 = num(room.volume_m3) ?? (widthM && lengthM && heightM ? Math.round(widthM * lengthM * heightM * 10) / 10 : null);

  const seating = room.seating || {};
  const rowCount = num(seating.row_count) ?? 0;
  const totalSeats = num(seating.total_seats) ?? 0;
  const mlpBasis = seating.mlp_basis || null;

  const screen = room.screen || {};
  const screenSizeInches = num(screen.size_inches);
  const viewableWidthM = num(screen.viewable_width_cm) != null ? num(screen.viewable_width_cm) / 100 : null;
  const screenWidthM = num(screen.computed_width_m)
    ?? (num(screen.manual_width_m) || viewableWidthM);
  const mountMode = screen.mount_mode || null;

  // THE display identity, read from the frozen snapshot's own display fields
  // (display_type, television, diagonal_inches) rather than re-derived from a
  // size or a width. A 115" television is a television: it is never re-described
  // as a projection screen because its viewable width happens to be large. The
  // same authority the client-facing Project Report states the display from, so
  // Stage 1 and the report can never describe the same display differently.
  const displayIdentity = readDisplayIdentity(screen);
  const tv = displayIdentity.isTv;
  const projection = !tv && displayIdentity.displayType === DISPLAY_TYPE_PROJECTOR;

  const system = snapshot?.system || {};
  const config = system.configuration?.dolby_config
    ? `${system.configuration.dolby_config}`
    : null;
  const bed = num(system.configuration?.bed_channels) ?? 0;
  const overhead = num(system.configuration?.overhead_channels) ?? 0;
  const productRoles = Array.isArray(system.product_roles) ? system.product_roles : [];
  const subCount = num(system.subwoofer_strategy?.count) ?? 0;
  const discreet = hasModelMatching(productRoles, /mikro|architect|cloud/);
  const screeningHidden = productRoles.some((role) => /lcr|centre/i.test(String(role?.role || '')));

  const rp22 = snapshot?.rp22 || {};
  const floors = structuresFromCategories(rp22);
  const seatsFloors = allSeatFloors(rp22);
  const strongest = strongestStructures(floors)[0] || null;
  const allSeatStrength = seatsFloors.find((entry) => entry.structure === strongest?.structure) || null;

  const roomType = deriveRoomType({ volumeM3, rowCount, totalSeats, projection, tv });
  const intent = deriveIntent({ bed, overhead, subCount, rowCount, totalSeats, discreet });
  const definingFeature = deriveDefiningFeature({
    strongest, screenWidthM, totalSeats, volumeM3, rowCount, overhead, subCount,
  });
  const seatingStory = deriveSeatingStory({
    rowCount,
    totalSeats,
    primaryRank: floors.length > 0 ? Math.max(...floors.map((entry) => entry.rank ?? -1)) : null,
    secondaryRank: allSeatStrength?.rank ?? null,
    mlpBasis,
  });

  const parameterEvidence = available
    ? splitParameterEvidence(snapshot)
    : { byStructure: { 'Spatial Resolution': [], 'Dynamic Range': [], 'Timbre Matching': [] }, used: [], omitted: [] };
  const bassEvidence = available
    ? resolveBassEvidence(snapshot)
    : { p14: null, p18: null, p19: null, usable: [], omitted: [] };

  // Each area carries the recorded level where the data states one, so a relative
  // rank is never mistaken for a strength: a structure recorded at the lowest
  // passing level leads this project's results without being a strong result.
  const strongestAreas = [];
  for (const entry of strongestStructures(floors)) {
    strongestAreas.push({
      area: entry.structure,
      level: entry.level || null,
      evidence: entry.level ? `project floor ${entry.level}` : 'assessed',
    });
  }
  const viewing = snapshot?.viewing || {};
  if (viewing.available && viewing.primary_floor && (rank(viewing.primary_floor) ?? 0) >= 3) {
    strongestAreas.push({ area: 'Viewing geometry', level: viewing.primary_floor, evidence: `RP23 ${viewing.primary_floor}` });
  }
  if (projection && screenWidthM != null) {
    strongestAreas.push({ area: 'Screen scale', level: null, evidence: `${screenWidthM.toFixed(2)}m wide` });
  }
  if (discreet) strongestAreas.push({ area: 'Speaker discretion', level: null, evidence: 'compact models in the system' });
  if (overhead === 0 || bed < 9 || subCount < 4) {
    strongestAreas.push({ area: 'Upgrade flexibility', level: null, evidence: 'layouts and channels remain open' });
  }
  if (bassEvidence.p14 || bassEvidence.p18 || bassEvidence.p19) {
    strongestAreas.push({ area: 'Bass depth and output', level: null, evidence: 'reliable calculated bass result' });
  }
  // Bass consistency is only ever claimed from the consistency result itself,
  // and only when it passed the P20 rule: current, positive and useful.
  if (bassEvidence.p20) {
    strongestAreas.push({
      area: 'Bass consistency',
      level: bassEvidence.p20.level || null,
      evidence: `seat-to-seat consistency at ${bassEvidence.p20.level}`,
    });
  }

  const assumed = rp22.assumed || {};
  // The rule list leads, so its canonical plain-language wording wins the
  // de-duplication below. All four are stated whether or not the result is
  // present, because they are excluded by report design, not by missing data.
  const excluded = [
    ...Object.entries(EXCLUDED_PARAMETERS).map(([id, reason]) => ({
      parameter_id: Number(id),
      label: plainLanguageName(Number(id)),
      reason,
    })),
    ...parameterEvidence.omitted.map((entry) => ({
      parameter_id: entry.parameter_id,
      label: entry.label,
      reason: entry.reason,
    })),
    ...bassEvidence.omitted.map((entry) => ({
      parameter_id: entry.parameter_id,
      label: entry.label,
      reason: entry.reason,
    })),
  ];
  const uniqueExcluded = [];
  for (const entry of excluded) {
    if (!uniqueExcluded.some((existing) => existing.parameter_id === entry.parameter_id)) uniqueExcluded.push(entry);
  }
  const designIndex = {
    available: rp22.dpi?.primary?.available === true,
    designation: rp22.dpi?.primary?.designation ?? null,
    internal_only: true,
    client_facing: false,
    use: 'Internal designer diagnostic only. Never mentioned, quoted, scored or expressed as a percentage in client-facing copy.',
  };

  const rows = usableRows(parameterEvidence, bassEvidence);
  const constraintsList = deriveConstraints({
    widthM, heightM, rowCount, overhead, subCount, screenWidthM, bed,
    classification: text(room.classification),
    sideWallDoor: sideWallDoorway(designElements),
    frontWideCompromised: frontWideBelowIdeal(rows),
  });

  // The philosophy reads only what the interpretation already derived: the room,
  // the intent, the constraints, the strongest results, the priorities and the
  // existing assessment. It states no figure and no level of its own.
  const discreteChannels = num(system.configuration?.total_discrete_channels);
  const displayText = `${
    tv
      ? (displayIdentity.tvPhrase || 'TV')
      : projection && screenWidthM != null
        ? `${screenWidthM.toFixed(2)}m projection screen`
        : projection && screenSizeInches != null
          ? `${screenSizeInches}" projection screen`
          : 'Display recorded in the design'
  }${rowCount > 0 ? `, ${rowCount} seating row${rowCount === 1 ? '' : 's'}` : ''}${
    totalSeats > 0 ? `, ${totalSeats} seats` : ''
  }: the display size and the seating distance were set together, and the reported viewing result is the evidence for how they balance.`;
  const coverageText = `${
    config ? `${config} layout` : 'The recorded layout'
  }${discreteChannels != null ? `, ${discreteChannels} discrete channels` : ''}${
    overhead > 0 ? `, ${overhead} overhead channels` : ''
  }: the coverage approach is the layout the evidence states, and no coverage result is claimed that the spatial evidence does not carry.`;
  const bassText = `${
    subCount > 0 ? `${subCount} subwoofer${subCount === 1 ? '' : 's'}` : 'The subwoofer arrangement'
  }${
    subCount === 1
      ? ' for a position-led bass foundation'
      : subCount === 2
        ? ' as a practical bass foundation'
        : subCount >= 4
          ? ' for seat-to-seat consistency'
          : ''
  }: seat-to-seat consistency is claimed only where the consistency result supports it, so bass is otherwise described as output capability and physical authority.`;

  const emphasis = typeof clientBrief === 'string' && clientBrief.trim() ? clientBrief.trim() : null;

  const designPhilosophy = deriveDesignPhilosophy({
    roomType,
    intent,
    strongest,
    constraints: constraintsList,
    strongestAreas,
    priorities: prioritisedPositions({ mlpBasis, viewing, rowCount, totalSeats }),
    displayText,
    coverageText,
    bassText,
    rows,
    emphasis,
  });

  const oneLineStory = [
    roomType,
    config ? `${config} system` : null,
    strongest ? `${strongest.structure} is the strength` : null,
  ].filter(Boolean).join(', ');

  return Object.freeze({
    stage: INTERPRETATION_STAGE,
    version: INTERPRETATION_VERSION,
    generated_at: new Date().toISOString(),
    report_type: reportType,
    report_label: reportLabel,
    available,
    identity: {
      project_id: snapshot?.identity?.projectId ?? null,
      version_id: snapshot?.identity?.versionId ?? null,
      versions: versions.map((entry) => ({ id: entry?.id ?? null, label: entry?.label ?? null })),
    },

    // 1. Room type
    room_type: roomType,
    presentation: tv ? 'Television' : projection ? 'Projection' : 'Unknown',

    // 2. Primary design intent
    primary_design_intent: intent,

    // 3. Defining feature
    defining_feature: definingFeature,

    // 4. Primary seating story
    primary_seating_story: seatingStory,

    // 5. Strongest design areas
    strongest_areas: strongestAreas,

    // 6. Main constraints
    main_constraints: constraintsList,

    // 7. Important design decisions
    important_design_decisions: deriveDecisions({
      config, bed, overhead, subCount, productRoles, mountMode, screeningHidden,
    }),

    // 8. Reliable evidence
    reliable_evidence: {
      structures: floors,
      all_seat_structures: seatsFloors,
      by_structure: parameterEvidence.byStructure,
      bass: bassEvidence.usable,
      viewing: viewing.available
        ? {
          summary: viewing.summary || null,
          primary_floor: viewing.primary_floor ?? null,
          secondary_floor: viewing.secondary_floor ?? null,
        }
        : null,
      screen: {
        size_inches: screenSizeInches,
        width_m: screenWidthM,
        aspect_ratio: screen.aspect_ratio || null,
        mount_mode: mountMode,
      },
      system: {
        configuration: system.configuration?.text || null,
        discrete_channels: num(system.configuration?.total_discrete_channels),
        subwoofer_count: subCount,
        families: snapshot?.product_coherence?.text || null,
      },
      design_index: designIndex,
    },

    // 9. Excluded or unreliable evidence
    excluded_or_unreliable_evidence: uniqueExcluded,

    // 10. Designer emphasis notes
    designer_emphasis: emphasis,
    designer_emphasis_rule: 'Emphasis only. It never changes an engineering result.',

    one_line_story: oneLineStory,

    // 11. The professional judgement behind the design. Reasoning only: it
    // carries no figure, no level, no product and no claim, and every reason it
    // states is one the project data establishes.
    design_philosophy: designPhilosophy,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 output, for Stage 2 and for the audit log
// ─────────────────────────────────────────────────────────────────────────────

const NOT_USED_HEADING = 'Not used in this report (never reference these)';

function listOrNone(values) {
  const list = (values || []).filter(Boolean);
  return list.length > 0 ? list.join('; ') : 'None identified.';
}

function evidenceLine(entry) {
  return `${entry.label}: ${entry.text}`;
}

/**
 * The Stage 1 interpretation as a prompt block for the report writer.
 * Contains no em dashes, so the generated prose cannot inherit one.
 */
export function formatInterpretationForPrompt(interpretation) {
  if (!interpretation) return '';
  const evidence = interpretation.reliable_evidence || {};
  const byStructure = evidence.by_structure || {};
  const structures = (evidence.structures || [])
    .map((entry) => `${entry.structure} ${entry.level || 'not assessed'}`)
    .join(', ');

  return [
    '=== ADI PROJECT INTERPRETATION (Stage 1 of 2: the design story) ===',
    '',
    'ADI has already read this design. This is the story the report must tell.',
    'Every RP22 and RP23 result below is evidence inside this story, never the subject of it.',
    '',
    '- Room type: ' + (interpretation.room_type || 'Not determined'),
    '- Presentation: ' + (interpretation.presentation || 'Not determined'),
    '- Primary design intent: ' + (interpretation.primary_design_intent || 'Not determined'),
    '- Defining feature: ' + (interpretation.defining_feature || 'Not determined'),
    '- Primary seating story: ' + (interpretation.primary_seating_story || 'Not determined'),
    '- Strongest design areas: ' + listOrNone((interpretation.strongest_areas || []).map((entry) => `${entry.area}${entry.evidence ? ` (${entry.evidence})` : ''}`)),
    '- Main constraints: ' + listOrNone(interpretation.main_constraints),
    '- Important design decisions: ' + listOrNone(interpretation.important_design_decisions),
    '- Design structure floors: ' + (structures || 'Not assessed'),
    '',
    'Reliable evidence by structure:',
    `  Spatial Resolution: ${listOrNone((byStructure['Spatial Resolution'] || []).map(evidenceLine))}`,
    `  Dynamic Range: ${listOrNone((byStructure['Dynamic Range'] || []).map(evidenceLine))}`,
    `  Timbre Matching: ${listOrNone((byStructure['Timbre Matching'] || []).map(evidenceLine))}`,
    `  Bass depth and response (use only where reliable): ${listOrNone((evidence.bass || []).filter((row) => row.parameter_id !== 20).map(evidenceLine))}`,
    `  Bass consistency across seats (use only where reliable, positive and useful): ${listOrNone((evidence.bass || []).filter((row) => row.parameter_id === 20).map(evidenceLine))}`,
    `  Viewing: ${evidence.viewing?.summary ? `${evidence.viewing.summary} (Primary ${evidence.viewing.primary_floor || 'not assessed'}, Secondary ${evidence.viewing.secondary_floor || 'not assessed'})` : 'Not available'}`,
    '',
    NOT_USED_HEADING + ':',
    // Plain language, no parameter codes: the writer is never handed a code it
    // could echo into client-facing text.
    listOrNone((interpretation.excluded_or_unreliable_evidence || []).map((entry) => `${entry.label} - ${entry.reason}`)),
    '',
    'Designer emphasis notes (emphasis only, never a change to the engineering results):',
    interpretation.designer_emphasis || 'None provided. Use a balanced professional narrative.',
    ...designPhilosophyLines(interpretation.design_philosophy),
    '',
    'HOW TO USE THIS:',
    '- Where the copy explains the reasoning behind the design, use the reasoning recorded above and never a reason it does not record.',
    '- Write the story first, then support it with the results that matter for this room.',
    '- Reference a parameter only where it is the clearest evidence for something the client will hear.',
    '- Do not work through the results one by one, and do not quote a level without explaining what it means.',
    '- Never mention anything listed under "' + NOT_USED_HEADING + '".',
    `- ${P20_USE_RULE}`,
    `- ${P20_OMIT_RULE}`,
    '- This report explains the design that was selected. It never redesigns it: no placement change, no added subwoofer, no processor or calibration advice, and no recommendation that is not already in the project data, another saved version, a compared option or the designer brief.',
    '- Never mention the Design Index, a design score, a design rating or any percentage. It is an internal designer diagnostic and is never part of the report.',
    '=== END ADI PROJECT INTERPRETATION ===',
  ].join('\n');
}

/**
 * The interpretation as a compact audit log. Used in the generator log so the
 * story behind a saved report can be traced.
 */
export function formatInterpretationForLog(interpretation) {
  if (!interpretation) return 'none';
  return [
    `stage=${interpretation.stage} version=${interpretation.version} report=${interpretation.report_type}`,
    `project=${interpretation.identity?.project_id || 'n/a'} version=${interpretation.identity?.version_id || 'n/a'}`,
    `room_type=${interpretation.room_type}`,
    `intent=${interpretation.primary_design_intent}`,
    `defining_feature=${interpretation.defining_feature}`,
    `seating_story=${interpretation.primary_seating_story}`,
    `strongest=${listOrNone((interpretation.strongest_areas || []).map((entry) => entry.area))}`,
    `constraints=${listOrNone(interpretation.main_constraints)}`,
    `decisions=${listOrNone(interpretation.important_design_decisions)}`,
    `structures=${(interpretation.reliable_evidence?.structures || []).map((entry) => `${entry.structure}:${entry.level}`).join(',') || 'none'}`,
    `evidence=${(interpretation.reliable_evidence?.by_structure ? Object.entries(interpretation.reliable_evidence.by_structure).map(([structure, rows]) => `${structure}[${rows.map((row) => `P${row.parameter_id}`).join(' ')}]`).join(' ') : 'none')}`,
    `bass_usable=${(interpretation.reliable_evidence?.bass || []).map((row) => `P${row.parameter_id}`).join(' ') || 'none'}`,
    `excluded=${(interpretation.excluded_or_unreliable_evidence || []).map((entry) => `P${entry.parameter_id}`).join(' ') || 'none'}`,
    `design_index=${interpretation.reliable_evidence?.design_index?.designation || 'not available'} (internal only)`,
    `emphasis=${interpretation.designer_emphasis ? 'provided' : 'none'}`,
    `design_philosophy=${interpretation.design_philosophy?.version || 'none'}`,
    `value_engineering=${(interpretation.design_philosophy?.reasoning?.value_engineering?.already_captured || []).map((entry) => entry.area).join('; ') || 'none'}`,
  ].join(' | ');
}