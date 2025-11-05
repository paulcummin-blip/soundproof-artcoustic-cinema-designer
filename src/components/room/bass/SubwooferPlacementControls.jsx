import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, RotateCw } from 'lucide-react';
import { useSubwooferPlacementOptions } from './useSubwooferPlacementOptions';

export default function SubwooferPlacementControls({ 
  subwoofers = [], 
  roomDimensions = { width: 4, length: 6, height: 2.8 }, 
  onPositionsChange = () => {}
}) {
    const [selectedPreset, setSelectedPreset] = useState('none');
    
    // Safe destructuring with defaults
    const hookResult = useSubwooferPlacementOptions(roomDimensions);
    const placementOptions = hookResult?.placementOptions || [];
    const getPositions = hookResult?.getPositions || (() => []);
    
    const subwooferCount = Array.isArray(subwoofers) ? subwoofers.length : 0;
    
    useEffect(() => {
        if (selectedPreset !== 'none' && subwooferCount > 0 && getPositions) {
            const newPositions = getPositions(selectedPreset, subwooferCount);
            if (newPositions && newPositions.length > 0) {
                onPositionsChange(newPositions);
            }
        }
    }, [selectedPreset, subwooferCount, getPositions, onPositionsChange]);

    if (subwooferCount === 0) return null;

    return (
        <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
            <CardHeader>
                <CardTitle className="text-[#1B1A1A] font-header flex items-center gap-2">
                    <MapPin className="w-5 h-5"/>
                    Subwoofer Placement Presets
                </CardTitle>
                <CardDescription className="text-sm text-[#3E4349] font-body">
                    Automatically position the subwoofer array using proven methods.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {placementOptions.map(opt => (
                        <Button 
                            key={opt.id}
                            variant={selectedPreset === opt.id ? 'default' : 'outline'}
                            onClick={() => setSelectedPreset(opt.id)}
                            className={`w-full h-full text-center p-3 text-xs flex-col gap-1 border-[#DCDBD6] ${
                                selectedPreset === opt.id 
                                    ? 'bg-[#213428] text-white hover:bg-[#3E4349]' 
                                    : 'text-[#3E4349] hover:bg-[#C1B6AD]/20'
                            }`}
                        >
                            <span>{opt.name}</span>
                        </Button>
                    ))}
                    <Button 
                        variant="outline"
                        onClick={() => setSelectedPreset('none')}
                        className="w-full h-full text-center p-3 text-xs flex-col gap-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#C1B6AD]/20"
                    >
                        <RotateCw className="w-4 h-4 mb-1"/>
                        <span>Manual</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}