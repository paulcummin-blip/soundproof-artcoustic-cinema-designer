
import React, { useState, useMemo, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine, // Added ReferenceLine
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SlidersHorizontal, BarChart4, Lightbulb, CheckCircle, AlertTriangle, Users, Info } from "lucide-react"; // Added Info
import { Badge } from "@/components/ui/badge";
import SpeakerDirectivityMap from './SpeakerDirectivityMap';

// Function to calculate the average listening position (MLP)
const getMLP = (seatingPositions) => {
    if (!seatingPositions || seatingPositions.length === 0) return null;
    return seatingPositions.reduce((acc, seat) => ({
        x: acc.x + seat.x / seatingPositions.length,
        y: acc.y + seat.y / seatingPositions.length,
        z: acc.z + (seat.z || 1.2) / seatingPositions.length, // Assume 1.2m default height if not specified for Z
    }), { x: 0, y: 0, z: 0 });
};

// Function to generate a plausible family of curves based on speaker specs
const generateSpeakerCurves = (speaker) => {
  if (!speaker) return { data: [], interpretation: null, isGood: false };

  const data = [];
  const baseFreq = speaker.frequency_response_low || 30;
  const topFreq = speaker.frequency_response_high || 20000;
  const isGoodSpeaker = speaker.is_artcoustic || speaker.brand === 'Revel'; // Fictional indicator of quality

  let onAxis = 100;
  for (let freq = 20; freq <= 20000; freq *= 1.1) {
    // Basic roll-off at ends
    if (freq < baseFreq) onAxis -= 2;
    if (freq > topFreq) onAxis -= 1;

    // Add some realistic ripple
    onAxis += (Math.random() - 0.5) * (isGoodSpeaker ? 1 : 3);
    onAxis = Math.min(100, Math.max(90, onAxis)); // Clamp within a range

    // Create other curves based on the On-Axis one
    const listeningWindow = onAxis - (isGoodSpeaker ? 0.5 : 1) - (Math.random() * (isGoodSpeaker ? 0.5 : 1.5));
    const earlyReflections = onAxis - (isGoodSpeaker ? 2 : 4) - (Math.random() * (isGoodSpeaker ? 1 : 2.5));

    data.push({
      frequency: freq.toFixed(0),
      "On-Axis": onAxis.toFixed(2),
      "Listening Window": listeningWindow.toFixed(2),
      "Early Reflections": earlyReflections.toFixed(2),
    });
  }

  // Generate interpretation
  const midPointIndex = Math.floor(data.length / 2);
  const deviation = data.length > midPointIndex ? Math.abs(parseFloat(data[midPointIndex]["On-Axis"]) - parseFloat(data[midPointIndex]["Early Reflections"])) : 0;
  let interpretation, isGood;
  if (deviation < 3.5 && isGoodSpeaker) {
    interpretation = "Excellent directivity control. The similarity between the direct and reflected sound ensures a consistent and predictable performance in a wide variety of rooms. This is a 'room-friendly' loudspeaker.";
    isGood = true;
  } else {
    interpretation = "Poor directivity control. The significant divergence between the direct (On-Axis/Listening Window) and reflected sound suggests this speaker's performance will be highly dependent on the room's acoustics and may sound colored or unbalanced off-axis.";
    isGood = false;
  }

  return { data, interpretation, isGood };
};

