/**
 * RP22 per-seat metric calculations
 * Pure functions that compute individual parameter values for a given seat
 */

import { splAtListener } from '@/components/utils/spl/engine';

/**
 * RP22 Parameter 1: Nearest distance from seat to any wall
 * @param {Object} seat - Seat position {x, y, z}
 * @param {Object} room - Room dimensions {width, length, height}
 * @returns {number|null} Nearest distance in meters
 */
export function rp22P1_nearestWallM(seat, room) {
  if (!seat || !room) return null;
  
  const { x, y, z = 1.2 } = seat;
  const { width, length, height = 2.8 } = room;
  
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  
  const distances = [
    x,              // left wall
    width - x,      // right wall
    y,              // front wall
    length - y      // back wall
  ];
  
  // Include floor/ceiling if z is available
  if (Number.isFinite(z) && Number.isFinite(height)) {
    distances.push(z);           // floor
    distances.push(height - z);  // ceiling
  }
  
  const nearest = Math.min(...distances.filter(d => Number.isFinite(d) && d >= 0));
  return Number.isFinite(nearest) ? nearest : null;
}

/**
 * Calculate SPL at a seat from a speaker
 * @param {Object} speaker - Speaker with position and spec
 * @param {Object} seat - Seat position
 * @param {Function} getSplInputs - Function to get SPL inputs for a speaker
 * @returns {number|null} SPL in dB
 */
function calculateSplAtSeat(speaker, seat, getSplInputs) {
  if (!speaker?.position || !seat) return null;
  
  const dx = seat.x - speaker.position.x;
  const dy = seat.y - speaker.position.y;
  const dz = (seat.z || 1.2) - (speaker.position.z || 1.2);
  const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
  
  const inputs = getSplInputs(speaker);
  if (!inputs) return null;
  
  return splAtListener({
    powerW: inputs.powerW,
    sensitivity_dB_2p83: inputs.sensitivity_dB_2p83,
    nominalOhms: inputs.nominalOhms,
    distanceM,
    eqHeadroomDb: inputs.eqHeadroomDb || 0,
    additionalLossDb: inputs.additionalLossDb || 0
  });
}

/**
 * RP22 Parameter 4 & 6 & 10: Max SPL difference between speakers in a group
 * @param {Array} speakers - Array of speakers to compare
 * @param {Object} seat - Seat position
 * @param {Function} getSplInputs - Function to get SPL inputs for a speaker
 * @returns {number|null} Max pairwise SPL difference in dB (absolute)
 */
export function rp22MaxSplDelta_db(speakers, seat, getSplInputs) {
  if (!Array.isArray(speakers) || speakers.length < 2 || !seat) return null;
  
  const spls = speakers
    .map(spk => calculateSplAtSeat(spk, seat, getSplInputs))
    .filter(spl => Number.isFinite(spl));
  
  if (spls.length < 2) return null;
  
  let maxDelta = 0;
  for (let i = 0; i < spls.length; i++) {
    for (let j = i + 1; j < spls.length; j++) {
      const delta = Math.abs(spls[i] - spls[j]);
      if (delta > maxDelta) maxDelta = delta;
    }
  }
  
  return maxDelta;
}

/**
 * Calculate azimuth angle from seat to speaker (0° = forward, clockwise)
 * @param {Object} seat - Seat position
 * @param {Object} speaker - Speaker position
 * @returns {number} Azimuth in degrees [0, 360)
 */
