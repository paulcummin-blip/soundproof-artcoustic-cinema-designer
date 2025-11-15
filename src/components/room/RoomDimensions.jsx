import React from "react";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/components/AppStateProvider";

const roundToCm = (num) => {
  if (!Number.isFinite(num)) return null;
  // round to centimetres (2 decimal places in metres)
  return Math.round(num * 100) / 100;
};

const parseDimensionInput = (raw) => {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // Allow commas as decimal separators
  const normalised = str.replace(',', '.');
  const num = parseFloat(normalised);
  if (!Number.isFinite(num) || num <= 0) return null;

  return roundToCm(num);
};

const formatDimension = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  // show up to 2 decimal places, removing trailing zeros
  const fixed = num.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
};

export default function RoomDimensions({ disabled }) {
  const { roomDims, setRoomWidthM, setRoomLengthM, setRoomHeightM } = useAppState();

  const inputStyle = {
    border: "1px solid #DCDBD6",
    borderRadius: "10px",
    padding: "10px 12px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
  };

  const handleDimensionChange = (key, raw) => {
    const parsed = parseDimensionInput(raw);

    if (key === 'width') {
      if (parsed === null) {
        setRoomWidthM('');
      } else {
        setRoomWidthM(parsed);
      }
    } else if (key === 'length') {
      if (parsed === null) {
        setRoomLengthM('');
      } else {
        setRoomLengthM(parsed);
      }
    } else if (key === 'height') {
      if (parsed === null) {
        setRoomHeightM('');
      } else {
        setRoomHeightM(parsed);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="room-width" className="block mb-2">Width (m)</Label>
        <Input
          id="room-width"
          type="text"
          inputMode="decimal"
          value={formatDimension(roomDims.widthM)}
          onChange={(e) => handleDimensionChange('width', e.target.value)}
          disabled={disabled}
          style={inputStyle}
          placeholder="e.g. 4.55"
        />
      </div>

      <div>
        <Label htmlFor="room-length" className="block mb-2">Length (m)</Label>
        <Input
          id="room-length"
          type="text"
          inputMode="decimal"
          value={formatDimension(roomDims.lengthM)}
          onChange={(e) => handleDimensionChange('length', e.target.value)}
          disabled={disabled}
          style={inputStyle}
          placeholder="e.g. 6.20"
        />
      </div>

      <div>
        <Label htmlFor="room-height" className="block mb-2">Height (m)</Label>
        <Input
          id="room-height"
          type="text"
          inputMode="decimal"
          value={formatDimension(roomDims.heightM)}
          onChange={(e) => handleDimensionChange('height', e.target.value)}
          disabled={disabled}
          style={inputStyle}
          placeholder="e.g. 2.80"
        />
      </div>

      {roomDims.widthM > 0 && roomDims.lengthM > 0 && roomDims.heightM > 0 && (
        <p className="text-xs text-gray-500 italic mt-2">
          Room volume: {(roomDims.widthM * roomDims.lengthM * roomDims.heightM).toFixed(2)} m³
        </p>
      )}
    </div>
  );
}