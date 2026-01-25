/**
 * alignSubsToRSP.js
 * Compute time alignment delays for multi-sub systems
 * Aligns all subs to the Reference Seat Position (RSP/MLP) for coherent summation
 */

const SPEED_OF_SOUND = 343; // m/s

/**
 * Compute alignment delays for all subs relative to RSP
 * Returns updated sources array with tuning.delayMs applied
 * 
 * @param {Array} sources - Array of {x, y, z, tuning}
 * @param {Object} rspPosition - {x, y, z} of reference seat
 * @returns {Array} Updated sources with alignment delays
 */
export function alignSubsToRSP(sources, rspPosition) {
  if (!Array.isArray(sources) || sources.length === 0) return sources;
  if (!rspPosition || !Number.isFinite(rspPosition.x) || !Number.isFinite(rspPosition.y)) {
    return sources;
  }

  const rsp = {
    x: rspPosition.x,
    y: rspPosition.y,
    z: rspPosition.z ?? 1.2
  };

  // Compute distances for all subs
  const subDistances = sources.map(sub => {
    const dx = sub.x - rsp.x;
    const dy = sub.y - rsp.y;
    const dz = (sub.z ?? 0) - rsp.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const arrivalTime = distance / SPEED_OF_SOUND;
    
    return {
      sub,
      distance,
      arrivalTime
    };
  });

  // Find earliest arrival (shortest distance)
  const minArrivalTime = Math.min(...subDistances.map(s => s.arrivalTime));

  // Apply alignment delays
  return subDistances.map(({ sub, arrivalTime }) => {
    const userDelayMs = sub.tuning?.delayMs || 0;
    const alignmentDelayMs = (arrivalTime - minArrivalTime) * 1000;
    
    return {
      ...sub,
      tuning: {
        ...(sub.tuning || {}),
        gainDb: sub.tuning?.gainDb || 0,
        delayMs: userDelayMs + alignmentDelayMs,
        polarity: sub.tuning?.polarity || 'normal'
      }
    };
  });
}

/**
 * Get alignment info for display (distances, delays)
 */
export function getAlignmentInfo(sources, rspPosition) {
  if (!Array.isArray(sources) || sources.length === 0) return {};
  if (!rspPosition) return {};

  const rsp = {
    x: rspPosition.x,
    y: rspPosition.y,
    z: rspPosition.z ?? 1.2
  };

  const info = {};

  sources.forEach(sub => {
    const dx = sub.x - rsp.x;
    const dy = sub.y - rsp.y;
    const dz = (sub.z ?? 0) - rsp.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const timeMs = (distance / SPEED_OF_SOUND) * 1000;
    
    info[sub.id] = {
      distanceM: distance,
      timeMs: timeMs
    };
  });

  return info;
}