function azimuthAtSeat(seat, speaker) {
  const dx = speaker.position.x - seat.x;
  const dy = speaker.position.y - seat.y; // +y is forward
  let deg = Math.atan2(dx, dy) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Calculate elevation angle from seat to speaker
 * @param {Object} seat - Seat position
 * @param {Object} speaker - Speaker position
 * @returns {number} Elevation in degrees
 */
function elevationAtSeat(seat, speaker) {
  const dx = speaker.position.x - seat.x;
  const dy = speaker.position.y - seat.y;
  const dz = (speaker.position.z || 1.2) - (seat.z || 1.2);
  const horizontalDist = Math.sqrt(dx * dx + dy * dy);
  return Math.atan2(dz, horizontalDist) * 180 / Math.PI;
}

/**
 * RP22 Parameter 5: Max horizontal angle between adjacent surrounds
 * @param {Array} speakers - Surround speakers
 * @param {Object} seat - Seat position
 * @returns {number|null} Max adjacent separation in degrees
 */
export function rp22MaxHorizontalSeparation_deg(speakers, seat) {
  if (!Array.isArray(speakers) || speakers.length < 2 || !seat) return null;
  
  // Calculate azimuths and sort
  const withAzimuth = speakers
    .filter(spk => spk?.position)
    .map(spk => ({ spk, az: azimuthAtSeat(seat, spk) }))
    .sort((a, b) => a.az - b.az);
  
  if (withAzimuth.length < 2) return null;
  
  let maxGap = 0;
  
  // Check adjacent pairs
  for (let i = 0; i < withAzimuth.length - 1; i++) {
    const gap = withAzimuth[i + 1].az - withAzimuth[i].az;
    if (gap > maxGap) maxGap = gap;
  }
  
  // Check wrap-around gap
  const wrapGap = 360 - (withAzimuth[withAzimuth.length - 1].az - withAzimuth[0].az);
  if (wrapGap > maxGap) maxGap = wrapGap;
  
  return maxGap;
}

/**
 * RP22 Parameter 9: Max vertical angle between adjacent upper speakers
 * @param {Array} upperSpeakers - Upper/overhead speakers
 * @param {Object} seat - Seat position
 * @returns {number|null} Max adjacent vertical separation in degrees
 */
export function rp22MaxVerticalSeparation_deg(upperSpeakers, seat) {
  if (!Array.isArray(upperSpeakers) || upperSpeakers.length < 2 || !seat) return null;
  
  // Calculate elevations and azimuths for sorting
  const withAngles = upperSpeakers
    .filter(spk => spk?.position)
    .map(spk => ({
      spk,
      az: azimuthAtSeat(seat, spk),
      el: elevationAtSeat(seat, spk)
    }))
    .sort((a, b) => a.az - b.az); // Sort by azimuth for adjacency
  
  if (withAngles.length < 2) return null;
  
  let maxGap = 0;
  
  // Check adjacent pairs (by azimuth order)
  for (let i = 0; i < withAngles.length - 1; i++) {
    const gap = Math.abs(withAngles[i + 1].el - withAngles[i].el);
    if (gap > maxGap) maxGap = gap;
  }
  
  // Check wrap-around pair
  const wrapGap = Math.abs(withAngles[withAngles.length - 1].el - withAngles[0].el);
  if (wrapGap > maxGap) maxGap = wrapGap;
  
  return maxGap;
}

/**
 * RP22 Parameter 16 & 17: Seat-to-seat FR variance (simplified estimator)
 * @param {Array} seats - All seats in the room
 * @param {Array} speakers - Speakers to analyze
 * @param {string} seatId - ID of the hovered seat
 * @param {Function} getSplInputs - Function to get SPL inputs
 * @returns {number|null} Estimated variance in ±dB
 */
export function rp22SeatVariance_db(seats, speakers, seatId, getSplInputs) {
  if (!Array.isArray(seats) || seats.length < 2 || !Array.isArray(speakers) || speakers.length === 0) {
    return null;
  }
  
  // Calculate average SPL for each seat from the speaker group
  const seatSpls = seats.map(seat => {
    const spls = speakers
      .map(spk => calculateSplAtSeat(spk, seat, getSplInputs))
      .filter(spl => Number.isFinite(spl));
    
    if (spls.length === 0) return null;
    
    // Average SPL across the group
    const avgSpl = spls.reduce((sum, spl) => sum + spl, 0) / spls.length;
    return { seatId: seat.id, avgSpl };
  }).filter(s => s !== null && Number.isFinite(s.avgSpl));
  
  if (seatSpls.length < 2) return null;
  
  // Calculate variance relative to the hovered seat
  const hoveredSeat = seatSpls.find(s => s.seatId === seatId);
  if (!hoveredSeat) return null;
  
  let maxDeviation = 0;
  for (const s of seatSpls) {
    const deviation = Math.abs(s.avgSpl - hoveredSeat.avgSpl);
    if (deviation > maxDeviation) maxDeviation = deviation;
  }
  
  return maxDeviation;
}

/**
 * RP22 Parameter 20: Low-frequency consistency (placeholder)
 * @param {Array} seats - All seats
 * @param {string} seatId - Hovered seat ID
 * @returns {number|null} Estimated LF variance in ±dB
 */
export function rp22LfConsistency_db(seats, seatId) {
  // Placeholder: Would require room mode analysis and transfer function prediction
  // Return null for now (HUD will show "—")
  return null;
}