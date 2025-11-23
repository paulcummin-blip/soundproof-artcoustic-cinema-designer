// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

/**
 * Estimate HF attenuation at 16 kHz based on off-axis angle.
 * 
 * @param {number} angleDeg - absolute off-axis angle in degrees
 * @param {Object} hfProfile - { minus3deg, minus5deg }
 * @returns {number} attenuation in dB (negative value)
 */
export function estimateHFAttenuationAt16k(angleDeg, hfProfile) {
  if (!hfProfile) return 0; // treat as flat if no data

  const a = Math.abs(angleDeg);
  const a3 = Number(hfProfile.minus3deg ?? NaN);
  const a5 = Number(hfProfile.minus5deg ?? NaN);

  if (!Number.isFinite(a3) || !Number.isFinite(a5) || a3 <= 0 || a5 <= a3) {
    // Fallback: no usable profile -> 0 dB (no predicted variance)
    return 0;
  }

  // 0° => 0 dB, a3 => -3 dB, a5 => -5 dB, >a5 => clamp at -5 dB
  if (a <= 0) return 0;
  if (a <= a3) {
    const t = a / a3;
    return -3 * t; // linear between 0 and -3 dB
  }
  if (a <= a5) {
    const t = (a - a3) / (a5 - a3);
    return -3 - 2 * t; // linear between -3 and -5 dB
  }

  return -5; // beyond -5 dB region, clamp
}

/**
 * Classify P16 delta according to RP22 thresholds.
 * 
 * @param {number} deltaDb - maximum absolute SPL delta across seats
 * @returns {string|null} level (L4, L3, L2, L1) or null
 */
export function classifyP16(deltaDb) {
  const d = Math.abs(deltaDb);
  if (!Number.isFinite(d)) return null;

  if (d <= 1.5) return 'L4';
  if (d <= 3.0) return 'L3';
  if (d <= 5.0) return 'L2';
  return 'L1'; // > 5 dB
}

/**
 * Compute speaker-to-seat azimuth angle in degrees.
 * 
 * @param {Object} speaker - { position: {x, y} }
 * @param {Object} seat - { x, y }
 * @returns {number} angle in degrees (0-360, where 0 = straight ahead)
 */
export function computeSpeakerSeatAzimuth(speaker, seat) {
  if (!speaker?.position || !seat) return 0;
  
  const spkX = Number(speaker.position.x ?? 0);
  const spkY = Number(speaker.position.y ?? 0);
  const seatX = Number(seat.x ?? seat.position?.x ?? 0);
  const seatY = Number(seat.y ?? seat.position?.y ?? 0);
  
  const dx = seatX - spkX;
  const dy = seatY - spkY;
  
  // atan2(dx, dy) gives azimuth with 0° = +Y (forward)
  const rad = Math.atan2(dx, dy);
  const deg = rad * 180 / Math.PI;
  
  return Math.abs(deg); // Return absolute angle for off-axis calculation
}

/**
 * Compute RP22 P16 for a given seat using off-axis HF roll-off.
 *
 * @param {Object} params
 * @param {Object} params.seat - { x, y, earHeightM, ... }
 * @param {Object} params.mlpSeat - the reference/RSP seat
 * @param {Array}  params.screenSpeakers - FL/FC/FR placed speakers
 * @param {Function} params.getModelMeta - lookup(modelName) -> { hfOffAxis16k, ... }
 * @returns {Object|null} p16 metric { value, formatted, level } or null
 */
export function computeP16ForSeat({
  seat,
  mlpSeat,
  screenSpeakers,
  getModelMeta,
}) {
  if (!seat || !mlpSeat || !Array.isArray(screenSpeakers) || screenSpeakers.length === 0) {
    return null;
  }

  let worst = {
    delta: 0,
    speaker: null,
    angle: 0
  };

  for (const spk of screenSpeakers) {
    const model = getModelMeta?.(spk.model);
    const hfProfile = model?.hfOffAxis16k;
    if (!hfProfile) continue;

    const angleSeat = computeSpeakerSeatAzimuth(spk, seat);
    const angleMlp = computeSpeakerSeatAzimuth(spk, mlpSeat);

    if (!Number.isFinite(angleSeat) || !Number.isFinite(angleMlp)) continue;

    const attSeat = estimateHFAttenuationAt16k(angleSeat, hfProfile);
    const attMlp = estimateHFAttenuationAt16k(angleMlp, hfProfile);

    const delta = attSeat - attMlp;
    if (!Number.isFinite(delta)) continue;

    // Track worst absolute delta
    if (Math.abs(delta) > Math.abs(worst.delta)) {
      worst.delta = delta;
      worst.speaker = spk.role;
      worst.angle = Math.abs(angleSeat);
    }
  }

  if (!worst.speaker) return null;

  const value = Math.abs(worst.delta);
  const level = classifyP16(value);
  if (!level) return null;

  const formattedAngle = `${worst.angle.toFixed(0)}°`;

  return {
    value,
    formatted: `${value.toFixed(1)} dB`,
    level,
    worstSpeaker: worst.speaker,
    worstAngleDeg: worst.angle,
    worstAngleFormatted: formattedAngle,
    hudLabel: `${level} (${worst.speaker} ${formattedAngle})`
  };
}