export default function OffAxisAnalysis({ 
    availableSpeakers, 
    placedSpeakers, 
    seatingPositions,
    roomOrientation,
    screenWall,
    roomDimensions
}) {
  const [selectedRole, setSelectedRole] = useState(null);

  const availableRoles = useMemo(() => {
      if (!placedSpeakers) return [];
      return placedSpeakers
        .filter(s => !s.position.includes('subwoofer'))
        .map(s => ({ id: s.id, name: s.name, position: s.position }));
  }, [placedSpeakers]);

  // Set default speaker to the L or R speaker if available
  useEffect(() => {
    if (availableRoles.length > 0) {
      const firstLCR = availableRoles.find(r => r.name === 'L' || r.name === 'R');
      if (firstLCR) {
        setSelectedRole(firstLCR.id);
      } else {
        setSelectedRole(availableRoles[0].id);
      }
    } else {
        setSelectedRole(null);
    }
  }, [availableRoles]);
  
  const { speakerInRoom, selectedSpeaker } = useMemo(() => {
      if (!selectedRole || !placedSpeakers || !availableSpeakers) return { speakerInRoom: null, selectedSpeaker: null };
      const speakerInRoom = placedSpeakers.find(s => s.id === selectedRole);
      if (!speakerInRoom) return { speakerInRoom: null, selectedSpeaker: null };

      const selectedSpeaker = availableSpeakers.find(s => s.model === speakerInRoom.model);
      return { speakerInRoom, selectedSpeaker };
  }, [selectedRole, placedSpeakers, availableSpeakers]);


  const { data: chartData, interpretation, isGood } = useMemo(() => {
    return generateSpeakerCurves(selectedSpeaker);
  }, [selectedSpeaker]);

  const audienceCoverage = useMemo(() => {
    if (!speakerInRoom || !selectedSpeaker || !seatingPositions || seatingPositions.length === 0) {
      return { analysis: "Not enough data for analysis. Please place speakers and define seating positions.", goodCoverage: false, warnings: [] };
    }

    const optimalHalfAngle = selectedSpeaker.horizontal_dispersion_angle / 2;
    let seatsOutsideWindow = 0;
    const warnings = [];

    // Define screen center to determine forward direction
    const getScreenCenter = () => {
        if (roomOrientation === "width_front") {
            return { x: screenWall === "front" ? 0.1 : roomDimensions.length - 0.1, y: roomDimensions.width / 2 };
        } else {
            return { x: roomDimensions.length / 2, y: screenWall === "front" ? 0.1 : roomDimensions.width - 0.1 };
        }
    };

    const mlp = getMLP(seatingPositions); // Use the external getMLP
    if (!mlp) return { analysis: "No seating positions defined to calculate audience coverage.", goodCoverage: false, warnings: [] };
    
    // For bed layer, 'on-axis' is from speaker towards the MLP.
    // For overhead, 'on-axis' is straight down (or at its fixed tilt).
    const onAxisVector = selectedSpeaker.type === 'overhead' 
        ? { x: 0, y: 0, z: -1 } // Simple downward vector for overheads
        : { x: mlp.x - speakerInRoom.x, y: mlp.y - speakerInRoom.y };

    seatingPositions.forEach(seat => {
      let angleDeg;
      
      if (selectedSpeaker.type === 'overhead' && selectedSpeaker.mounting === 'ceiling_fixed') {
        const dx = seat.x - speakerInRoom.x;
        const dy = seat.y - speakerInRoom.y;
        const dz = (seat.z || 1.2) - (speakerInRoom.z || 2.8); // Default speaker Z position if not defined
        
        const horizontalDistance = Math.sqrt(dx * dx + dy * dy);
        const verticalDistance = Math.abs(dz);
        
        const angleFromVertical = Math.atan2(horizontalDistance, verticalDistance) * (180 / Math.PI);
        
        const tweeterTilt = selectedSpeaker.tweeter_vertical_tilt || 0;
        angleDeg = Math.abs(angleFromVertical - tweeterTilt);
      } else {
        const speakerToSeatVecX = seat.x - speakerInRoom.x;
        const speakerToSeatVecY = seat.y - speakerInRoom.y;

        const magOnAxis = Math.sqrt(onAxisVector.x * onAxisVector.x + onAxisVector.y * onAxisVector.y);
        const magSeat = Math.sqrt(speakerToSeatVecX * speakerToSeatVecX + speakerToSeatVecY * speakerToSeatVecY);

        if (magOnAxis < 1e-6 || magSeat < 1e-6) {
          if (magSeat < 1e-6) warnings.push(`Seat "${seat.name}" is at the same position as the speaker, angle undefined.`);
          return; 
        }

        const dotProduct = onAxisVector.x * speakerToSeatVecX + onAxisVector.y * speakerToSeatVecY;
        const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct / (magOnAxis * magSeat))));
        angleDeg = Math.abs(angleRad * (180 / Math.PI));
      }

      if (angleDeg > optimalHalfAngle) {
        seatsOutsideWindow++;
        warnings.push(`Seat "${seat.name}" is at ${angleDeg.toFixed(1)}° off-axis, outside the optimal ±${optimalHalfAngle.toFixed(1)}° window.`);
      }
    });

    const coverageType = (selectedSpeaker.type === 'overhead' && selectedSpeaker.mounting === 'ceiling_fixed') 
                       ? 'coverage cone' 
                       : 'horizontal listening window';

    if (seatsOutsideWindow === 0) {
      return { 
        analysis: `Excellent. All ${seatingPositions.length} seats are within the selected speaker's optimal ±${optimalHalfAngle.toFixed(1)}° ${coverageType}.`, 
        goodCoverage: true,
        warnings: [] 
      };
    } else {
      return { 
        analysis: `Warning: ${seatsOutsideWindow} of ${seatingPositions.length} seats are outside the selected speaker's optimal ±${optimalHalfAngle.toFixed(1)}° ${coverageType}. This may result in reduced high-frequency detail for those listeners.`, 
        goodCoverage: false,
        warnings 
      };
    }
  }, [selectedSpeaker, speakerInRoom, seatingPositions, roomOrientation, screenWall, roomDimensions]);

  if (!availableSpeakers || availableSpeakers.length === 0) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" />
            Speaker Directivity Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-400">No speaker data available to analyze.</p>
        </CardContent>
      </Card>
    );
  }

  // --- RP22 Parameter Calculations ---

  // RP22 #5: Max Horizontal Angle (Surrounds)
  const calculateSurroundAngleSeparation = () => {
    const mlp = getMLP(seatingPositions); // Use the external getMLP
    if (!mlp) return { value: 'N/A', level: 'N/A' };

    const listenerLevelSpeakers = placedSpeakers
      .filter(s => !s.position.includes('height') && !s.position.includes('subwoofer'))
      .map(speaker => {
        const angle = (Math.atan2(speaker.y - mlp.y, speaker.x - mlp.x) * 180 / Math.PI + 360) % 360;
        return { ...speaker, angle };
      })
      .sort((a, b) => a.angle - b.angle);

    if (listenerLevelSpeakers.length < 2) return { value: 'N/A', level: 'N/A' };

    let maxSeparation = 0;
    for (let i = 0; i < listenerLevelSpeakers.length; i++) {
      const current = listenerLevelSpeakers[i];
      const next = listenerLevelSpeakers[(i + 1) % listenerLevelSpeakers.length]; 
      let separation = next.angle - current.angle;
      if (separation <= 0) separation += 360; // Handle wrap-around for the last speaker to the first
      if (separation > maxSeparation) maxSeparation = separation;
    }

    let level;
    if (maxSeparation <= 50) level = 4;
    else if (maxSeparation <= 60) level = 3;
    else if (maxSeparation <= 80) level = 2;
    else level = 1;
    
    return { value: maxSeparation.toFixed(1) + '°', level };
  };

  // RP22 #7: Wide Speaker Deviation
  const calculateWideSpeakerDeviation = () => {
      const mlp = getMLP(seatingPositions); // Use the external getMLP
      if (!mlp) return { value: 'N/A', level: 'N/A' };

      const wideLeft = placedSpeakers.find(s => s.position === 'wide_left');
      const wideRight = placedSpeakers.find(s => s.position === 'wide_right');
      if (!wideLeft && !wideRight) return { value: 'N/A', level: 'N/A' };
      
      let deviationLeft = Infinity;
      if (wideLeft) {
        const angleLeft = (Math.atan2(wideLeft.y - mlp.y, wideLeft.x - mlp.x) * 180 / Math.PI);
        deviationLeft = Math.abs(Math.abs(angleLeft) - 60); // Assuming 60 degrees from MLP center axis is ideal
      }

      let deviationRight = Infinity;
      if (wideRight) {
        const angleRight = (Math.atan2(wideRight.y - mlp.y, wideRight.x - mlp.x) * 180 / Math.PI);
        deviationRight = Math.abs(Math.abs(angleRight) - 60); // Assuming 60 degrees from MLP center axis is ideal
      }
      
      const overallDeviation = Math.min(deviationLeft, deviationRight); // Use the better of the two or N/A if neither exists

      if (overallDeviation === Infinity) return { value: 'N/A', level: 'N/A' };

      let level;
      if (overallDeviation <= 2) level = 4;
      else if (overallDeviation <= 5) level = 3;
      else if (overallDeviation <= 7) level = 2;
      else if (overallDeviation <= 10) level = 1;
      else level = 0; // The outline implies 0 for values worse than Level 1 (i.e. > 10)

      return { value: overallDeviation.toFixed(1) + '°', level };
  };

  const surroundAngle = useMemo(() => calculateSurroundAngleSeparation(), [placedSpeakers, seatingPositions]);
  const wideDeviation = useMemo(() => calculateWideSpeakerDeviation(), [placedSpeakers, seatingPositions]);

  const getLevelColor = (level) => {
    if (level === 'N/A') return 'bg-zinc-700 text-zinc-400'; // Specific style for N/A
    if (level >= 4) return 'bg-green-500/20 text-green-300';
    if (level === 3) return 'bg-blue-500/20 text-blue-300';
    if (level === 2) return 'bg-yellow-500/20 text-yellow-300';
    return 'bg-red-500/20 text-red-300';
  };


  return (
    <div className="space-y-6">
      {/* RP22 Live Analysis Scorecard */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart4 className="w-5 h-5" />
            RP22 Performance Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Spatial Resolution */}
          <div>
            <h4 className="font-semibold text-white mb-2">Spatial Resolution</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-zinc-400 font-bold">5. Surround Speaker Angle</span>
                  <Badge className={getLevelColor(surroundAngle.level)}>
                    {surroundAngle.level !== 'N/A' ? `Level ${surroundAngle.level}` : 'N/A'}
                  </Badge>
                </div>
                <div className="text-white font-mono text-lg">{surroundAngle.value}</div>
              </div>
              <div className="p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-zinc-400 font-bold">7. Wide Speaker Deviation</span>
                   <Badge className={getLevelColor(wideDeviation.level)}>
                     {wideDeviation.level !== 'N/A' ? `Level ${wideDeviation.level}` : 'N/A'}
                   </Badge>
                </div>
                <div className="text-white font-mono text-lg">{wideDeviation.value}</div>
              </div>
            </div>
          </div>
          {/* Timbre Section could be added here later */}
        </CardContent>
      </Card>
      
      {/* Speaker Directivity Analysis (existing component) */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" />
            Speaker Directivity & Coverage
          </CardTitle>
          <p className="text-sm text-zinc-400">
            Based on the research of Dr. Floyd E. Toole and CEDIA/CTA-RP22.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-zinc-300 mb-2 block">Analyze Speaker Role</Label>
            <Select value={selectedRole || ''} onValueChange={setSelectedRole}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue placeholder="Select a placed speaker to analyze..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {availableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id} className="text-white">
                    {role.name} ({role.position})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedSpeaker && speakerInRoom && (
            <>
              {/* Audience Coverage Analysis */}
              <div className={`p-4 rounded-lg border ${audienceCoverage.goodCoverage ? 'bg-green-500/10 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                <h4 className="font-medium text-white flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5" />
                  Audience Coverage Analysis
                </h4>
                <p className="text-sm text-zinc-300">{audienceCoverage.analysis}</p>
                {audienceCoverage.warnings.length > 0 && (
                  <ul className="text-xs text-yellow-400 mt-2 list-disc list-inside">
                    {audienceCoverage.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                )}
              </div>

              {/* Heat Map Visualization */}
              <SpeakerDirectivityMap 
                horizontalAngle={selectedSpeaker.horizontal_dispersion_angle}
                verticalAngle={selectedSpeaker.vertical_dispersion_angle}
                speakerType={selectedSpeaker.type}
                tweeterTilt={selectedSpeaker.tweeter_vertical_tilt || 0}
              />
              
              {/* Spinorama-style Graph */}
              <div className="w-full h-80 pr-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                      dataKey="frequency"
                      type="number"
                      scale="log"
                      domain={['dataMin', 'dataMax']}
                      stroke="#888"
                      ticks={[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]}
                      tickFormatter={(tick) => tick >= 1000 ? `${tick/1000}k` : tick}
                      label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis
                      stroke="#888"
                      label={{ value: 'Response (dB)', angle: -90, position: 'insideLeft', offset: 10 }}
                      domain={[85, 105]}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#222', border: '1px solid #444' }}
                      labelFormatter={(label) => `${label} Hz`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="On-Axis" stroke="#8884d8" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="Listening Window" stroke="#82ca9d" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="Early Reflections" stroke="#ffc658" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              <div className={`p-4 rounded-lg border ${isGood ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <h4 className="font-medium text-white flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5" />
                  Designer's Interpretation
                </h4>
                <p className="text-sm text-zinc-300">{interpretation}</p>
                
                <div className="mt-3 flex items-center gap-2 text-xs">
                  {isGood ? <CheckCircle className="w-4 h-4 text-green-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                  <span className={isGood ? "text-green-400" : "text-red-400"}>
                    {isGood ? "This speaker is likely to perform well in most rooms." : "This speaker's performance may be unpredictable."}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
