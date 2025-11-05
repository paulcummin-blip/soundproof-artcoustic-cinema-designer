import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SlidersHorizontal } from 'lucide-react';

const SubwooferPlacementControls = ({ subwooferCount, roomDimensions, onPositionsChange }) => {
  const [placementMode, setPlacementMode] = useState('manual');
  const [manualPositions, setManualPositions] = useState([]);

  useEffect(() => {
    // Initialize manual positions when subwoofer count changes
    setManualPositions(Array(subwooferCount).fill(null).map((_, i) => ({
      x: (roomDimensions.length / (subwooferCount + 1)) * (i + 1),
      y: 0.5, // Front wall default
      z: 0.2
    })));
  }, [subwooferCount, roomDimensions]);

  const applyPreset = useCallback((preset) => {
    let newPositions = [];
    const { length: L, width: W } = roomDimensions;
    if (subwooferCount === 1) {
      if (preset === 'corners') newPositions = [{ x: 0.1, y: 0.1, z: 0.2 }];
      else if (preset === 'midwall') newPositions = [{ x: L / 2, y: 0.1, z: 0.2 }];
    } else if (subwooferCount === 2) {
      if (preset === 'corners') newPositions = [{ x: 0.1, y: 0.1, z: 0.2 }, { x: L - 0.1, y: 0.1, z: 0.2 }];
      else if (preset === 'midwall') newPositions = [{ x: L / 2, y: 0.1, z: 0.2 }, { x: L / 2, y: W - 0.1, z: 0.2 }];
    }
    setManualPositions(newPositions);
    onPositionsChange(newPositions);
  }, [subwooferCount, roomDimensions, onPositionsChange]);
  
  useEffect(() => {
    // Auto-apply positions if in manual mode and positions are set
    if (placementMode === 'manual' && manualPositions.length > 0) {
      onPositionsChange(manualPositions);
    }
  }, [placementMode, manualPositions, onPositionsChange]);
  
  const handleManualPosChange = (index, axis, value) => {
    const updatedPositions = [...manualPositions];
    updatedPositions[index][axis] = parseFloat(value);
    setManualPositions(updatedPositions);
  };

  if (subwooferCount === 0) return null;

  return (
    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="text-[#1B1A1A] font-header flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5"/>
                    Subwoofer Placement
                </CardTitle>
                <CardDescription className="text-sm text-[#3E4349] font-body">Position your subwoofers for optimal bass response.</CardDescription>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => applyPreset('corners')} className="border-[#DCDBD6]">Corners</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('midwall')} className="border-[#DCDBD6]">Mid-Wall</Button>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <RadioGroup value={placementMode} onValueChange={setPlacementMode} className="mb-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="manual" id="manual"/>
            <Label htmlFor="manual">Manual Placement</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="auto" id="auto" disabled/>
            <Label htmlFor="auto">Auto-Optimise (Coming Soon)</Label>
          </div>
        </RadioGroup>
        
        {placementMode === 'manual' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {manualPositions.map((pos, index) => (
              <div key={index} className="p-4 bg-[#F9F8F6] border border-[#DCDBD6] rounded-lg">
                <h4 className="font-header text-[#1B1A1A] mb-2">Subwoofer {index + 1} Position</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">X (m)</Label>
                    <Input type="number" step="0.1" value={pos.x} onChange={(e) => handleManualPosChange(index, 'x', e.target.value)} className="h-8"/>
                  </div>
                  <div>
                    <Label className="text-xs">Y (m)</Label>
                    <Input type="number" step="0.1" value={pos.y} onChange={(e) => handleManualPosChange(index, 'y', e.target.value)} className="h-8"/>
                  </div>
                  <div>
                    <Label className="text-xs">Z (m)</Label>
                    <Input type="number" step="0.1" value={pos.z} onChange={(e) => handleManualPosChange(index, 'z', e.target.value)} className="h-8"/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SubwooferPlacementControls;