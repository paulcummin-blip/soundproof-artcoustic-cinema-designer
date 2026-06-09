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
  const { roomDims, setRoomWidthM, setRoomLengthM, setRoomHeightM, overlays, setOverlays } = useAppState();

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
    // Allow digits, single decimal point, and trailing decimal
    if (!/^\d*\.?\d*$/.test(raw)) return;

    setDraftDims((prev) => ({
      ...prev,
      [key]: raw,
    }));
  };

  const handleDimensionBlur = (key) => {
    const value = draftDims[key];
    
    // Skip invalid states
    if (value === "" || value === ".") {
      setDraftDims((prev) => ({
        ...prev,
        [key]: formatDimension(roomDims?.[`${key}M`]),
      }));
      return;
    }

    // Parse and commit
    const parsed = parseDimensionInput(value);
    if (parsed !== null) {
      if (key === 'width') {
        setRoomWidthM(parsed);
      } else if (key === 'length') {
        setRoomLengthM(parsed);
      } else if (key === 'height') {
        setRoomHeightM(parsed);
      }
    }

    // Format to clean display
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
          name="room-length-m"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
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
          name="room-width-m"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
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
          name="room-height-m"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={draftDims.height}
          onChange={(e) => handleDimensionChange('height', e.target.value)}
          onBlur={() => handleDimensionBlur('height')}
          disabled={disabled}
          style={inputStyle}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "#3E4349" }}>
          Show room dimensions on plan
        </span>
        <button
          type="button"
          onClick={() => {
            if (!setOverlays) return;
            const on = !!overlays?.ROOM_DIMS;
            setOverlays({ ...(overlays || {}), ROOM_DIMS: !on });
          }}
          style={{
            position: "relative",
            width: 54,
            height: 30,
            borderRadius: 999,
            border: "1px solid #DCDBD6",
            padding: 0,
            background: overlays?.ROOM_DIMS ? "#213428" : "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: overlays?.ROOM_DIMS ? "flex-end" : "flex-start",
            cursor: "pointer",
            transition: "background 120ms ease, justify-content 120ms ease",
          }}
          aria-pressed={overlays?.ROOM_DIMS ? "true" : "false"}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "999px",
              margin: "0 3px",
              background: "#FFFFFF",
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }}
          />
        </button>
      </div>

      {roomDims.widthM > 0 && roomDims.lengthM > 0 && roomDims.heightM > 0 && (
        <p className="text-xs text-gray-500 italic mt-2">
          Room volume: {(roomDims.widthM * roomDims.lengthM * roomDims.heightM).toFixed(2)} m³
        </p>
      )}
    </div>
  );
}