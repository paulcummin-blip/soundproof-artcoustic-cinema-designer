import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { POWER_OPTIONS } from '@/components/utils/spl/engine';

export default function AmplifierPowerSelector({ 
  value, 
  onChange, 
  disabled = false,
  className = '' 
}) {
  const [isCustom, setIsCustom] = React.useState(
    value != null && !POWER_OPTIONS.includes(value)
  );

  const handleSelectChange = (val) => {
    if (val === 'custom') {
      setIsCustom(true);
      onChange?.(100); // Default custom value
    } else {
      setIsCustom(false);
      onChange?.(Number(val));
    }
  };

  const handleCustomChange = (e) => {
    const num = Number(e.target.value);
    if (Number.isFinite(num) && num > 0) {
      onChange?.(num);
    }
  };

  if (isCustom) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Input
          type="number"
          min="1"
          max="10000"
          step="1"
          value={value || 100}
          onChange={handleCustomChange}
          disabled={disabled}
          className="h-9 w-24"
          style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
        />
        <span className="text-xs text-[#625143]">W</span>
        <button
          onClick={() => setIsCustom(false)}
          disabled={disabled}
          className="text-xs text-[#625143] hover:text-[#1B1A1A] underline"
        >
          Presets
        </button>
      </div>
    );
  }

  return (
    <Select
      value={value != null ? String(value) : undefined}
      onValueChange={handleSelectChange}
      disabled={disabled}
    >
      <SelectTrigger 
        className={`h-9 w-32 ${className}`}
        style={{ backgroundColor: '#ffffff', border: '1px solid #C1B6AD', color: '#1B1A1A' }}
      >
        <SelectValue placeholder="100 W" />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6} className="z-[70] bg-white border-[#DCDBD6]">
        {POWER_OPTIONS.map((watts) => (
          <SelectItem key={watts} value={String(watts)} className="text-[#1B1A1A] hover:bg-[#F8F8F7]">
            {watts} W
          </SelectItem>
        ))}
        <SelectItem value="custom" className="text-[#1B1A1A] hover:bg-[#F8F8F7]">
          Custom...
        </SelectItem>
      </SelectContent>
    </Select>
  );
}