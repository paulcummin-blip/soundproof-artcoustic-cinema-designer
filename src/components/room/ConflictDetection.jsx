
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Lightbulb, Trash2, Wand2, ShieldAlert, Target, Users, Monitor, Move, Crown, Zap, BarChart4 } from "lucide-react";

// CEDIA RP23 viewing distance data (converted to meters)
const CEDIA_RP23_DATA = {
  100: { level1: [1.27, 4.29], level2: [1.51, 3.49], level3: [1.81, 3.07], level4: [1.99, 2.72] },
  110: { level1: [1.40, 4.72], level2: [1.67, 3.84], level3: [2.00, 3.37], level4: [2.19, 3.00] },
  120: { level1: [1.52, 5.15], level2: [1.82, 4.19], level3: [2.18, 3.68], level4: [2.39, 3.27] },
  130: { level1: [1.65, 5.57], level2: [1.97, 4.54], level3: [2.36, 3.99], level4: [2.59, 3.54] },
  140: { level1: [1.78, 6.00], level2: [2.12, 4.89], level3: [2.54, 4.29], level4: [2.79, 3.81] },
  150: { level1: [1.91, 6.43], level2: [2.27, 5.23], level3: [2.72, 4.60], level4: [2.99, 4.09] },
  160: { level1: [2.03, 6.86], level2: [2.42, 5.58], level3: [2.90, 4.91], level4: [3.19, 4.36] },
  170: { level1: [2.16, 7.29], level2: [2.57, 5.93], level3: [3.08, 5.21], level4: [3.39, 4.63] },
  180: { level1: [2.29, 7.72], level2: [2.72, 6.28], level3: [3.27, 5.52], level4: [3.59, 4.90] },
  190: { level1: [2.41, 8.15], level2: [2.88, 6.63], level3: [3.45, 5.83], level4: [3.79, 5.18] },
  200: { level1: [2.54, 8.58], level2: [3.03, 6.98], level3: [3.63, 6.13], level4: [3.99, 5.45] }
};

const getViewingDistances = (screenSize) => {
  if (!screenSize) return null;
  const availableSizes = Object.keys(CEDIA_RP23_DATA).map(Number);
  const closestSize = availableSizes.reduce((prev, curr) => 
    Math.abs(curr - screenSize) < Math.abs(prev - screenSize) ? curr : prev
  );
  return CEDIA_RP23_DATA[closestSize] || CEDIA_RP23_DATA[120];
};

