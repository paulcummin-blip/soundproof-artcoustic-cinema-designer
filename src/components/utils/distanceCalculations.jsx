import { computeMLPAndPrimary } from './computeMLPAndPrimary';

/**
 * Calculate distance from a speaker to the main listening position (MLP)
 * @param {Object} speaker - Speaker object with position {x, y, z}
 * @param {Array} seats - Array of seating positions
 * @param {Object} dims - Room dimensions {width, length, height}
 * @param {boolean} includeZ - Whether to include Z-axis in 3D distance calculation
 * @returns {number|null} Distance in meters, or null if calculation fails
 */
export function distanceToMLP(speaker, seats, dims, includeZ = false) {
  // Input validation with null guards
  if (!speaker || typeof speaker !== 'object') return null;
  if (!speaker.position || typeof speaker.position !== 'object') return null;
  if (!Array.isArray(seats)) return null;
  if (!dims || typeof dims !== 'object') return null;

  const { mlp } = computeMLPAndPrimary(
    seats, 
    Number(dims.width) || 0, 
    Number(dims.length) || 0
  );

  if (!mlp || typeof mlp !== 'object') return null;

  const speakerX = Number(speaker.position.x) || 0;
  const speakerY = Number(speaker.position.y) || 0;
  const speakerZ = Number(speaker.position.z) || 1.2; // Default ear height

  const mlpX = Number(mlp.x) || 0;
  const mlpY = Number(mlp.y) || 0;
  const mlpZ = Number(mlp.z) || 1.2; // Default ear height

  const dx = speakerX - mlpX;
  const dy = speakerY - mlpY;

  if (includeZ) {
    const dz = speakerZ - mlpZ;
    return Math.hypot(dx, dy, dz);
  }

  return Math.hypot(dx, dy);
}

/**
 * Get the closest speaker to MLP from a group of speakers
 * @param {Array} speakers - Array of speaker objects
 * @param {Array} seats - Array of seating positions  
 * @param {Object} dims - Room dimensions
 * @param {boolean} includeZ - Whether to use 3D distance
 * @returns {Object|null} Closest speaker object with distance property
 */
export function getClosestSpeakerToMLP(speakers, seats, dims, includeZ = false) {
  if (!Array.isArray(speakers) || speakers.length === 0) return null;

  let closest = null;
  let minDistance = Infinity;

  for (const speaker of speakers) {
    const distance = distanceToMLP(speaker, seats, dims, includeZ);
    if (distance !== null && distance < minDistance) {
      minDistance = distance;
      closest = { ...speaker, distance };
    }
  }

  return closest;
}