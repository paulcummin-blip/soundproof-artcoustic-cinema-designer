import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/**
 * Brand colour picker: native colour swatch + hex text input.
 *
 * Props:
 * - label: string
 * - value: string (hex colour, e.g. "#213428")
 * - onChange: (hex) => void
 */
export default function ColourField({ label, value, onChange }) {
  const [hex, setHex] = useState(value || '#000000');

  useEffect(() => {
    setHex(value || '#000000');
  }, [value]);

  const handleSwatchChange = (e) => {
    const newHex = e.target.value;
    setHex(newHex);
    onChange(newHex);
  };

  const handleHexChange = (e) => {
    const newHex = e.target.value;
    setHex(newHex);
    if (/^#[0-9A-Fa-f]{6}$/.test(newHex)) {
      onChange(newHex);
    }
  };

  const handleHexBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setHex(value || '#000000');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[#3E4349]">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#000000'}
          onChange={handleSwatchChange}
          className="w-10 h-10 rounded-md border border-[#DCDBD6] cursor-pointer bg-white p-1"
        />
        <Input
          value={hex}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          className="bg-white border-[#DCDBD6] text-[#1B1A1A] font-mono"
          placeholder="#213428"
        />
      </div>
    </div>
  );
}