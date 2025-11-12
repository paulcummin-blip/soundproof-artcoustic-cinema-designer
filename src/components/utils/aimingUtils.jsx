// [B44] NOTE:
// These utilities are now **analysis-only** for RP22 (angles, gaps, etc.).
// Bed-layer geometry (SL/SR/SBL/SBR/LW/RW) is driven exclusively by
// SpeakerPlacement / resetSurroundPositions in SpeakerPlacement.jsx.

/**
 * Calculates the horizontal (azimuth) angle between a speaker and a seat in degrees.
 * Returns positive angle for clockwise from forward-facing.
 * [B44 NOTE] ANALYSIS ONLY: safe to keep
 */
export function calculateAzimuth(speakerPos, seatPos) {
  if (!speakerPos || !seatPos) return 0;
  const dx = seatPos.x - speakerPos.x;
  const dy = seatPos.y - speakerPos.y;
  const angleRad = Math.atan2(dx, dy); // Angle from speaker to seat
  return angleRad * (180 / Math.PI);
}

/**
 * Returns the maximum angle gap between any two adjacent surround speakers for a seat.
 * [B44 NOTE] ANALYSIS ONLY: safe to keep
 */
export function getMaxSurroundAngleGap(seat, speakers) {
  const surroundRoles = ["LS", "RS", "LSS", "RSS", "LBS", "RBS", "LRS", "RRS"];
  const surroundSpeakers = speakers.filter(sp => surroundRoles.includes(sp.role) && sp.position);

  if (surroundSpeakers.length < 2) return 0;

  const angles = surroundSpeakers.map(sp => {
    return {
      id: sp.id,
      angle: calculateAzimuth(sp.position, seat)
    };
  }).sort((a, b) => a.angle - b.angle);

  const gaps = [];
  for(let i = 0; i < angles.length; i++) {
    const nextIndex = (i + 1) % angles.length;
    let diff = angles[nextIndex].angle - angles[i].angle;
    if (diff < 0) diff += 360; // Handle wraparound from 180 to -179 etc.
    gaps.push(diff);
  }

  return Math.max(...gaps);
}

/**
 * Classifies RP22 Param 5 based on max surround angle gap.
 * [B44 NOTE] ANALYSIS ONLY: safe to keep
 */
export function classifyParam5Level(gapDeg) {
  if (gapDeg <= 50) return { level: 4, grade: 'pass' };
  if (gapDeg <= 60) return { level: 3, grade: 'pass_with_exception' };
  if (gapDeg <= 80) return { level: 2, grade: 'pass_with_exception' };
  return { level: 1, grade: 'fail' };
}

/**
 * Tries to optimise surround speaker placement for a target max angle gap.
 * Returns the full speaker list with updated positions.
 * [B44 NOTE] DISABLED FOR BED SURROUNDS: Do not call this to mutate placedSpeakers.
 * Bed-layer geometry is now driven by SpeakerPlacement / resetSurroundPositions.
 * This function uses legacy roles (LS/RS/etc.) and conflicts with Dolby ray-casting.
 */
export function optimiseSurroundAngles(allSpeakers, seats) {
    // [B44] Legacy bed-surround placement disabled.
    // Bed-layer geometry is fully handled by SpeakerPlacement / resetSurroundPositions.
    console.warn('[aimingUtils] optimiseSurroundAngles is analysis-only; returning speakers unchanged.');
    return allSpeakers;

    /* ORIGINAL LOGIC DISABLED:
    const MLP = seats.find(s => s.isPrimary) || seats[0];
    if (!MLP) return null;

    const surroundRoles = ["LS", "RS", "LSS", "RSS", "LBS", "RBS", "LRS", "RRS"];
    const speakersToOptimise = allSpeakers.filter(sp => surroundRoles.includes(sp.role));
    const otherSpeakers = allSpeakers.filter(sp => !surroundRoles.includes(sp.role));

    if (speakersToOptimise.length < 2) return allSpeakers;

    const radius = Math.max(...speakersToOptimise.map(sp => {
        const dx = sp.position.x - MLP.x;
        const dy = sp.position.y - MLP.y;
        return Math.sqrt(dx*dx + dy*dy);
    }));

    let bestAchievedLayout = null;
    let bestAchievedLevel = 0;
    
    // Attempt optimization for L4, L3, L2
    [50, 60, 80].forEach(targetAngle => {
        if (bestAchievedLayout) return; // Already found the best possible layout

        const totalAngle = (speakersToOptimise.length - 1) * targetAngle;
        const startAngle = -90 - (totalAngle / 2) + (targetAngle / 2); // Center the array

        const newPositions = speakersToOptimise.map((speaker, index) => {
            const angle = startAngle + index * targetAngle;
            const angleRad = angle * (Math.PI / 180);
            return {
                ...speaker,
                position: {
                    x: MLP.x + radius * Math.cos(angleRad),
                    y: MLP.y + radius * Math.sin(angleRad),
                    z: speaker.position.z, // Keep original height
                }
            };
        });

        // Verify if this layout meets the criteria
        const gap = getMaxSurroundAngleGap(MLP, newPositions);
        if (gap <= targetAngle + 1) { // Add tolerance
            bestAchievedLayout = newPositions;
            bestAchievedLevel = classifyParam5Level(gap).level;
        }
    });

    if (bestAchievedLayout) {
        return [...otherSpeakers, ...bestAchievedLayout];
    }
    
    return null; // Could not optimize
    */
}