import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Compass } from 'lucide-react';

export default function RoomOrientation({
  screenWall, onScreenWallChange,
}) {
  const wallLabels = {
    front: "Front Wall (Default)",
    back: "Back Wall", 
    left: "Left Wall",
    right: "Right Wall"
  };

  return (
    <Card className="bg-[#FFFFFF] border-[#DCDBD6] relative overflow-hidden">
      <CardHeader>
        <CardTitle className="text-[#1B1A1A] font-header flex items-center gap-2">
          <Compass className="w-5 h-5" />
          Room Orientation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 font-body">
        <div>
          <Label className="text-[#3E4349]">Screen Wall</Label>
          <Select value={screenWall} onValueChange={onScreenWallChange}>
            <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#DCDBD6]">
              {Object.entries(wallLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-[#1B1A1A] font-body">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[#625143] mt-1">
            Wall where the projection screen will be mounted. This affects speaker positioning and optimal viewing angles.
          </p>
        </div>
      </CardContent>
      <div 
        className="absolute bottom-3 right-3 w-16 h-16 opacity-[0.12] pointer-events-none z-0"
        style={{
          backgroundImage: `url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c0d2feeed_Artcoustic-logo_dark-grey-icon_TRANSPARENT_BACKGROUND.png')`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          backgroundPosition: 'center'
        }}
      />
    </Card>
  );
}