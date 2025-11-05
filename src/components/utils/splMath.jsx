// Shared SPL calculation functions - matches SPL Calculator logic exactly

export function dbAt1mFromSensitivityPower(sensitivity_dB_2V83_1m, power_W) {
  if (typeof sensitivity_dB_2V83_1m !== 'number' || typeof power_W !== 'number') {
    return null;
  }
  const base = sensitivity_dB_2V83_1m + 10 * Math.log10(Math.max(power_W, 0.000001));
  return base;
}

export function distanceLossDb(distance_m) {
  if (typeof distance_m !== 'number' || distance_m <= 0) return null;
  return 20 * Math.log10(Math.max(distance_m, 0.001));
}

export function calibratedSplAtSeat(speakerData, distance_m, opts = {}) {
  if (!speakerData || typeof distance_m !== 'number') return null;
  
  const { sensitivity_dB_2V83_1m, power_W } = speakerData;
  if (typeof sensitivity_dB_2V83_1m !== 'number' || typeof power_W !== 'number') {
    return null;
  }

  const raw1m = dbAt1mFromSensitivityPower(sensitivity_dB_2V83_1m, power_W);
  if (raw1m === null) return null;
  
  const loss = distanceLossDb(distance_m);
  if (loss === null) return null;
  
  const crestCal = opts.calibrationOffsetDb ?? 6; // our imposed -6 dB
  const spl = raw1m - loss - crestCal;
  
  return Number.isFinite(spl) ? spl : null;
}

export function normalizeToRsp(splAtSeat_dB, splAtRsp_dB) {
  if (typeof splAtSeat_dB !== 'number' || typeof splAtRsp_dB !== 'number') {
    return null;
  }
  return splAtSeat_dB - splAtRsp_dB; // trims set at RSP to 0 dB variation
}

export function p4DeltaAndLevel(adjusted_dB_array) {
  if (!Array.isArray(adjusted_dB_array)) {
    return { deltaDb: null, level: null };
  }
  
  const validValues = adjusted_dB_array.filter(val => typeof val === 'number' && Number.isFinite(val));
  
  if (validValues.length < 2) {
    return { deltaDb: null, level: null };
  }
  
  const delta = Math.max(...validValues) - Math.min(...validValues);
  
  let level = 'L0';
  if (delta <= 2) level = 'L4';
  else if (delta <= 4) level = 'L3';
  else if (delta <= 5) level = 'L2';
  else if (delta <= 6) level = 'L1';
  
  return { deltaDb: delta, level };
}

// Utility to compute distance between two 3D points
export function euclideanDistance(point1, point2) {
  if (!point1 || !point2 || 
      typeof point1.x !== 'number' || typeof point1.y !== 'number' || typeof point1.z !== 'number' ||
      typeof point2.x !== 'number' || typeof point2.y !== 'number' || typeof point2.z !== 'number') {
    return null;
  }
  
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  const dz = point1.z - point2.z;
  
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Ceiling function for decibel values
 * Rounds up to nearest integer dB
 * @param {number} db - Decibel value
 * @returns {number|null} Rounded up dB value
 */
export function ceilDb(db) {
  if (typeof db !== 'number' || !Number.isFinite(db)) {
    return null;
  }
  return Math.ceil(db);
}