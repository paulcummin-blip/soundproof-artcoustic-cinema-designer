
"use client";

import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppState } from '../AppStateProvider';

const isSevenBedLayout = (layout) => {
  return layout && (
    layout.startsWith('7.1') || 
    layout.startsWith('7.2') // Future-proofing
  );
};

export default function SevenLayoutSwitcher() {
  const { dolbyLayout, sevenBedLayoutType, setSevenBedLayoutType } = useAppState();

  if (!isSevenBedLayout(dolbyLayout)) {
    return null;
  }

  const isWidesMode = sevenBedLayoutType === 'wides';

  const handleToggle = (checked) => {
    setSevenBedLayoutType(checked ? 'wides' : 'rears');
  };

  return (
    <div className="border-t border-[#DCDBD6] mt-4 pt-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="seven-bed-switch" className="text-sm text-[#3E4349] pr-4">
          Use Front Wides instead of Rear Surrounds
        </Label>
        <Switch
          id="seven-bed-switch"
          checked={isWidesMode}
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-[#213428] data-[state=unchecked]:bg-[#C1B6AD]"
        />
      </div>
      <p className="text-xs text-[#625143] mt-2">
        Toggles the 7-channel bed layer between a rear surround pair (SBL/SBR) and a front wide pair (LW/RW).
      </p>
    </div>
  );
}
