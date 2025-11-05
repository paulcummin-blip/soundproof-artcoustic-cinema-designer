import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function ZonesControl({
  enabled, onToggle,
  angles, onAnglesToggle
}) {
  return (
    <div className="flex items-center gap-4 bg-white/90 backdrop-blur-sm px-4 py-3 rounded-lg shadow-md border brand-border">
      <div className="flex items-center gap-2">
        <Label htmlFor="zones-toggle" className="text-sm text-[#3E4349] font-medium cursor-pointer">
          Speaker zones
        </Label>
        <Switch
          id="zones-toggle"
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>

      <div className="h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-2">
        <Label htmlFor="angles-toggle" className="text-sm text-[#3E4349] font-medium cursor-pointer">
          Angles
        </Label>
        <Switch
          id="angles-toggle"
          checked={angles}
          onCheckedChange={onAnglesToggle}
        />
      </div>
    </div>
  );
}