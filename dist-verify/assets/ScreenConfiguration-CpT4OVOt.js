import { c as computeManualDimensions, r as resolveEffectiveVisibleWidthInches, R as React, j as jsxRuntimeExports, I as Input, D as DISPLAY_TYPE_OPTIONS, u as useAppState, a as reactExports, g as getSpeakerModelMeta, b as rp23LevelForAngleDeg, d as rp23DisplayAngleDeg, e as Select, f as SelectTrigger, h as SelectValue, i as SelectContent, k as SelectItem, S as Switch, l as DISPLAY_TYPE_PROJECTOR, m as Info, n as RP22GradingPill, C as CircleAlert, o as RoomVisualisation } from "./index-BdFovajD.js";
import { L as Label } from "./Label-Bp7A8ZDp.js";
function normaliseScreenConfig(screen = {}, dims = {}) {
  const toNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const manual = computeManualDimensions(screen == null ? void 0 : screen.manualSize);
  let inchesWidth, viewableWidthM, viewableHeightM, arStr;
  if (manual) {
    inchesWidth = manual.widthInches;
    viewableWidthM = manual.widthM;
    viewableHeightM = manual.heightM;
    arStr = manual.aspectRatio;
  } else {
    inchesWidth = toNum(resolveEffectiveVisibleWidthInches(screen), 100);
    arStr = (screen.aspectRatio || "16:9").toString();
    const [arW, arH] = arStr.includes(":") ? arStr.split(":").map((n) => toNum(n, NaN)) : [16, 9];
    const ratio = Number.isFinite(arW) && Number.isFinite(arH) && arW > 0 && arH > 0 ? arW / arH : 16 / 9;
    viewableWidthM = toNum(inchesWidth * 0.0254, 2.54);
    viewableHeightM = viewableWidthM / ratio;
  }
  const overallWidthM = viewableWidthM + 0.16;
  const overallHeightM = viewableHeightM + 0.16;
  const mountMode = screen.mountMode === "floating" ? "floating" : "baffle";
  const planeDepthM = mountMode === "floating" ? toNum(screen.floatDepthM, 0.2) : 0;
  return {
    mountMode,
    aspectRatio: arStr,
    viewableWidthM,
    viewableHeightM,
    overallWidthM,
    overallHeightM,
    planeDepthM
  };
}
const formatDisplay = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  const fixed = num.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
};
const parseValue = (raw) => {
  if (raw == null) return null;
  const str = String(raw).trim().replace(",", ".");
  if (!str || str === ".") return null;
  const num = parseFloat(str);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
};
function ManualSizeInput({
  value,
  onCommit,
  label,
  disabled = false,
  step = "0.01",
  min,
  max,
  placeholder = "0",
  style
}) {
  const [draft, setDraft] = React.useState(() => formatDisplay(value));
  React.useEffect(() => {
    setDraft(formatDisplay(value));
  }, [value]);
  const handleChange = (raw) => {
    if (!/^\d*\.?\d*$/.test(raw)) return;
    setDraft(raw);
  };
  const handleBlur = () => {
    const parsed = parseValue(draft);
    if (parsed !== null) {
      onCommit == null ? void 0 : onCommit(parsed);
    }
    setDraft(formatDisplay(value));
  };
  const handleKeyDown = (e) => {
    var _a;
    if (e.key === "Enter") {
      e.preventDefault();
      (_a = e.currentTarget) == null ? void 0 : _a.blur();
    }
  };
  const inputStyle = style || {
    border: "1px solid #DCDBD6",
    borderRadius: "8px",
    padding: "8px 10px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
    width: "100%"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    label && /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "block mb-1.5 text-xs text-[#6B7280]", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Input,
      {
        type: "text",
        inputMode: "decimal",
        autoComplete: "off",
        autoCorrect: "off",
        spellCheck: false,
        value: draft,
        onChange: (e) => handleChange(e.target.value),
        onBlur: handleBlur,
        onKeyDown: handleKeyDown,
        disabled,
        placeholder,
        style: inputStyle
      }
    )
  ] });
}
function DisplayTypeSelector({
  value,
  onChange,
  disabled = false,
  options = DISPLAY_TYPE_OPTIONS
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      role: "radiogroup",
      "aria-label": "Display type",
      className: "inline-flex w-full rounded-md border border-[#DCDBD6] bg-white overflow-hidden",
      children: options.map((option) => {
        const selected = option.value === value;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": selected,
            disabled,
            onClick: () => !disabled && (onChange == null ? void 0 : onChange(option.value)),
            className: `
              flex-1 px-3 h-10 text-sm transition-colors duration-150
              ${selected ? "bg-[#213428] text-white font-medium" : "bg-white text-[#3E4349]"}
              ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-[#F8F8F7]"}
            `,
            style: selected ? void 0 : { color: "#3E4349" },
            children: option.label
          },
          option.value
        );
      })
    }
  );
}
function ScreenConfiguration(props) {
  const {
    screen,
    onScreenChange,
    subsBehindScreen = false,
    dimensions,
    seatingPositions = [],
    dolbyConfig = "5.1",
    disabled
  } = props;
  const appState = useAppState();
  const screenFrontPlaneM = Number((appState == null ? void 0 : appState.screenFrontPlaneM) ?? 0);
  const { placedSpeakers, subwoofers } = appState || {};
  const [inputBuffer, setInputBuffer] = React.useState({});
  const [debounceTimeout, setDebounceTimeout] = React.useState(null);
  const screenData = reactExports.useMemo(() => screen || {}, [screen]);
  const manualSize = reactExports.useMemo(() => {
    return screenData.manualSize || {
      enabled: false,
      mode: "diagonal",
      diagonalInches: 100,
      aspect: "16:9",
      customAspectW: 16,
      customAspectH: 9,
      widthM: 0,
      heightM: 0
    };
  }, [screenData.manualSize]);
  const borderThicknessM = Number(screenData.borderThicknessM) || 0.08;
  const seatingRowsLive = reactExports.useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return [];
    const rowsMap = /* @__PURE__ */ new Map();
    seatingPositions.forEach((seat) => {
      const rowNumber = Number(seat == null ? void 0 : seat.rowNumber);
      const x = Number(seat == null ? void 0 : seat.x);
      const y = Number(seat == null ? void 0 : seat.y);
      const z = Number.isFinite(Number(seat == null ? void 0 : seat.z)) ? Number(seat == null ? void 0 : seat.z) : 1.2;
      if (!Number.isFinite(rowNumber) || !Number.isFinite(y)) return;
      if (!rowsMap.has(rowNumber)) {
        rowsMap.set(rowNumber, { rowNumber, seats: [] });
      }
      rowsMap.get(rowNumber).seats.push({
        ...seat,
        x: Number.isFinite(x) ? x : null,
        y,
        z
      });
    });
    return Array.from(rowsMap.values()).map((row) => {
      const sortedSeats = [...row.seats].sort((a, b) => {
        const ax = Number.isFinite(a.x) ? a.x : Number.POSITIVE_INFINITY;
        const bx = Number.isFinite(b.x) ? b.x : Number.POSITIVE_INFINITY;
        return ax - bx;
      });
      const centreSeat = sortedSeats[Math.floor(sortedSeats.length / 2)] || null;
      const rowCentreY = sortedSeats.reduce((sum, seat) => sum + seat.y, 0) / sortedSeats.length;
      const rowEarHeight = sortedSeats.reduce((sum, seat) => sum + seat.z, 0) / sortedSeats.length;
      return {
        rowNumber: row.rowNumber,
        centreSeat,
        rowCentreY,
        rowEarHeight
      };
    }).sort((a, b) => a.rowNumber - b.rowNumber);
  }, [seatingPositions]);
  const viewableDimensions = reactExports.useMemo(() => {
    if (manualSize.enabled) {
      if (manualSize.mode === "diagonal") {
        const diagonal = Number(manualSize.diagonalInches) || 100;
        let aspectW, aspectH;
        if (manualSize.aspect === "Custom") {
          aspectW = Number(manualSize.customAspectW) || 16;
          aspectH = Number(manualSize.customAspectH) || 9;
        } else {
          const parts = manualSize.aspect.split(":");
          aspectW = Number(parts[0]) || 16;
          aspectH = Number(parts[1]) || 9;
        }
        const aspectRatio = aspectW / aspectH;
        const widthInches = diagonal * (aspectW / Math.sqrt(aspectW ** 2 + aspectH ** 2));
        const heightInches = widthInches / aspectRatio;
        return {
          widthM: widthInches * 0.0254,
          heightM: heightInches * 0.0254
        };
      } else {
        return {
          widthM: Number(manualSize.widthM) || 2.54,
          heightM: Number(manualSize.heightM) || 1.43
        };
      }
    } else {
      const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.8 };
      const widthInches = screenData.tvPresetKey && TV_KEY_TO_INCHES[screenData.tvPresetKey] ? TV_KEY_TO_INCHES[screenData.tvPresetKey] : Number(screenData.visibleWidthInches) || 100;
      const aspectRatio = screenData.aspectRatio || "16:9";
      const [arW, arH] = aspectRatio.split(":").map(Number);
      const ratio = arW && arH ? arW / arH : 16 / 9;
      const widthM = widthInches * 0.0254;
      const heightM = widthM / ratio;
      return { widthM, heightM };
    }
  }, [manualSize, screenData.visibleWidthInches, screenData.aspectRatio, screenData.tvPresetKey]);
  reactExports.useMemo(() => {
    const gapWallToSpeakerM = 0.01;
    const gapSpeakerToScreenM = 0.01;
    const lcrRoles = /* @__PURE__ */ new Set(["FL", "FC", "FR", "L", "C", "R"]);
    const lcrSpeakers = (placedSpeakers || []).filter((s) => {
      const role = String(s.role || "").toUpperCase();
      return lcrRoles.has(role) && s.model;
    });
    let maxDepthM = 0;
    for (const spk of lcrSpeakers) {
      const meta = getSpeakerModelMeta(spk.model);
      const depthM = Number(meta == null ? void 0 : meta.depthM) || 0.082;
      if (depthM > maxDepthM) {
        maxDepthM = depthM;
      }
    }
    return gapWallToSpeakerM + maxDepthM + gapSpeakerToScreenM;
  }, [placedSpeakers]);
  const liveMetrics = reactExports.useMemo(() => {
    const rows = seatingRowsLive.map((row) => {
      var _a, _b;
      const sourceSeatY = Number((_a = row.centreSeat) == null ? void 0 : _a.y);
      const sourceSeatZ = Number.isFinite(Number((_b = row.centreSeat) == null ? void 0 : _b.z)) ? Number(row.centreSeat.z) : 1.2;
      const viewingDistance = Math.max(0, sourceSeatY - screenFrontPlaneM);
      if (!Number.isFinite(sourceSeatY) || viewingDistance <= 0.1) {
        return {
          ...row,
          sourceSeatY,
          sourceSeatZ,
          viewingDistance,
          rawHorizontalAngle: 0,
          rawVerticalAngle: 0,
          displayHorizontal: null,
          displayVertical: null,
          level: null,
          valid: false
        };
      }
      const rawHorizontalAngle = 2 * Math.atan(viewableDimensions.widthM / 2 / viewingDistance) * (180 / Math.PI);
      const rawVerticalAngle = 2 * Math.atan(viewableDimensions.heightM / 2 / viewingDistance) * (180 / Math.PI);
      return {
        ...row,
        sourceSeatY,
        sourceSeatZ,
        viewingDistance,
        rawHorizontalAngle,
        rawVerticalAngle,
        displayHorizontal: rp23DisplayAngleDeg(rawHorizontalAngle),
        displayVertical: Math.round(rawVerticalAngle),
        level: rp23LevelForAngleDeg(rawHorizontalAngle),
        valid: true
      };
    });
    return {
      rows,
      valid: rows.some((row) => row.valid)
    };
  }, [seatingRowsLive, screenFrontPlaneM, viewableDimensions]);
  const overallDimensions = reactExports.useMemo(() => {
    return {
      widthM: viewableDimensions.widthM + 2 * borderThicknessM,
      heightM: viewableDimensions.heightM + 2 * borderThicknessM
    };
  }, [viewableDimensions, borderThicknessM]);
  reactExports.useEffect(() => {
    if (typeof window !== "undefined" && liveMetrics.valid) {
      const firstValidRow = liveMetrics.rows.find((row) => row.valid) || null;
      const event = new CustomEvent("b44:screen:metrics", {
        detail: {
          hdeg: (firstValidRow == null ? void 0 : firstValidRow.displayHorizontal) ?? 0,
          vdeg: (firstValidRow == null ? void 0 : firstValidRow.displayVertical) ?? 0,
          viewableW_m: viewableDimensions.widthM,
          viewableH_m: viewableDimensions.heightM,
          overallW_m: overallDimensions.widthM,
          overallH_m: overallDimensions.heightM,
          distanceToMLP_m: (firstValidRow == null ? void 0 : firstValidRow.viewingDistance) ?? 0
        }
      });
      window.dispatchEvent(event);
    }
  }, [liveMetrics, viewableDimensions, overallDimensions]);
  const handleUpdate = reactExports.useCallback((updates) => {
    if (onScreenChange && typeof onScreenChange === "function") {
      onScreenChange({ ...screenData, ...updates });
    }
  }, [onScreenChange, screenData]);
  const handleDebouncedInput = reactExports.useCallback((field, value) => {
    setInputBuffer((prev) => ({ ...prev, [field]: value }));
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    const timeout = setTimeout(() => {
      setInputBuffer((prev) => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
      if (field.startsWith("manual.")) {
        const subField = field.replace("manual.", "");
        handleUpdate({
          manualSize: { ...manualSize, [subField]: value }
        });
      } else {
        handleUpdate({ [field]: value });
      }
    }, 150);
    setDebounceTimeout(timeout);
  }, [debounceTimeout, manualSize, handleUpdate]);
  reactExports.useEffect(() => {
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [debounceTimeout]);
  const heightFromFloorM = Number.isFinite(screenData.heightFromFloorM) ? Number(screenData.heightFromFloorM) : 0.5;
  reactExports.useMemo(() => {
    return normaliseScreenConfig(screenData);
  }, [screenData]);
  const toCm = (m) => Math.round(m * 100);
  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px"
  };
  const fieldLabelStyle = "block mb-1.5 text-xs text-[#6B7280]";
  const compactInputStyle = {
    border: "1px solid #DCDBD6",
    borderRadius: "8px",
    padding: "8px 10px",
    background: disabled ? "#F3F3F3" : "#FFF",
    color: "#1B1A1A",
    fontSize: "14px",
    width: "100%"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-5 font-sans", style: { fontFamily: "Didact Gothic, Century Gothic, sans-serif" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Screen Setup" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Viewing Width (inches)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: (() => {
                  const TV_KEY_TO_VAL = { tv65: "55.55", tv77: "67.36", tv83: "72.52", tv100: "87.80" };
                  if (screenData.tvPresetKey && TV_KEY_TO_VAL[screenData.tvPresetKey]) return TV_KEY_TO_VAL[screenData.tvPresetKey];
                  return Number.isInteger(Number(screenData.visibleWidthInches ?? 100)) ? String(Number(screenData.visibleWidthInches ?? 100)) : Number(screenData.visibleWidthInches ?? 100).toFixed(2);
                })(),
                onValueChange: (val) => {
                  const TV_PRESET_MAP = {
                    "tv65": { label: 'TV 65"', widthMm: 1411 },
                    "tv77": { label: 'TV 77"', widthMm: 1711 },
                    "tv83": { label: 'TV 83"', widthMm: 1872 },
                    "tv100": { label: 'TV 100"', widthMm: 2230 }
                  };
                  const VAL_TO_KEY = {
                    "55.55": "tv65",
                    "67.36": "tv77",
                    "72.52": "tv83",
                    "87.80": "tv100"
                  };
                  const presetKey = VAL_TO_KEY[val];
                  if (presetKey && TV_PRESET_MAP[presetKey]) {
                    handleUpdate({
                      visibleWidthInches: Number(val),
                      aspectRatio: "16:9",
                      borderThicknessM: 5e-3,
                      tvPresetKey: presetKey,
                      tvWidthMm: TV_PRESET_MAP[presetKey].widthMm
                    });
                    return;
                  }
                  handleUpdate({
                    visibleWidthInches: Number(val),
                    borderThicknessM: 0.08,
                    tvPresetKey: null,
                    tvWidthMm: null
                  });
                },
                disabled: disabled || manualSize.enabled,
                modal: false,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "bg-white border-[#DCDBD6] text-[#1B1A1A] h-10 hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { children: (() => {
                    if (manualSize.enabled) return "MANUAL";
                    const TV_KEY_TO_LABEL = { tv65: 'TV 65"', tv77: 'TV 77"', tv83: 'TV 83"', tv100: 'TV 100"' };
                    if (screenData.tvPresetKey && TV_KEY_TO_LABEL[screenData.tvPresetKey]) return TV_KEY_TO_LABEL[screenData.tvPresetKey];
                    const valStr = Number(screenData.visibleWidthInches ?? 100).toFixed(2);
                    return { "55.55": 'TV 65"', "67.36": 'TV 77"', "72.52": 'TV 83"', "87.80": 'TV 100"' }[valStr] ?? `${String(screenData.visibleWidthInches ?? 100)}"`;
                  })() }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    SelectContent,
                    {
                      position: "popper",
                      sideOffset: 6,
                      className: "z-[70] bg-white border-[#DCDBD6]",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "55.55", className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: 'TV 65"' }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "67.36", className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: 'TV 77"' }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "72.52", className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: 'TV 83"' }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "87.80", className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: 'TV 100"' }),
                        [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250].map((width) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          SelectItem,
                          {
                            value: String(width),
                            className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]",
                            children: [
                              width,
                              '"'
                            ]
                          },
                          width
                        ))
                      ]
                    }
                  )
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Aspect Ratio" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: screenData.aspectRatio || "16:9",
                onValueChange: (val) => handleUpdate({ aspectRatio: val }),
                disabled: disabled || manualSize.enabled,
                modal: false,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "bg-white border-[#DCDBD6] text-[#1B1A1A] h-10 hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    SelectContent,
                    {
                      position: "popper",
                      sideOffset: 6,
                      className: "z-[70] bg-white border-[#DCDBD6]",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "16:9", className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "16:9 (1.78)" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "2.35:1", className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "2.35:1 (Scope)" })
                      ]
                    }
                  )
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Screen Height from Floor (cm)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                step: "1",
                min: "0",
                max: "300",
                value: inputBuffer["heightFromFloorM"] !== void 0 ? Math.round(inputBuffer["heightFromFloorM"] * 100) : Math.round(heightFromFloorM * 100),
                onChange: (e) => {
                  const cm = Number(e.target.value);
                  handleDebouncedInput("heightFromFloorM", cm / 100);
                },
                onBlur: () => {
                  if (debounceTimeout) {
                    clearTimeout(debounceTimeout);
                    setDebounceTimeout(null);
                  }
                  const buffered = inputBuffer["heightFromFloorM"];
                  if (buffered !== void 0) {
                    handleUpdate({ heightFromFloorM: buffered });
                    setInputBuffer((prev) => {
                      const { heightFromFloorM: _, ...rest } = prev;
                      return rest;
                    });
                  }
                },
                disabled,
                style: compactInputStyle
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Border Thickness (cm)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                step: "0.5",
                min: "0",
                max: "50",
                value: inputBuffer["borderThicknessM"] !== void 0 ? Number((inputBuffer["borderThicknessM"] * 100).toFixed(1)) : Number((borderThicknessM * 100).toFixed(1)),
                onChange: (e) => {
                  const cm = parseFloat(e.target.value || "0");
                  handleDebouncedInput("borderThicknessM", cm / 100);
                },
                onBlur: () => {
                  if (debounceTimeout) {
                    clearTimeout(debounceTimeout);
                    setDebounceTimeout(null);
                  }
                  const buffered = inputBuffer["borderThicknessM"];
                  if (buffered !== void 0) {
                    handleUpdate({ borderThicknessM: buffered });
                    setInputBuffer((prev) => {
                      const { borderThicknessM: _, ...rest } = prev;
                      return rest;
                    });
                  }
                },
                disabled,
                style: compactInputStyle
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Manual Override" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-[#3E4349]", children: "Manual Screen Size Override" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: manualSize.enabled,
              onCheckedChange: (enabled) => handleUpdate({
                manualSize: { ...manualSize, enabled }
              }),
              disabled
            }
          )
        ] }),
        manualSize.enabled && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Display Type" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              DisplayTypeSelector,
              {
                value: manualSize.displayType || DISPLAY_TYPE_PROJECTOR,
                onChange: (displayType) => handleUpdate({
                  manualSize: { ...manualSize, displayType }
                }),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Mode" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: manualSize.mode,
                onValueChange: (mode) => handleUpdate({
                  manualSize: { ...manualSize, mode }
                }),
                disabled,
                modal: false,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "bg-white border-[#DCDBD6] text-[#1B1A1A] h-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { position: "popper", sideOffset: 6, className: "z-[70] bg-white border-[#DCDBD6]", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "diagonal", children: "Diagonal + Aspect" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "wh", children: "Width × Height" })
                  ] })
                ]
              }
            )
          ] }),
          manualSize.mode === "diagonal" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Diagonal (inches)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ManualSizeInput,
                {
                  value: manualSize.diagonalInches,
                  onCommit: (v) => handleUpdate({ manualSize: { ...manualSize, diagonalInches: v ?? 0 } }),
                  disabled,
                  step: "1",
                  min: 20,
                  max: 500,
                  placeholder: "0"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Aspect Ratio" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                Select,
                {
                  value: manualSize.aspect,
                  onValueChange: (aspect) => handleUpdate({
                    manualSize: { ...manualSize, aspect }
                  }),
                  disabled,
                  modal: false,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "bg-white border-[#DCDBD6] text-[#1B1A1A] h-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { position: "popper", sideOffset: 6, className: "z-[70] bg-white border-[#DCDBD6]", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "16:9", children: "16:9" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "17:9", children: "17:9" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "2.35:1", children: "2.35:1" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "2.40:1", children: "2.40:1" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "Custom", children: "Custom" })
                    ] })
                  ]
                }
              )
            ] }),
            manualSize.aspect === "Custom" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ManualSizeInput,
                {
                  value: manualSize.customAspectW,
                  onCommit: (v) => handleUpdate({ manualSize: { ...manualSize, customAspectW: v ?? 16 } }),
                  disabled,
                  step: "0.1",
                  min: 1,
                  placeholder: "W"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ManualSizeInput,
                {
                  value: manualSize.customAspectH,
                  onCommit: (v) => handleUpdate({ manualSize: { ...manualSize, customAspectH: v ?? 9 } }),
                  disabled,
                  step: "0.1",
                  min: 1,
                  placeholder: "H"
                }
              )
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Width (m)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ManualSizeInput,
                {
                  value: manualSize.widthM,
                  onCommit: (v) => handleUpdate({ manualSize: { ...manualSize, widthM: v ?? 0 } }),
                  disabled,
                  step: "0.01",
                  min: 0.5,
                  max: 20,
                  placeholder: "0"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Height (m)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ManualSizeInput,
                {
                  value: manualSize.heightM,
                  onCommit: (v) => handleUpdate({ manualSize: { ...manualSize, heightM: v ?? 0 } }),
                  disabled,
                  step: "0.01",
                  min: 0.3,
                  max: 15,
                  placeholder: "0"
                }
              )
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Screen Wall" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-[#3E4349]", children: "Screen Wall" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-[#9CA3AF] mt-0.5 leading-snug", children: "Shows a fabric-covered false wall across the room at the rear of the screen, leaving the equipment cavity behind it. Visual only — the structural front wall remains the acoustic boundary." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: !!screenData.showScreenWall,
              onCheckedChange: (showScreenWall) => handleUpdate({ showScreenWall }),
              disabled
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border border-[#E5E5E5] rounded-lg bg-[#FAF9F6]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Live Metrics" }),
        !liveMetrics.valid ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-amber-600 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "w-4 h-4" }),
          "Move seating away from screen to compute angles"
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
            liveMetrics.rows.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-[#ECEAE4] bg-white p-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#625143] text-xs font-medium mb-2", children: [
                "Row ",
                row.rowNumber
              ] }),
              row.valid ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Horizontal" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#1B1A1A] text-sm font-medium", children: [
                    row.displayHorizontal,
                    "°"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Vertical" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#1B1A1A] text-sm font-medium", children: [
                    row.displayVertical,
                    "°"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Distance" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#1B1A1A] text-sm font-medium", children: [
                    row.viewingDistance.toFixed(2),
                    " m"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "RP23" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    RP22GradingPill,
                    {
                      level: row.level || (Number.isFinite(row.displayHorizontal) ? "FAIL" : "N/A")
                    }
                  )
                ] })
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-amber-600 text-xs", children: "Move this row away from screen to compute angles" })
            ] }, row.rowNumber)),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Viewable area" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#1B1A1A] text-sm font-medium", children: [
                  toCm(viewableDimensions.widthM),
                  " × ",
                  toCm(viewableDimensions.heightM),
                  " cm"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Overall with border" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#1B1A1A] text-sm font-medium", children: [
                  toCm(overallDimensions.widthM),
                  " × ",
                  toCm(overallDimensions.heightM),
                  " cm"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Distance from front wall to screen" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[#1B1A1A] text-sm font-medium", children: [
                  Math.round(((screen == null ? void 0 : screen.screenPlaneY_m) ?? 0) * 100),
                  " cm"
                ] })
              ] })
            ] })
          ] }),
          (() => {
            const roomWidth = (dimensions == null ? void 0 : dimensions.width_m) || (dimensions == null ? void 0 : dimensions.width) || 0;
            const roomHeight = (dimensions == null ? void 0 : dimensions.height_m) || (dimensions == null ? void 0 : dimensions.height) || 0;
            const screenWidth = overallDimensions.widthM;
            const screenHeight = overallDimensions.heightM;
            const totalHeight = screenHeight + heightFromFloorM;
            const widthClearance = roomWidth - screenWidth;
            const heightClearance = roomHeight - totalHeight;
            const widthWarning = widthClearance < 0;
            const widthCaution = !widthWarning && widthClearance < 0.4;
            const heightWarning = heightClearance < 0;
            const heightCaution = !heightWarning && heightClearance < 0.2;
            const hasAnyAlert = widthWarning || widthCaution || heightWarning || heightCaution;
            if (!hasAnyAlert) return null;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 mt-3 pt-3 border-t border-[#ECEAE4]", children: [
              widthWarning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-red-800", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Warning:" }),
                  " Screen width (",
                  toCm(screenWidth),
                  "cm) exceeds room width (",
                  toCm(roomWidth),
                  "cm)"
                ] })
              ] }),
              widthCaution && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-amber-800", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Caution:" }),
                  " Screen width is within ",
                  toCm(widthClearance),
                  "cm of room width. Consider 40cm+ clearance."
                ] })
              ] }),
              heightWarning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-red-800", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Warning:" }),
                  " Screen height + floor height (",
                  toCm(totalHeight),
                  "cm) exceeds room height (",
                  toCm(roomHeight),
                  "cm)"
                ] })
              ] }),
              heightCaution && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-amber-800", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Caution:" }),
                  " Screen top is within ",
                  toCm(heightClearance),
                  "cm of ceiling. Consider 20cm+ clearance."
                ] })
              ] })
            ] });
          })()
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "none" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      RoomVisualisation,
      {
        placedSpeakers,
        subwoofers,
        screen,
        dimensions,
        seatingPositions,
        aimAtMLP: true
      }
    ) })
  ] });
}
export {
  ScreenConfiguration as default
};
