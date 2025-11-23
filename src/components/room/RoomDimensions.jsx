import React from "react";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/components/AppStateProvider";

const roundToCm = (num) => {
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
};

const parseDimensionInput = (raw) => {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const normalised = str.replace(',', '.');
  const num = parseFloat(normalised);
  if (!Number.isFinite(num) || num <= 0) return null;

  return roundToCm(num);
};

const formatDimension = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fixed = num.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
};

export default function RoomDimensions({ disabled }) {
  const { roomDims, setRoomWidthM, setRoomLengthM, setRoomHeightM } = useAppState();

  const [draftDims, setDraftDims] = React.useState(() => ({
    width: formatDimension(roomDims?.widthM),
    length: formatDimension(roomDims?.lengthM),
    height: formatDimension(roomDims?.heightM),
  }));

  React.useEffect(() => {
    setDraftDims({
      width: formatDimension(roomDims?.widthM),
      length: formatDimension(roomDims?.lengthM),
      height: formatDimension(roomDims?.heightM),
    });
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const handleDimensionChange = (key, raw) => {
    const value = raw;

    setDraftDims((prev) => ({
      ...prev,
      [key]: value,
    }));

    const parsed = parseDimensionInput(value);
    if (parsed === null) {
      return;
    }

    if (key === 'width') {
      setRoomWidthM(parsed);
    } else if (key === 'length') {
      setRoomLengthM(parsed);
    } else if (key === 'height') {
      setRoomHeightM(parsed);
    }
  };

  const handleDimensionBlur = (key) => {
    setDraftDims((prev) => ({
      ...prev,
      [key]: formatDimension(roomDims?.[`${key}M`]),
    }));
  };

  const inputStyle = {
    border: "1px solid #DCDBD6",
    borderRadius: "10px",
    padding: "10px 12px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="room-length" className="block mb-2">Length (m)</Label>
        <Input
          id="room-length"
          type="text"
          inputMode="decimal"
          value={draftDims.length}
          onChange={(e) => handleDimensionChange('length', e.target.value)}
          onBlur={() => handleDimensionBlur('length')}
          disabled={disabled}
          style={inputStyle}
        />
      </div>

      <div>
        <Label htmlFor="room-width" className="block mb-2">Width (m)</Label>
        <Input
          id="room-width"
          type="text"
          inputMode="decimal"
          value={draftDims.width}
          onChange={(e) => handleDimensionChange('width', e.target.value)}
          onBlur={() => handleDimensionBlur('width')}
          disabled={disabled}
          style={inputStyle}
        />
      </div>

      <div>
        <Label htmlFor="room-height" className="block mb-2">Height (m)</Label>
        <Input
          id="room-height"
          type="text"
          inputMode="decimal"
          value={draftDims.height}
          onChange={(e) => handleDimensionChange('height', e.target.value)}
          onBlur={() => handleDimensionBlur('height')}
          disabled={disabled}
          style={inputStyle}
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