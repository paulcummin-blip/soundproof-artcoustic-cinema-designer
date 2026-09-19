/**
 * buildRoomAuthority.js
 * --------------------------------
 * Layer 1 — Room sub-authority.
 * Interprets room geometry into engineering facts.
 * Pure function. No GPT. No side effects.
 */

import { CONFIDENCE, withConfidence } from './confidence';

function parseRoomDims(project) {
  // Try roomDims JSON string first, then legacy numeric fields
  if (project?.roomDims) {
    try {
      const parsed = typeof project.roomDims === 'string' ? JSON.parse(project.roomDims) : project.roomDims;
      if (parsed && Number.isFinite(parsed.widthM) && Number.isFinite(parsed.lengthM) && Number.isFinite(parsed.heightM)) {
        return { widthM: parsed.widthM, lengthM: parsed.lengthM, heightM: parsed.heightM };
      }
    } catch {
      // fall through to legacy
    }
  }
  const w = Number(project?.room_width);
  const l = Number(project?.room_length);
  const h = Number(project?.room_height);
  if (Number.isFinite(w) && Number.isFinite(l) && Number.isFinite(h)) {
    return { widthM: w, lengthM: l, heightM: h };
  }
  return null;
}

function classifyRoom(w, l, h) {
  const ratio = l / w;
  const heightRatio = h / w;

  if (ratio > 2.5) {
    return {
      classification: 'long tunnel room',
      ratio_description: `${ratio.toFixed(2)}:1 length-to-width ratio`,
      acoustic_implication: 'Significant axial mode clustering along the length axis; careful subwoofer placement and bass management are essential to achieve consistent low-frequency response.',
    };
  }
  if (ratio < 1.1 && heightRatio < 1.1 && Math.abs(w - l) < 0.5 && Math.abs(w - h) < 0.5) {
    return {
      classification: 'near-cubic room',
      ratio_description: 'Approximately equal dimensions',
      acoustic_implication: 'Degenerate modal overlap where multiple room modes coincide at similar frequencies; acoustic treatment and subwoofer optimisation are critical.',
    };
  }
  // Check for golden ratio proximity (2:1.5:1 or similar)
  const goldenL = 2 * h;
  const goldenW = 1.5 * h;
  if (Math.abs(l - goldenL) / goldenL < 0.15 && Math.abs(w - goldenW) / goldenW < 0.15) {
    return {
      classification: 'golden ratio room',
      ratio_description: `Approximately 2:1.5:1 (L:W:H) ratio based on ${h.toFixed(1)}m height`,
      acoustic_implication: 'Favourable modal distribution with well-separated room modes; this is the ideal room proportion for cinema acoustics.',
    };
  }
  return {
    classification: 'rectangular room',
    ratio_description: `${ratio.toFixed(2)}:1 length-to-width ratio`,
    acoustic_implication: 'Standard modal distribution; bass performance depends on subwoofer placement and acoustic treatment.',
  };
}

function interpretScreenWall(project) {
  const mode = project?.screen_mount_mode || 'baffle';
  const floatDepth = Number(project?.float_depth_m) || 0;
  const showCavity = project?.show_cavity || false;

  if (mode === 'floating' && floatDepth > 0) {
    return {
      construction_type: 'floating screen wall',
      detail: `Floating screen wall with ${(floatDepth * 1000).toFixed(0)}mm cavity depth`,
      engineering_purpose: 'The cavity behind the floating screen allows speaker placement at the correct distance from the screen surface while maintaining an acoustically transparent baffle.',
    };
  }
  if (showCavity) {
    return {
      construction_type: 'cavity construction',
      detail: 'Cavity construction behind screen wall',
      engineering_purpose: 'The cavity provides space for speaker depth and cable management while maintaining structural integrity of the screen wall.',
    };
  }
  return {
    construction_type: 'baffle wall',
    detail: 'Baffle wall construction (speakers mounted directly behind the acoustically transparent screen)',
    engineering_purpose: 'The baffle wall provides a solid mounting surface for LCR speakers at the screen plane, ensuring accurate sound localisation and minimising diffraction.',
  };
}

