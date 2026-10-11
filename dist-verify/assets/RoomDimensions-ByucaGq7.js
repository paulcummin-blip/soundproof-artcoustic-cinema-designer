import { j as jsxRuntimeExports, S as Switch, u as useAppState, R as React, I as Input } from "./index-BdFovajD.js";
import { L as Label } from "./Label-Bp7A8ZDp.js";
function PlanDisplayToggle({ label, checked, onChange, disabled }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-[#3E4349]", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked, onCheckedChange: onChange, disabled })
  ] });
}
const roundToCm = (num) => {
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
};
const parseDimensionInput = (raw) => {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const normalised = str.replace(",", ".");
  const num = parseFloat(normalised);
  if (!Number.isFinite(num) || num <= 0) return null;
  return roundToCm(num);
};
const formatDimension = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  const fixed = num.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
};
function RoomDimensions({ disabled, speakerPositionsView, onSpeakerPositionsViewChange }) {
  const { roomDims, setRoomWidthM, setRoomLengthM, setRoomHeightM, overlays, setOverlays } = useAppState();
  const [draftDims, setDraftDims] = React.useState(() => ({
    width: formatDimension(roomDims == null ? void 0 : roomDims.widthM),
    length: formatDimension(roomDims == null ? void 0 : roomDims.lengthM),
    height: formatDimension(roomDims == null ? void 0 : roomDims.heightM)
  }));
  React.useEffect(() => {
    setDraftDims({
      width: formatDimension(roomDims == null ? void 0 : roomDims.widthM),
      length: formatDimension(roomDims == null ? void 0 : roomDims.lengthM),
      height: formatDimension(roomDims == null ? void 0 : roomDims.heightM)
    });
  }, [roomDims == null ? void 0 : roomDims.widthM, roomDims == null ? void 0 : roomDims.lengthM, roomDims == null ? void 0 : roomDims.heightM]);
  const handleDimensionChange = (key, raw) => {
    if (!/^\d*\.?\d*$/.test(raw)) return;
    setDraftDims((prev) => ({
      ...prev,
      [key]: raw
    }));
  };
  const handleDimensionBlur = (key) => {
    const value = draftDims[key];
    if (value === "" || value === ".") {
      setDraftDims((prev) => ({
        ...prev,
        [key]: formatDimension(roomDims == null ? void 0 : roomDims[`${key}M`])
      }));
      return;
    }
    const parsed = parseDimensionInput(value);
    if (parsed !== null) {
      if (key === "width") {
        setRoomWidthM(parsed);
      } else if (key === "length") {
        setRoomLengthM(parsed);
      } else if (key === "height") {
        setRoomHeightM(parsed);
      }
    }
    setDraftDims((prev) => ({
      ...prev,
      [key]: formatDimension(roomDims == null ? void 0 : roomDims[`${key}M`])
    }));
  };
  const handleRoomDimsToggle = (next) => {
    if (!setOverlays) return;
    setOverlays((prev) => ({ ...prev || {}, ROOM_DIMS: next }));
    if (next) onSpeakerPositionsViewChange("off");
  };
  const handleSpeakerPositionsToggle = (next) => {
    const nextView = next ? "plan" : "off";
    if (next && setOverlays) {
      setOverlays((prev) => ({ ...prev || {}, ROOM_DIMS: false }));
    }
    onSpeakerPositionsViewChange(nextView);
  };
  React.useEffect(() => {
    if ((overlays == null ? void 0 : overlays.ROOM_DIMS) && speakerPositionsView === "plan") {
      onSpeakerPositionsViewChange("off");
    }
  }, [overlays == null ? void 0 : overlays.ROOM_DIMS, speakerPositionsView, onSpeakerPositionsViewChange]);
  const compactInputStyle = {
    border: "1px solid #DCDBD6",
    borderRadius: "8px",
    padding: "8px 10px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
    width: "100%"
  };
  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px"
  };
  const fieldLabelStyle = "block mb-1.5 text-xs text-[#6B7280]";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Room Size" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "room-length", className: fieldLabelStyle, children: "Length (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              id: "room-length",
              name: "room-length-m",
              type: "text",
              inputMode: "decimal",
              autoComplete: "off",
              autoCorrect: "off",
              spellCheck: false,
              value: draftDims.length,
              onChange: (e) => handleDimensionChange("length", e.target.value),
              onBlur: () => handleDimensionBlur("length"),
              disabled,
              style: compactInputStyle
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "room-width", className: fieldLabelStyle, children: "Width (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              id: "room-width",
              name: "room-width-m",
              type: "text",
              inputMode: "decimal",
              autoComplete: "off",
              autoCorrect: "off",
              spellCheck: false,
              value: draftDims.width,
              onChange: (e) => handleDimensionChange("width", e.target.value),
              onBlur: () => handleDimensionBlur("width"),
              disabled,
              style: compactInputStyle
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "room-height", className: fieldLabelStyle, children: "Height (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              id: "room-height",
              name: "room-height-m",
              type: "text",
              inputMode: "decimal",
              autoComplete: "off",
              autoCorrect: "off",
              spellCheck: false,
              value: draftDims.height,
              onChange: (e) => handleDimensionChange("height", e.target.value),
              onBlur: () => handleDimensionBlur("height"),
              disabled,
              style: compactInputStyle
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Plan Overlays" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PlanDisplayToggle,
          {
            label: "Show room dimensions on plan",
            checked: !!(overlays == null ? void 0 : overlays.ROOM_DIMS),
            onChange: handleRoomDimsToggle,
            disabled
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PlanDisplayToggle,
          {
            label: "Speaker Positions",
            checked: speakerPositionsView === "plan",
            onChange: handleSpeakerPositionsToggle,
            disabled
          }
        )
      ] })
    ] }),
    roomDims.widthM > 0 && roomDims.lengthM > 0 && roomDims.heightM > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { style: { fontSize: "12px", color: "#9CA3AF", fontStyle: "italic" }, children: [
      "Room volume: ",
      (roomDims.widthM * roomDims.lengthM * roomDims.heightM).toFixed(2),
      " m³"
    ] })
  ] });
}
export {
  RoomDimensions as default
};