export default function ConflictDetection({ 
  placedSpeakers, 
  roomElements, 
  roomDimensions, // Assuming roomDimensions contains length, width, and height
  screenWall,
  screenSize,
  roomOrientation,
  seatingPositions,
  dolbyConfig,
  onSpeakerRemove,
  onSpeakerOptimize,
  onSeatingAdjust,
  onScreenSizeAdjust
}) {
  
  const worldClassAnalysis = useMemo(() => {
    // Analysis should run if there are placed speakers for bass analysis,
    // even if room elements are empty.
    if (!placedSpeakers.length) {
      return { conflicts: [], solutions: [], screenConflicts: [], bassIssues: [], rp22Analysis: null, systemIntegrity: 'reference' };
    }

    const speakerClearance = 0.1; // 10cm - industry standard
    const wallProximityThreshold = 0.15;
    const detectedConflicts = [];
    const holisticSolutions = [];
    const detectedScreenConflicts = [];
    const bassIssues = []; // Array to store detected bass-related issues

    // Define an order of severity for integrity levels for merging
    const integritySeverity = {
      'reference': 0,
      'excellent': 1,
      'good': 2,
      'compromised': 3
    };

    let currentIntegrityLevel = 'reference'; // Initial state for merging integrity

    // Helper to downgrade the overall system integrity if a more severe issue is found
    const downgradeIntegrity = (newLevel) => {
      if (integritySeverity[newLevel] > integritySeverity[currentIntegrityLevel]) {
        currentIntegrityLevel = newLevel;
      }
    };

    // Get viewing distances for current screen size
    const viewingDistances = getViewingDistances(screenSize);

    // Calculate Main Listening Position (MLP)
    let mlp = { x: roomDimensions.length / 2, y: roomDimensions.width / 2 };
    if (seatingPositions.length > 0) {
      const sumX = seatingPositions.reduce((sum, seat) => sum + seat.x, 0);
      const sumY = seatingPositions.reduce((sum, seat) => sum + seat.y, 0);
      mlp = { x: sumX / seatingPositions.length, y: sumY / seatingPositions.length };
    }

    // Get screen position for viewing distance calculations
    const getScreenPosition = () => {
      if (roomOrientation === 'length_front') {
        if (screenWall === 'front') return { x: roomDimensions.length / 2, y: 0.1 };
        else return { x: roomDimensions.length / 2, y: roomDimensions.width - 0.1 };
      } else {
        if (screenWall === 'front') return { x: 0.1, y: roomDimensions.width / 2 };
        else return { x: roomDimensions.length - 0.1, y: roomDimensions.width / 2 };
      }
    };

    const screenPos = getScreenPosition();
    const currentViewingDistance = Math.sqrt(
      Math.pow(mlp.x - screenPos.x, 2) + Math.pow(mlp.y - screenPos.y, 2)
    );

    // RP22 PARAMETER 5 ANALYSIS
    const rp22Analysis = {
      parameter5: { compliant: true, level: 'Level 4 (Reference)', violations: [], maxAngle: 0 }
    };

    if (seatingPositions.length > 0 && placedSpeakers.length > 0) {
      const bedSpeakers = placedSpeakers.filter(s => !s.position.includes('height'));
      let maxAngularSeparation = 0;
      const violations = [];

      seatingPositions.forEach(seat => {
        const surroundPairs = [
          ['surround_left', 'rear_surround_left'],
          ['surround_right', 'rear_surround_right']
        ];

        surroundPairs.forEach(([pos1, pos2]) => {
          const speaker1 = bedSpeakers.find(s => s.position === pos1);
          const speaker2 = bedSpeakers.find(s => s.position === pos2);

          if (speaker1 && speaker2) {
            const v1 = [speaker1.x - seat.x, speaker1.y - seat.y];
            const v2 = [speaker2.x - seat.x, speaker2.y - seat.y];
            
            const dotProduct = v1[0] * v2[0] + v1[1] * v2[1];
            const magnitude1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
            const magnitude2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
            
            if (magnitude1 > 0 && magnitude2 > 0) { // Ensure magnitudes are not zero to avoid division by zero
              const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct / (magnitude1 * magnitude2))));
              const angleDeg = angleRad * (180 / Math.PI);
              
              maxAngularSeparation = Math.max(maxAngularSeparation, angleDeg);
              
              if (angleDeg > 80) {
                violations.push({
                  seatName: seat.name || `Seat ${seat.id}`, // Assuming seat has a name or ID
                  speakerPair: `${pos1.replace(/_/g, ' ')} to ${pos2.replace(/_/g, ' ')}`,
                  angle: angleDeg.toFixed(1)
                });
              }
            }
          }
        });
      });

      rp22Analysis.parameter5.maxAngle = maxAngularSeparation;
      rp22Analysis.parameter5.violations = violations;

      if (maxAngularSeparation <= 50) {
        rp22Analysis.parameter5.level = 'Level 4 (Reference)';
      } else if (maxAngularSeparation <= 60) {
        rp22Analysis.parameter5.level = 'Level 3 (Critical)';
        downgradeIntegrity('excellent');
      } else if (maxAngularSeparation <= 80) {
        rp22Analysis.parameter5.level = 'Level 2 (Recommended)';
        downgradeIntegrity('good');
      } else {
        rp22Analysis.parameter5.level = 'Level 1 (Basic)';
        rp22Analysis.parameter5.compliant = false;
        downgradeIntegrity('compromised');
      }
    }

    // --- BASS RESPONSE ANALYSIS ---
    const roomLength = roomDimensions.length;
    const roomWidth = roomDimensions.width;
    const roomHeight = roomDimensions.height;
    
    if (roomLength && roomWidth && roomHeight && roomLength > 0 && roomWidth > 0 && roomHeight > 0) {
      // Calculate basic room ratios
      const ratioLW = roomLength / roomWidth;
      const ratioLH = roomLength / roomHeight;
      const ratioWH = roomWidth / roomHeight;
      
      // Check if room ratios are problematic (likely to cause bass issues due to overlapping modes)
      // CEDIA RP22/RP23 and common acoustic guidelines suggest avoiding simple integer ratios
      // and very small or very large ratios for each dimension.
      // A common problematic range for ratios (e.g., L/W, L/H, W/H) is outside 1.1 - 2.0 or too close to 1, 2, 3...
      const isProblematicRatio = (ratio) => 
        (ratio < 1.1 || ratio > 2.0 || // Avoid extreme aspect ratios
         Math.abs(ratio - 1) < 0.1 || Math.abs(ratio - 2) < 0.1 || Math.abs(ratio - 1.5) < 0.1); // Avoid simple integer/half ratios

      let problematicRatiosDetected = [];
      if (isProblematicRatio(ratioLW)) problematicRatiosDetected.push('Length/Width');
      if (isProblematicRatio(ratioLH)) problematicRatiosDetected.push('Length/Height');
      if (isProblematicRatio(ratioWH)) problematicRatiosDetected.push('Width/Height');

      if (problematicRatiosDetected.length > 0) {
        bassIssues.push({
          type: 'room_ratios',
          description: `Room ratios (${problematicRatiosDetected.join(', ')}) are not acoustically optimal. This can lead to uneven bass response (peaks and nulls) due to coinciding room modes.`,
          severity: 'moderate',
          recommendation: 'Consider adding bass trapping, using multiple subwoofers, and applying professional equalization to mitigate modal issues.',
          icon: Zap
        });
        downgradeIntegrity('good');
      }

      // Check room volume for bass extension capability and overall room gain
      const roomVolume = roomLength * roomWidth * roomHeight;
      const minVolumeForDeepBass = 45; // m^3 (approx 1500 cubic feet for impactful deep bass)
      
      if (roomVolume < minVolumeForDeepBass) {
        bassIssues.push({
          type: 'room_volume',
          description: `Room volume (${roomVolume.toFixed(1)}m³) is relatively small. Achieving deep, impactful bass (below 30Hz) might be challenging and require high-performance subwoofers and careful setup.`,
          severity: 'moderate',
          recommendation: 'Use sealed subwoofers with high excursion, consider multiple subs, and rely on robust room correction systems.',
          icon: Zap
        });
        downgradeIntegrity('good'); 
      }

      // Check MLP relative to room dimensions for potential modal issues (e.g., center of room)
      // Being too close to walls or dead center can be problematic for bass
      const isMlpNearCenter = (
        mlp.x > roomLength * 0.4 && mlp.x < roomLength * 0.6 &&
        mlp.y > roomWidth * 0.4 && mlp.y < roomWidth * 0.6
      );
      if (isMlpNearCenter) {
        bassIssues.push({
          type: 'mlp_position',
          description: `Main Listening Position is near the center of the room. This can put it directly in a null or peak of certain fundamental room modes, affecting bass quality.`,
          severity: 'minor',
          recommendation: 'Experiment with small shifts in MLP (e.e.g., 10-20% into the room) or implement multiple subwoofers to average out modal responses.',
          icon: Users
        });
        // This issue alone might not downgrade integrity significantly unless compounded
      }

    } else {
      bassIssues.push({
        type: 'missing_dimensions',
        description: 'Room dimensions (Length, Width, Height) are incomplete or invalid, preventing accurate bass response analysis.',
        severity: 'critical',
        recommendation: 'Please ensure complete and valid room dimensions are entered.',
        icon: AlertTriangle
      });
      downgradeIntegrity('compromised');
    }

    // --- SPEAKER CONFLICT DETECTION (Existing detailed logic preserved) ---
    // This section checks for physical interference between speakers and room elements.
    if (roomElements.length > 0) { // Only run if there are elements to check against
      roomElements.forEach((element) => {
        let wallAxis, wallCoord, wallLength;
        
        // Determine the wall coordinates based on room orientation
        if (roomOrientation === 'length_front') {
          if (element.wall === 'front') { wallAxis = 'Y'; wallCoord = 0.1; wallLength = roomDimensions.length; }
          else if (element.wall === 'back') { wallAxis = 'Y'; wallCoord = roomDimensions.width - 0.1; wallLength = roomDimensions.length; }
          else if (element.wall === 'left') { wallAxis = 'X'; wallCoord = 0.1; wallLength = roomDimensions.width; }
          else if (element.wall === 'right') { wallAxis = 'X'; wallCoord = roomDimensions.length - 0.1; wallLength = roomDimensions.width; }
        } else { // width_front
          if (element.wall === 'front') { wallAxis = 'X'; wallCoord = 0.1; wallLength = roomDimensions.width; }
          else if (element.wall === 'back') { wallAxis = 'X'; wallCoord = roomDimensions.length - 0.1; wallLength = roomDimensions.width; }
          else if (element.wall === 'left') { wallAxis = 'Y'; wallCoord = roomDimensions.width - 0.1; wallLength = roomDimensions.length; }
          else if (element.wall === 'right') { wallAxis = 'Y'; wallCoord = 0.1; wallLength = roomDimensions.length; }
        }
        
        if (!wallAxis) return; // Skip if wall information is not valid

        const elementCenterOnWall = element.x_position * wallLength;
        const elementStart = elementCenterOnWall - (element.width / 2);
        const elementEnd = elementCenterOnWall + (element.width / 2);

        placedSpeakers.forEach((speaker) => {
          // Subwoofers and height speakers typically have more flexible placement or are ceiling-mounted,
          // so this specific wall interference check is usually for on-wall/in-wall/floorstanding speakers.
          if (speaker.position.includes('subwoofer') || speaker.position.includes('height')) return;

          let speakerIsOnWall = false;
          let speakerPosOnWall;

          if (wallAxis === 'Y' && Math.abs(speaker.y - wallCoord) < wallProximityThreshold) {
            speakerIsOnWall = true;
            speakerPosOnWall = speaker.x;
          } else if (wallAxis === 'X' && Math.abs(speaker.x - wallCoord) < wallProximityThreshold) {
            speakerIsOnWall = true;
            speakerPosOnWall = speaker.y;
          }

          if (speakerIsOnWall && 
              speakerPosOnWall >= (elementStart - speakerClearance) && 
              speakerPosOnWall <= (elementEnd + speakerClearance)) {
            
            detectedConflicts.push({
              speaker,
              element,
              wallAxis,
              wallLength,
              elementStart,
              elementEnd,
              speakerPosOnWall,
              conflictType: 'placement_interference'
            });
          }
        });
      });
    }

    // --- GENERATE HOLISTIC SOLUTIONS (Existing detailed logic preserved) ---
    // Only generate solutions for unique conflicts to avoid redundancy.
    const uniqueConflicts = detectedConflicts.filter((conflict, index, arr) => {
      return arr.findIndex(c => 
        c.speaker.id === conflict.speaker.id && // Use speaker.id for uniqueness
        c.element.id === conflict.element.id // Assuming element has an id for uniqueness
      ) === index;
    });

    uniqueConflicts.forEach(conflict => {
      const { speaker, element, wallAxis, wallLength, elementStart, elementEnd, speakerPosOnWall } = conflict;
      
      // Calculate required movement to clear obstacle
      const clearanceNeeded = (element.width / 2) + 0.15; // Element half-width + 15cm clearance
      let requiredMovement;
      let newSpeakerPosCoord; // Position on the wall axis

      if (speakerPosOnWall < elementStart) {
        // Speaker is before element, move it further left/down
        newSpeakerPosCoord = elementStart - clearanceNeeded;
        requiredMovement = Math.abs(newSpeakerPosCoord - speakerPosOnWall);
      } else {
        // Speaker is after element, move it further right/up
        newSpeakerPosCoord = elementEnd + clearanceNeeded;
        requiredMovement = Math.abs(newSpeakerPosCoord - speakerPosOnWall);
      }

      // Calculate new speaker position in room coordinates
      let newSpeakerX = speaker.x;
      let newSpeakerY = speaker.y;
      
      if (wallAxis === 'Y') { // Speaker moves along X axis (for elements on front/back walls)
        newSpeakerX = newSpeakerPosCoord;
      } else { // Speaker moves along Y axis (for elements on left/right walls)
        newSpeakerY = newSpeakerPosCoord;
      }

      // For side speakers, ideal angle is 110°. Calculate seating adjustment needed.
      if (speaker.position.includes('side')) {
        // Calculate new angle from MLP to repositioned speaker (not strictly used for solution, but for context)
        // const newAngle = Math.atan2(newSpeakerY - mlp.y, newSpeakerX - mlp.x) * (180 / Math.PI);
        // const newAngleNormalized = ((newAngle + 360) % 360);

        // To maintain the 110° angle, MLP needs to shift relative to the speaker.
        // A simplified approach is to shift MLP proportionally to speaker movement.
        let seatingAdjustment = { deltaX: 0, deltaY: 0, newViewingDistance: currentViewingDistance };
        
        const movementDirection = (speakerPosOnWall < elementStart) ? -1 : 1; // -1 if moved left/down, 1 if moved right/up
        const seatingMovementMagnitude = requiredMovement * 0.5; // Adjust seating by half the speaker movement, less jarring

        if (wallAxis === 'Y') { // Speaker moved horizontally (x-axis), seating adjusts x
          seatingAdjustment.deltaX = movementDirection * seatingMovementMagnitude;
        } else { // Speaker moved vertically (y-axis), seating adjusts y
          seatingAdjustment.deltaY = movementDirection * seatingMovementMagnitude;
        }

        const newSeatingX = mlp.x + seatingAdjustment.deltaX;
        const newSeatingY = mlp.y + seatingAdjustment.deltaY;
        seatingAdjustment.newViewingDistance = Math.sqrt(
          Math.pow(newSeatingX - screenPos.x, 2) + Math.pow(newSeatingY - screenPos.y, 2)
        );

        // Check if new viewing distance is acceptable by RP23 standards
        let viewingCompliance = 'unknown';
        let compromiseLevel = 'significant'; // Default to significant until proven otherwise
        
        if (viewingDistances) {
          const [level4Min, level4Max] = viewingDistances.level4;
          const [level3Min, level3Max] = viewingDistances.level3;
          const [level2Min, level2Max] = viewingDistances.level2;
          
          if (seatingAdjustment.newViewingDistance >= level4Min && seatingAdjustment.newViewingDistance <= level4Max) {
            viewingCompliance = 'Level 4 (Reference)';
            compromiseLevel = 'none';
          } else if (seatingAdjustment.newViewingDistance >= level3Min && seatingAdjustment.newViewingDistance <= level3Max) {
            viewingCompliance = 'Level 3 (Critical)';
            compromiseLevel = 'minimal';
          } else if (seatingAdjustment.newViewingDistance >= level2Min && seatingAdjustment.newViewingDistance <= level2Max) {
            viewingCompliance = 'Level 2 (Recommended)';
            compromiseLevel = 'acceptable';
          } else {
            viewingCompliance = 'Outside RP23 guidelines';
            compromiseLevel = 'significant';
          }
        }

        // Generate solution with holistic approach
        holisticSolutions.push({
          id: `holistic_${speaker.position}_${element.id}`,
          type: 'holistic_repositioning',
          title: `Reposition ${speaker.position.replace(/_/g, ' ')} & Adjust Seating`,
          description: `Move ${speaker.position.replace(/_/g, ' ')} by ${requiredMovement.toFixed(2)}m to clear ${element.type}. Seating will be adjusted to maintain acoustic geometry.`,
          impact: compromiseLevel,
          priority: compromiseLevel === 'none' ? 'recommended' : compromiseLevel === 'minimal' ? 'acceptable' : 'caution',
          action: () => onSpeakerOptimize(speaker.id, {x: newSpeakerX, y: newSpeakerY}), // Pass new absolute position
          // Assuming onSeatingAdjust receives delta for MLP
          seatingAction: () => onSeatingAdjust(seatingAdjustment.deltaX, seatingAdjustment.deltaY), 
          details: {
            speakerMovement: `${requiredMovement.toFixed(2)}m ${wallAxis === 'Y' ? 'horizontally' : 'vertically'}`,
            seatingAdjustment: `${seatingMovementMagnitude.toFixed(2)}m ${wallAxis === 'Y' ? 'horizontally' : 'vertically'}`,
            viewingDistance: `${seatingAdjustment.newViewingDistance.toFixed(2)}m (was ${currentViewingDistance.toFixed(2)}m)`,
            compliance: viewingCompliance,
            acoustic: '110° side speaker angle maintained',
            symmetry: 'Paired speaker moves identically'
          },
          icon: Target,
          badge: compromiseLevel === 'none' ? 'Reference Quality' : 
                 compromiseLevel === 'minimal' ? 'Excellent' :
                 compromiseLevel === 'acceptable' ? 'Good' : 'Compromise Required'
        });
      } else {
        // For non-side speakers, simpler repositioning
        holisticSolutions.push({
          id: `reposition_${speaker.position}_${element.id}`,
          type: 'precision_repositioning',
          title: `Reposition ${speaker.position.replace(/_/g, ' ')}`,
          description: `Move ${speaker.position.replace(/_/g, ' ')} by ${requiredMovement.toFixed(2)}m to clear ${element.type}.`,
          impact: 'minimal',
          priority: 'recommended',
          action: () => onSpeakerOptimize(speaker.id, {x: newSpeakerX, y: newSpeakerY}),
          details: {
            speakerMovement: `${requiredMovement.toFixed(2)}m adjustment`,
            symmetry: 'Paired speaker moves identically',
            acoustic: 'Minimal impact on imaging',
            installation: 'Standard repositioning practice'
          },
          icon: Move,
          badge: 'Recommended'
        });
      }
    });

    // --- MERGE SYSTEM INTEGRITY LEVELS ---
    // After all checks, combine integrity levels.
    // The currentIntegrityLevel has already been downgraded by bass issues and RP22 analysis.
    // Now, further downgrade based on speaker conflicts and solutions.
    if (uniqueConflicts.length > 0) {
      const hasHighImpactSpeakerConflictSolution = holisticSolutions.some(s => s.impact === 'significant');
      const hasModerateImpactSpeakerConflictSolution = holisticSolutions.some(s => s.impact === 'acceptable');
      
      if (hasHighImpactSpeakerConflictSolution) downgradeIntegrity('compromised');
      else if (hasModerateImpactSpeakerConflictSolution) downgradeIntegrity('good');
      else downgradeIntegrity('excellent'); // If conflicts exist but solutions are excellent/minimal impact
    }
    // If no conflicts or bass issues or RP22 issues, it remains 'reference'.

    return { 
      conflicts: uniqueConflicts, // Keep existing detailed conflicts
      solutions: holisticSolutions, // Keep existing solutions
      screenConflicts: detectedScreenConflicts, // Keep existing screen conflicts (even if currently empty)
      bassIssues: bassIssues, // New addition
      rp22Analysis: rp22Analysis, // New addition
      systemIntegrity: currentIntegrityLevel // The merged integrity level
    };
  }, [placedSpeakers, roomElements, roomDimensions, screenWall, screenSize, roomOrientation, seatingPositions, dolbyConfig]);

  const { conflicts, solutions, screenConflicts, bassIssues, rp22Analysis, systemIntegrity } = worldClassAnalysis;

  const getIntegrityColor = (integrity) => {
    switch (integrity) {
      case 'reference': return 'text-green-400';
      case 'excellent': return 'text-blue-400';
      case 'good': return 'text-yellow-400';
      default: return 'text-red-400'; // 'compromised'
    }
  };

  const getIntegrityBadge = (integrity) => {
    switch (integrity) {
      case 'reference': return 'bg-green-500/20 text-green-300';
      case 'excellent': return 'bg-blue-500/20 text-blue-300';
      case 'good': return 'bg-yellow-500/20 text-yellow-300';
      default: return 'bg-red-500/20 text-red-300'; // 'compromised'
    }
  };

  const totalIssues = conflicts.length + screenConflicts.length + bassIssues.length + (rp22Analysis && !rp22Analysis.parameter5.compliant ? 1 : 0);

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Cinema Design Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={getIntegrityBadge(systemIntegrity)}>
              {systemIntegrity} level
            </Badge>
            <Badge className="bg-indigo-500/20 text-indigo-300">
              {totalIssues} issues found
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* System Integrity Assessment */}
        <div className="p-4 bg-zinc-800/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-white font-medium">System Acoustic Integrity</span>
          </div>
          <p className={`text-sm ${getIntegrityColor(systemIntegrity)}`}>
            {systemIntegrity === 'reference' && "Perfect - No acoustic compromises detected. This design meets reference standards."}
            {systemIntegrity === 'excellent' && "Excellent - Minor adjustments or considerations needed. Overall performance is very high."}  
            {systemIntegrity === 'good' && "Good - Some compromises or challenges identified, but performance can be maintained with careful planning and calibration."}
            {systemIntegrity === 'compromised' && "Compromised - Critical issues detected that may significantly impact acoustic performance or installation feasibility. Review and address immediately."}
          </p>
        </div>

        {/* RP22 Parameter 5 Analysis */}
        {rp22Analysis && rp22Analysis.parameter5 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BarChart4 className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white font-bold">5. Max Horizontal Angle Between Surround Speakers</h3>
            </div>
            <div className={`p-4 rounded-lg ${rp22Analysis.parameter5.compliant ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">Angular Separation Analysis</span>
                <Badge className={
                  rp22Analysis.parameter5.level.includes('4') ? 'bg-green-500/20 text-green-300' :
                  rp22Analysis.parameter5.level.includes('3') ? 'bg-blue-500/20 text-blue-300' :
                  rp22Analysis.parameter5.level.includes('2') ? 'bg-yellow-500/20 text-yellow-300' :
                  'bg-red-500/20 text-red-300'
                }>
                  {rp22Analysis.parameter5.level}
                </Badge>
              </div>
              <p className="text-zinc-300 text-sm mb-2">
                Maximum horizontal angle between adjacent surround speakers: {rp22Analysis.parameter5.maxAngle.toFixed(1)}°
              </p>
              {rp22Analysis.parameter5.violations.length > 0 && (
                <div className="mt-3">
                  <p className="text-red-400 text-sm font-medium mb-2">Violations (&gt;80°):</p>
                  {rp22Analysis.parameter5.violations.map((violation, index) => (
                    <div key={index} className="text-red-300 text-xs">
                      • {violation.seatName}: {violation.speakerPair} = {violation.angle}°
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bass Response & Room Acoustics Issues */}
        {bassIssues.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">Bass Response & Room Acoustics</h3>
            </div>
            <div className="space-y-3">
              {bassIssues.map((issue, index) => (
                <div 
                  key={`bass-issue-${index}`} 
                  className={`p-3 rounded-lg ${issue.severity === 'critical' ? 'bg-red-500/10 border border-red-500/20' : 'bg-purple-500/10 border border-purple-500/20'}`}
                >
                  <div className="flex items-center gap-2">
                    {issue.icon && <issue.icon className={`w-4 h-4 ${issue.severity === 'critical' ? 'text-red-400' : 'text-purple-400'}`} />}
                    <span className="text-white font-medium capitalize">
                      {issue.type.replace(/_/g, ' ')} issue detected
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-1">{issue.description}</p>
                  {issue.recommendation && (
                    <p className="text-zinc-400 text-xs mt-1 italic">
                      Recommendation: {issue.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Speaker Conflicts */}
        {conflicts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">Speaker Placement Conflicts</h3>
            </div>
            <div className="space-y-3">
              {conflicts.map((conflict, index) => (
                <div key={`speaker-conflict-${index}`} className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-white font-medium capitalize">
                      {conflict.speaker.position.replace(/_/g, ' ')} conflicts with {conflict.element.type}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-1">
                    Speaker requires 0.1m clearance from architectural elements
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Holistic Solutions */}
        {solutions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Holistic Solutions</h3>
            </div>
            <div className="space-y-4">
              {solutions.map((solution, index) => (
                <div key={`solution-${index}`} className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <solution.icon className="w-4 h-4 text-blue-400" />
                      <span className="text-white font-medium">{solution.title}</span>
                    </div>
                    <Badge className={
                      solution.badge === 'Reference Quality' ? 'bg-green-500/20 text-green-300' :
                      solution.badge === 'Excellent' ? 'bg-blue-500/20 text-blue-300' :
                      solution.badge === 'Good' ? 'bg-yellow-500/20 text-yellow-300' :
                      solution.badge === 'Recommended' ? 'bg-purple-500/20 text-purple-300' :
                      'bg-red-500/20 text-red-300'
                    }>
                      {solution.badge}
                    </Badge>
                  </div>

                  <p className="text-zinc-300 text-sm mb-3">{solution.description}</p>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {Object.entries(solution.details).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-zinc-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                        <div className="text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  {solution.action && (
                    <Button
                      onClick={solution.action}
                      className="mt-4 bg-indigo-600 hover:bg-indigo-500"
                      size="sm"
                    >
                      Apply Solution
                    </Button>
                  )}
                  {solution.seatingAction && (
                    <Button
                      onClick={solution.seatingAction}
                      className="mt-2 ml-2 bg-purple-600 hover:bg-purple-500"
                      size="sm"
                    >
                      Adjust Seating
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Conflicts */}
        {totalIssues === 0 && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Reference-Level Installation Ready</p>
            <p className="text-zinc-400 text-sm">
              No conflicts or acoustic challenges detected. This design is optimized for reference performance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