function interpretSeating(project) {
  const seatsPerRow = project?.seats_per_row_by_row || [];
  const rowSpacing = Number(project?.row_spacing_m) || 1.8;
  const mlpBasis = project?.mlp_basis || 'middle';
  const seatingPositions = project?.seating_positions || [];

  if (seatsPerRow.length === 0 && seatingPositions.length === 0) {
    return {
      row_count: 0,
      seats_per_row: [],
      total_seats: 0,
      row_spacing_m: rowSpacing,
      mlp_basis: mlpBasis,
      interpretation: 'No seating configured.',
    };
  }

  const rowCount = seatsPerRow.length || Math.ceil(seatingPositions.length / 3);
  const totalSeats = seatsPerRow.reduce((a, b) => a + Number(b || 0), 0) || seatingPositions.length;
  const rowDescription = seatsPerRow.length > 0
    ? seatsPerRow.map((count, i) => `${count} seat${count !== 1 ? 's' : ''} in row ${i + 1}`).join(', ')
    : `${totalSeats} seat${totalSeats !== 1 ? 's' : ''}`;

  const mlpDescriptions = {
    front: 'MLP positioned at the front row centre',
    middle: 'MLP positioned at the middle row centre',
    back: 'MLP positioned at the rear row centre',
    all: 'MLP based on all-rows average position',
  };

  return {
    row_count: rowCount,
    seats_per_row: seatsPerRow,
    total_seats: totalSeats,
    row_spacing_m: rowSpacing,
    mlp_basis: mlpBasis,
    interpretation: `${rowCount} row${rowCount !== 1 ? 's' : ''}: ${rowDescription}. ${rowSpacing}m centre-to-centre row spacing. ${mlpDescriptions[mlpBasis] || ''}.`,
  };
}

function interpretAcousticTreatment(project) {
  const enabled = project?.acoustic_treatment_enabled || false;
  const qty = Number(project?.selected_abfuser_qty) || 0;
  const source = project?.abfuser_qty_source || 'recommended';

  if (!enabled || qty === 0) {
    return {
      enabled: false,
      product: null,
      quantity: 0,
      source: null,
      interpretation: 'No acoustic treatment specified.',
    };
  }

  return {
    enabled: true,
    product: 'Artcoustic Abfuser',
    quantity: qty,
    source: source === 'recommended' ? 'auto-calculated recommended quantity' : 'designer-specified quantity',
    interpretation: `${qty} Artcoustic Abfuser panel${qty !== 1 ? 's' : ''} (${source === 'recommended' ? 'auto-calculated recommended quantity' : 'designer-specified quantity'}). The Abfuser provides broad-band absorption and diffusion to control early reflections and room reverberation.`,
  };
}

export function buildRoomAuthority(project, _version) {
  const dims = parseRoomDims(project);

  if (!dims) {
    return {
      dimensions: null,
      dimensions_text: 'Not specified',
      classification: null,
      ratio: null,
      screen_wall: null,
      seating: null,
      acoustic_treatment: null,
      confidence: CONFIDENCE.NOT_CALCULATED,
    };
  }

  const { widthM, lengthM, heightM } = dims;
  const classification = classifyRoom(widthM, lengthM, heightM);
  const screenWall = interpretScreenWall(project);
  const seating = interpretSeating(project);
  const acousticTreatment = interpretAcousticTreatment(project);

  return {
    dimensions: { width_m: widthM, length_m: lengthM, height_m: heightM },
    dimensions_text: `${lengthM.toFixed(1)}m × ${widthM.toFixed(1)}m × ${heightM.toFixed(1)}m (L × W × H)`,
    volume_m3: Math.round(widthM * lengthM * heightM * 10) / 10,
    classification: withConfidence(classification.classification, CONFIDENCE.MEASURED),
    ratio: withConfidence(classification.ratio_description, CONFIDENCE.MEASURED),
    acoustic_implication: withConfidence(classification.acoustic_implication, CONFIDENCE.COMPUTED_GEOMETRIC),
    screen_wall: {
      construction_type: screenWall.construction_type,
      detail: screenWall.detail,
      engineering_purpose: screenWall.engineering_purpose,
      confidence: CONFIDENCE.MEASURED,
    },
    seating: {
      ...seating,
      confidence: CONFIDENCE.MEASURED,
    },
    acoustic_treatment: {
      ...acousticTreatment,
      confidence: CONFIDENCE.MEASURED,
    },
  };
}