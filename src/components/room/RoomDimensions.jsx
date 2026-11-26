import React from "react";
import { RotateCw, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/components/AppStateProvider";
import PlanDisplayToggle from "@/components/room/PlanDisplayToggle";
import { useRotateRoom } from "@/components/room/useRotateRoom";
import RotateRoomConfirmDialog from "@/components/room/RotateRoomConfirmDialog";
import { roomDimsIntegrityMessage, roomDimsIntegrityBlocksCalculation } from "@/components/utils/roomDimensionsIntegrity";

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

export default function RoomDimensions({ disabled, speakerPositionsView, onSpeakerPositionsViewChange, speakerPositionsDisabled = false }) {
  const { roomDims, setRoomWidthM, setRoomLengthM, setRoomHeightM, overlays, setOverlays, roomDimsIntegrity } = useAppState();
  const rotateRoom = useRotateRoom();
  const [rotateConfirmOpen, setRotateConfirmOpen] = React.useState(false);
  const integrityMessage = roomDimsIntegrityMessage(roomDimsIntegrity);
  const dimsBlocked = roomDimsIntegrityBlocksCalculation(roomDimsIntegrity);

  const [draftDims, setDraftDims] = React.useState(() => ({
    width: formatDimension(roomDims?.widthM),
    length: formatDimension(roomDims?.lengthM),
    height: formatDimension(roomDims?.heightM),
  }));

  // Tracks the last value committed for each dimension. Guards against
  // duplicate recalculations when Enter commits and the subsequent blur
  // fires for the same unchanged value.
  const lastCommittedRef = React.useRef({
    width: roomDims?.widthM,
    length: roomDims?.lengthM,
    height: roomDims?.heightM,
  });

  React.useEffect(() => {
    setDraftDims({
      width: formatDimension(roomDims?.widthM),
      length: formatDimension(roomDims?.lengthM),
      height: formatDimension(roomDims?.heightM),
    });
    lastCommittedRef.current = {
      width: roomDims?.widthM,
      length: roomDims?.lengthM,
      height: roomDims?.heightM,
    };
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const handleDimensionChange = (key, raw) => {
    // Allow digits, single decimal point, and trailing decimal
    if (!/^\d*\.?\d*$/.test(raw)) return;

    setDraftDims((prev) => ({
      ...prev,
      [key]: raw,
    }));
  };

  // Shared commit used by both blur and Enter. Only calls the dimension
  // setter when the parsed value actually differs from the last committed
  // value, so pressing Enter then leaving the field does not trigger a
  // duplicate update or recalculation.
  const commitDimension = (key) => {
    const value = draftDims[key];

    // Skip invalid states
    if (value === "" || value === ".") {
      setDraftDims((prev) => ({
        ...prev,
        [key]: formatDimension(roomDims?.[`${key}M`]),
      }));
      lastCommittedRef.current[key] = roomDims?.[`${key}M`];
      return;
    }

    // Parse and commit only if changed
    const parsed = parseDimensionInput(value);
    if (parsed !== null && parsed !== lastCommittedRef.current[key]) {
      lastCommittedRef.current[key] = parsed;
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

  const handleDimensionKeyDown = (key, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDimension(key);
      // Blur so the field leaves editing mode; the blur commit is a guarded
      // no-op when the value is unchanged.
      e.target.blur();
    }
  };

  // Mutual exclusivity (Plan View only): only one of Room Dimensions /
  // Speaker Positions can be ON at the same time on the plan. In Front / Side /
  // Isometric the Speaker Positions control is disabled, so toggling Room
  // Dimensions there must NOT touch the saved Plan View Speaker Positions
  // preference — it is a plan-only overlay and its value is preserved.
  const handleRoomDimsToggle = (next) => {
    if (!setOverlays) return;
    setOverlays((prev) => ({ ...(prev || {}), ROOM_DIMS: next }));
    if (next && !speakerPositionsDisabled) onSpeakerPositionsViewChange("off");
  };

  const handleSpeakerPositionsToggle = (next) => {
    if (speakerPositionsDisabled) return;
    const nextView = next ? "plan" : "off";
    if (next && setOverlays) {
      setOverlays((prev) => ({ ...(prev || {}), ROOM_DIMS: false }));
    }
    onSpeakerPositionsViewChange(nextView);
  };

  // Normalise legacy state where both were ON: prefer Room Dimensions.
  // Plan View only — never overwrite the Plan preference from another view.
  React.useEffect(() => {
    if (speakerPositionsDisabled) return;
    if (overlays?.ROOM_DIMS && speakerPositionsView === "plan") {
      onSpeakerPositionsViewChange("off");
    }
  }, [overlays?.ROOM_DIMS, speakerPositionsView, onSpeakerPositionsViewChange, speakerPositionsDisabled]);

  const compactInputStyle = {
    border: "1px solid #DCDBD6",
    borderRadius: "8px",
    padding: "8px 10px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
    width: "100%",
  };

  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px",
  };

  const fieldLabelStyle = "block mb-1.5 text-xs text-[#6B7280]";

  return (
    <div className="space-y-5">
      {/* Room dimensions integrity warning — shown when an established project
          has missing or invalid stored dimensions. Defaults must not be
          presented as confirmed saved geometry. */}
      {dimsBlocked && integrityMessage && (
        <div
          role="alert"
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #E5A85A',
            background: '#FBF3E5',
            color: '#7A4F1A',
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#B8761E' }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Room dimensions required</div>
            <div>{integrityMessage}</div>
            <div style={{ marginTop: 4, fontWeight: 500 }}>
              Enter the correct dimensions below and save to enable RP22 calculations.
            </div>
          </div>
        </div>
      )}

      {/* Room Size group — three compact equal-width columns */}
      <div>
        <div style={groupTitleStyle}>Room Size</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="room-length" className={fieldLabelStyle}>Length (m)</Label>
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
              onBlur={() => commitDimension('length')}
              onKeyDown={(e) => handleDimensionKeyDown('length', e)}
              disabled={disabled}
              style={compactInputStyle}
            />
          </div>

          <div>
            <Label htmlFor="room-width" className={fieldLabelStyle}>Width (m)</Label>
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
              onBlur={() => commitDimension('width')}
              onKeyDown={(e) => handleDimensionKeyDown('width', e)}
              disabled={disabled}
              style={compactInputStyle}
            />
          </div>

          <div>
            <Label htmlFor="room-height" className={fieldLabelStyle}>Height (m)</Label>
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
              onBlur={() => commitDimension('height')}
              onKeyDown={(e) => handleDimensionKeyDown('height', e)}
              disabled={disabled}
              style={compactInputStyle}
            />
          </div>
        </div>
      </div>

      {/* Rotate Room — swaps effective Width and Length, screen wall stays at top */}
      <button
        type="button"
        onClick={() => setRotateConfirmOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          borderColor: "#DCDBD6",
          background: "#FFF",
          color: "#1B1A1A",
          fontFamily: "Didact Gothic, sans-serif",
        }}
      >
        <RotateCw className="w-3.5 h-3.5" />
        Rotate Room
      </button>

      <RotateRoomConfirmDialog
        open={rotateConfirmOpen}
        onCancel={() => setRotateConfirmOpen(false)}
        onConfirm={() => {
          setRotateConfirmOpen(false);
          rotateRoom();
        }}
      />

      {/* Plan Overlays group — matching toggle rows */}
      <div>
        <div style={groupTitleStyle}>Plan Overlays</div>
        <div className="space-y-3">
          <PlanDisplayToggle
            label="Show room dimensions"
            checked={!!overlays?.ROOM_DIMS}
            onChange={handleRoomDimsToggle}
            disabled={disabled}
          />

          <PlanDisplayToggle
            label="Speaker Positions"
            checked={speakerPositionsView === "plan"}
            onChange={handleSpeakerPositionsToggle}
            disabled={disabled || speakerPositionsDisabled}
            tooltip={speakerPositionsDisabled ? "Available in Plan View" : undefined}
          />
        </div>
      </div>

      {/* Room volume — quiet summary line */}
      {roomDims.widthM > 0 && roomDims.lengthM > 0 && roomDims.heightM > 0 && (
        <p style={{ fontSize: "12px", color: "#9CA3AF", fontStyle: "italic" }}>
          Room volume: {(roomDims.widthM * roomDims.lengthM * roomDims.heightM).toFixed(2)} m³
        </p>
      )}
    </div>
  );
}