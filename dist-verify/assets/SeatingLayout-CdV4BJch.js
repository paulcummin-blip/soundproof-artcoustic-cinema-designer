import { p as createLucideIcon, u as useAppState, a as reactExports, r as resolveEffectiveVisibleWidthInches, q as calculateViewingAngle, s as assignRP23Level, t as subscribeSeatDragLive, v as getSeatDragLive, w as buildPerRowViewingData, j as jsxRuntimeExports, n as RP22GradingPill, x as resolveSeatPriority, y as toggleSeatPriority, R as React, z as clampViewingOffset, B as Button, I as Input, S as Switch, L as Label, A as RotateCcw, E as cancelMlpGrab } from "./index-BdFovajD.js";
import "./slider-DiAa5F_q.js";
/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode = [
  ["path", { d: "M12 2v20", key: "t6zp3m" }],
  ["path", { d: "m15 19-3 3-3-3", key: "11eu04" }],
  ["path", { d: "m19 9 3 3-3 3", key: "1mg7y2" }],
  ["path", { d: "M2 12h20", key: "9i4pu4" }],
  ["path", { d: "m5 9-3 3 3 3", key: "j64kie" }],
  ["path", { d: "m9 5 3-3 3 3", key: "l8vdw6" }]
];
const Move = createLucideIcon("Move", __iconNode);
function ViewingAnglePanel({
  screen,
  seatingPositions,
  viewingDistanceOffsetM,
  mlpOverride,
  mlpDotOffsetM,
  showMlpRuler = false,
  onShowMlpRulerChange
}) {
  const { mlpY_m, screenFrontPlaneM: appScreenFrontPlaneM } = useAppState() || {};
  const screenFrontPlaneM = Number.isFinite(Number(appScreenFrontPlaneM)) ? Number(appScreenFrontPlaneM) : Number.isFinite(Number(screen == null ? void 0 : screen.screenPlaneY_m)) ? Number(screen.screenPlaneY_m) : Number((screen == null ? void 0 : screen.floatDepthM) ?? 0);
  const rp23Data = reactExports.useMemo(() => {
    const effectiveViewerY = mlpOverride && Number.isFinite(Number(mlpOverride.y)) ? Number(mlpOverride.y) : Number.isFinite(mlpY_m) ? mlpY_m : null;
    if (effectiveViewerY === null || !Number.isFinite(screenFrontPlaneM)) {
      return null;
    }
    const visibleWidthInches = resolveEffectiveVisibleWidthInches(screen);
    const aspectRatio = (screen == null ? void 0 : screen.aspectRatio) || "16:9";
    const computedAngle = calculateViewingAngle(
      { y: effectiveViewerY },
      // true RSP viewer position
      visibleWidthInches,
      aspectRatio,
      { y: screenFrontPlaneM }
    );
    if (computedAngle == null) return null;
    const viewerDistance = Math.abs(effectiveViewerY - screenFrontPlaneM);
    const rp23Level = assignRP23Level(computedAngle);
    if (typeof window !== "undefined" && window.__DIAG__RP23) {
      const widthM = visibleWidthInches * 0.0254;
      const d = Math.max(viewerDistance, 1e-6);
      console.log(
        "[RP23-angle] widthM=%o mlpY=%o planeFrontY=%o d=%o angle=%o",
        widthM,
        mlpY_m,
        screenFrontPlaneM,
        d,
        2 * Math.atan(widthM / (2 * d)) * 180 / Math.PI
      );
    }
    return {
      angle: computedAngle,
      distance: viewerDistance,
      level: rp23Level.level,
      label: rp23Level.label,
      color: rp23Level.color
    };
  }, [mlpOverride, mlpY_m, screenFrontPlaneM, screen == null ? void 0 : screen.visibleWidthInches, screen == null ? void 0 : screen.aspectRatio, screen == null ? void 0 : screen.tvPresetKey, screen == null ? void 0 : screen.tvWidthMm, screen == null ? void 0 : screen.manualSize]);
  const liveDrag = reactExports.useSyncExternalStore(subscribeSeatDragLive, getSeatDragLive);
  const liveSeats = (liveDrag == null ? void 0 : liveDrag.active) && Array.isArray(liveDrag == null ? void 0 : liveDrag.seats) ? liveDrag.seats : null;
  const effectiveSeatingPositions = liveSeats || seatingPositions;
  const perRowData = reactExports.useMemo(
    () => buildPerRowViewingData({
      seatingPositions: effectiveSeatingPositions,
      screen,
      screenFrontPlaneM
    }),
    [effectiveSeatingPositions, screen, screenFrontPlaneM]
  );
  if (!rp23Data) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 rounded-lg border border-gray-200 bg-gray-50", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Calculating viewing angle..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: perRowData.length >= 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { border: "1px solid #C1B6AD", borderRadius: 8, overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "grid", gridTemplateColumns: "44px 1fr 1fr 70px", gap: 0, backgroundColor: "#EDECEA", padding: "5px 10px" }, children: ["Row", "Viewing Angle", "Distance to Screen", "RP23"].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 10, fontWeight: 600, color: "#625143", textAlign: h === "RP23" ? "center" : "left" }, children: h }, h)) }),
    perRowData.map((row, idx) => {
      const isEven = idx % 2 === 1;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "44px 1fr 1fr 70px",
            gap: 0,
            padding: "8px 10px",
            backgroundColor: isEven ? "#F8F8F7" : "#FFFFFF",
            borderTop: "1px solid #E6E4DD",
            alignItems: "center"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontSize: 13, color: "#625143", fontWeight: 600 }, children: [
              "R",
              row.rowNumber
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 20, fontWeight: 700, color: "#1B1A1A", letterSpacing: "-0.5px" }, children: row.viewingAngleDeg != null ? `${row.viewingAngleDeg.toFixed(1)}°` : "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 20, fontWeight: 700, color: "#1B1A1A", letterSpacing: "-0.5px" }, children: `${row.viewingDistanceM.toFixed(2)} m` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(RP22GradingPill, { level: row.rp23Level || "FAIL" }) })
          ]
        },
        row.rowNumber
      );
    })
  ] }) });
}
function normaliseSeatCount(rawCount) {
  const parsed = Number.parseInt(rawCount, 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}
function stepSeatCount(currentCount, direction) {
  const delta = direction < 0 ? -1 : direction > 0 ? 1 : 0;
  return Math.max(1, normaliseSeatCount(currentCount) + delta);
}
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";
function compactSeatLabel(seat, indexInRow) {
  const col = Number.isFinite(indexInRow) ? indexInRow + 1 : 1;
  return `S${col}`;
}
function SeatPrioritySelector({
  seatingPositions = [],
  onSetSeatingPositions,
  disabled = false,
  designatedRspSeatId = null,
  onSetDesignatedRspSeatId = null,
  rspMode = "auto_from_screen",
  onRspModeChange = null
}) {
  const rows = reactExports.useMemo(() => {
    const list = Array.isArray(seatingPositions) ? seatingPositions : [];
    const byRow = /* @__PURE__ */ new Map();
    for (const seat of list) {
      const key = Number(seat == null ? void 0 : seat.rowNumber) || 1;
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(seat);
    }
    const sortedRows = Array.from(byRow.keys()).sort((a, b) => a - b);
    return sortedRows.map((rowNum) => {
      const rowSeats = byRow.get(rowNum).slice().sort((a, b) => (Number(a == null ? void 0 : a.x) || 0) - (Number(b == null ? void 0 : b.x) || 0));
      return { rowNum, seats: rowSeats };
    });
  }, [seatingPositions]);
  const handleToggle = (seatId) => {
    if (disabled || typeof onSetSeatingPositions !== "function") return;
    const next = toggleSeatPriority(seatingPositions, seatId);
    if (next !== seatingPositions) {
      onSetSeatingPositions(next);
    }
  };
  const handleDesignateRsp = (seatId) => {
    if (disabled) return;
    if (!onSetDesignatedRspSeatId || !onRspModeChange) return;
    if (designatedRspSeatId === seatId && rspMode === "seat_bound") {
      onSetDesignatedRspSeatId(null);
      onRspModeChange("auto_from_screen");
    } else {
      onSetDesignatedRspSeatId(seatId);
      onRspModeChange("seat_bound");
    }
  };
  if (!rows.length) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", "data-seat-priority-selector": true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: "text-lg font-bold",
          style: { color: "#1B1A1A", fontFamily: BODY_FONT, letterSpacing: "0.01em" },
          children: "Seat Priority"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-xs", style: { color: "#3E4349", fontFamily: BODY_FONT }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              style: {
                display: "inline-block",
                width: 16,
                height: 16,
                borderRadius: 4,
                background: "#1B1A1A",
                border: "1px solid #1B1A1A"
              }
            }
          ),
          "Primary"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              style: {
                display: "inline-block",
                width: 16,
                height: 16,
                borderRadius: 4,
                background: "#EDECE8",
                border: "1px solid #C1B6AD"
              }
            }
          ),
          "Secondary"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm leading-snug", style: { color: "#3E4349", fontFamily: BODY_FONT }, children: [
      "Tap any seat to toggle Primary / Secondary. Secondary seats stay fully included in every calculation.",
      onSetDesignatedRspSeatId && onRspModeChange && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { display: "block", marginTop: 4 }, children: [
        "Tap the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#22c55e", border: "1.5px solid #fff", boxShadow: "0 0 3px rgba(34,197,94,0.5)", verticalAlign: "middle" } }),
        " green dot to bind the RSP to that seat (P20 = 0 for the bound seat)."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3 p-5 rounded-xl", style: { border: "1.5px solid #C1B6AD", background: "#F8F8F7" }, children: rows.map(({ rowNum, seats }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "text-sm shrink-0 font-medium",
          style: { color: "#3E4349", fontFamily: BODY_FONT, width: 64 },
          children: [
            "Row ",
            rowNum
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2.5", children: seats.map((seat, idxInRow) => {
        const isSecondary = resolveSeatPriority(seat) === "secondary";
        const label = compactSeatLabel(seat, idxInRow);
        const isDesignatedRsp = designatedRspSeatId === (seat == null ? void 0 : seat.id) && rspMode === "seat_bound";
        const baseStyle = {
          width: 54,
          height: 46,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: BODY_FONT,
          cursor: disabled ? "default" : "pointer",
          transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
          userSelect: "none",
          position: "relative"
        };
        let style;
        if (isSecondary) {
          style = {
            ...baseStyle,
            background: "#EDECE8",
            color: "#625143",
            border: "1px solid #C1B6AD",
            opacity: 0.85
          };
        } else {
          style = {
            ...baseStyle,
            background: "#1B1A1A",
            color: "#FFFFFF",
            border: "1px solid #1B1A1A"
          };
        }
        if (isDesignatedRsp) {
          style = {
            ...style,
            border: "2px solid #22c55e",
            boxShadow: "0 0 0 1px #22c55e"
          };
        }
        const tooltip = isSecondary ? `Secondary seat (${label}) — click to make Primary` : `Primary seat (${label}) — click to make Secondary`;
        const rspTooltip = isDesignatedRsp ? `RSP bound to ${label} — click green dot to unbind` : `Designate ${label} as RSP (seat-bound)`;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center", style: { position: "relative" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              title: tooltip,
              "aria-label": tooltip,
              disabled,
              style,
              onClick: () => handleToggle(seat == null ? void 0 : seat.id),
              onMouseEnter: (e) => {
                if (disabled) return;
                e.currentTarget.style.borderColor = "#213428";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.borderColor = isDesignatedRsp ? "#22c55e" : isSecondary ? "#C1B6AD" : "#1B1A1A";
              },
              children: label
            }
          ),
          onSetDesignatedRspSeatId && onRspModeChange && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              title: rspTooltip,
              "aria-label": rspTooltip,
              disabled,
              onClick: (e) => {
                e.stopPropagation();
                handleDesignateRsp(seat == null ? void 0 : seat.id);
              },
              style: {
                position: "absolute",
                top: -6,
                right: -6,
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid #ffffff",
                background: isDesignatedRsp ? "#22c55e" : "#ffffff",
                cursor: disabled ? "default" : "pointer",
                padding: 0,
                lineHeight: 0,
                boxShadow: isDesignatedRsp ? "0 0 5px rgba(34,197,94,0.6)" : "0 1px 2px rgba(0,0,0,0.15)",
                transition: "background-color 120ms ease, box-shadow 120ms ease"
              },
              onMouseEnter: (e) => {
                if (disabled) return;
                if (!isDesignatedRsp) e.currentTarget.style.background = "#86efac";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.background = isDesignatedRsp ? "#22c55e" : "#ffffff";
              }
            }
          )
        ] }, (seat == null ? void 0 : seat.id) || label);
      }) }) })
    ] }, `row-${rowNum}`)) })
  ] });
}
const RAD = Math.PI / 180;
function getVisibleScreenWidthM(screen) {
  return Number((screen == null ? void 0 : screen.visibleWidthInches) || 100) * 0.0254;
}
function targetDistanceFromPlaneM(visibleWidthM, targetDeg) {
  const half = visibleWidthM / 2;
  return half / Math.tan(targetDeg * RAD / 2);
}
function targetMlpY57_5(screen, roomFrontY = 0) {
  const visibleW_m = getVisibleScreenWidthM(screen);
  const targetDist_m = targetDistanceFromPlaneM(visibleW_m, 57.5);
  return roomFrontY + targetDist_m;
}
const getEarHeightForRow = (rowNumber) => {
  switch (rowNumber) {
    case 1:
      return 1.2;
    case 2:
      return 1.5;
    case 3:
      return 1.8;
    default:
      return 1.2 + (rowNumber - 1) * 0.3;
  }
};
const normaliseRowSpacing = (raw) => {
  if (raw === "" || raw == null) return "";
  let n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return "";
  const min = 0.8;
  const max = 4;
  n = Math.max(min, Math.min(max, n));
  return Number(n.toFixed(2));
};
function SeatingLayout({
  seatingPositions = [],
  onGenerateSeating,
  // NEW: per-row seat counts (array). If not provided, we'll fall back to seatsPerRow + seatingRows.
  seatsPerRowByRow,
  onSeatsPerRowByRowChange,
  // Keep old fields for now (fallbacks)
  seatsPerRow = 3,
  onSeatsPerRowChange,
  seatingRows = 1,
  onSeatingRowsChange,
  seatSpacing = 0.6,
  onSeatSpacingChange,
  rowSpacingM = 1.8,
  onRowSpacingChange,
  rowCentersM = [],
  seatingBlockOffset = 0,
  onSeatingBlockOffsetChange,
  mlpBasis = "front",
  onMlpBasisChange,
  onSetSeatingPositions,
  disabled = false,
  screen,
  dimensions,
  showMlpRuler = false,
  onShowMlpRulerChange,
  rowEarHeights = [],
  onRowEarHeightsChange,
  // Link ear & platform heights
  linkEarPlatformHeights = true,
  onLinkEarPlatformHeightsChange,
  // RSP mode
  rspMode = "auto_from_screen",
  onRspModeChange,
  manualRspX_m = null,
  onManualRspX_mChange,
  manualRspY_m = null,
  onManualRspY_mChange,
  // Designated RSP seat (seat_bound mode)
  designatedRspSeatId = null,
  onSetDesignatedRspSeatId
}) {
  const rowsArray = React.useMemo(() => {
    if (Array.isArray(seatsPerRowByRow) && seatsPerRowByRow.length) {
      return seatsPerRowByRow.map(
        (n) => Math.max(1, parseInt(n || 1, 10))
      );
    }
    const rows = Math.max(1, parseInt(seatingRows || 1, 10));
    const seats = Math.max(1, parseInt(seatsPerRow || 1, 10));
    return Array.from({ length: rows }, () => seats);
  }, [seatsPerRowByRow, seatsPerRow, seatingRows]);
  const rowCount = rowsArray.length;
  const commitSeatCount = reactExports.useCallback((rowIndex, rawCount) => {
    if (disabled) return;
    const next = [...rowsArray];
    next[rowIndex] = normaliseSeatCount(rawCount);
    onGenerateSeating == null ? void 0 : onGenerateSeating({
      seatsPerRowByRow: next,
      numberOfRows: next.length,
      seatSpacing,
      rowSpacingM
    });
  }, [disabled, rowsArray, onGenerateSeating, seatSpacing, rowSpacingM]);
  const totalSeats = seatingPositions.length;
  reactExports.useMemo(() => seatingPositions.find((s) => s.isPrimary) || seatingPositions[0], [seatingPositions]);
  const seatPriorityCounts = reactExports.useMemo(() => {
    const list = Array.isArray(seatingPositions) ? seatingPositions : [];
    let primary = 0;
    let secondary = 0;
    for (const s of list) {
      if (resolveSeatPriority(s) === "secondary") secondary++;
      else primary++;
    }
    return { primary, secondary };
  }, [seatingPositions]);
  const mlpOverride = reactExports.useMemo(() => {
    const list = seatingPositions == null ? void 0 : seatingPositions.filter((s) => s.isPrimary);
    const seats = (list && list.length ? list : seatingPositions) || [];
    if (!seats.length) return null;
    const sum = seats.reduce(
      (a, s) => ({
        x: a.x + (Number(s.x) || 0),
        y: a.y + (Number(s.y) || 0),
        z: a.z + (Number(s.z) || 1.2)
        // Default ear height to 1.2m
      }),
      { x: 0, y: 0, z: 0 }
    );
    const n = seats.length;
    return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
  }, [seatingPositions]);
  const mlpOptions = reactExports.useMemo(() => {
    const options = [
      { value: "front", label: "Front Row Center" },
      { value: "back", label: "Back Row Center" },
      { value: "all", label: "All Rows (Average)" }
    ];
    if (rowCount >= 3) {
      options.splice(1, 0, { value: "middle", label: "Middle Row Center" });
    }
    return options;
  }, [rowCount]);
  const { screenFrontPlaneM: appScreenFrontPlaneM } = useAppState() || {};
  const screenFrontPlaneM = Number.isFinite(Number(appScreenFrontPlaneM)) ? Number(appScreenFrontPlaneM) : Number((screen == null ? void 0 : screen.floatDepthM) ?? 0);
  reactExports.useMemo(() => {
    if (!mlpOverride || !Number.isFinite(mlpOverride.y) || !screen) return seatingBlockOffset;
    const idealY = targetMlpY57_5(screen, screenFrontPlaneM);
    return Math.round((mlpOverride.y - idealY) * 100) / 100;
  }, [mlpOverride, screen, seatingBlockOffset, screenFrontPlaneM]);
  const validMlpBasis = reactExports.useMemo(() => {
    const validValues = mlpOptions.map((opt) => opt.value);
    return validValues.includes(mlpBasis) ? mlpBasis : "front";
  }, [mlpBasis, mlpOptions]);
  const liveCenters = reactExports.useMemo(() => {
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
      const byRow = {};
      for (const seat of seatingPositions) {
        const rn = seat.rowNumber ?? 1;
        if (!byRow[rn]) byRow[rn] = [];
        byRow[rn].push(Number(seat.y) || 0);
      }
      const sorted = Object.keys(byRow).map(Number).sort((a, b) => a - b);
      return sorted.map((rn) => {
        const ys = byRow[rn];
        return Math.round(ys.reduce((s, v) => s + v, 0) / ys.length * 100) / 100;
      });
    }
    return null;
  }, [seatingPositions]);
  const effectiveRspY = reactExports.useMemo(() => {
    if (rspMode === "manual_position" && Number.isFinite(manualRspY_m)) {
      return manualRspY_m;
    }
    return targetMlpY57_5(screen, screenFrontPlaneM);
  }, [rspMode, manualRspY_m, screen, screenFrontPlaneM]);
  const handleMoveSeatsToRsp = reactExports.useCallback(() => {
    if (rowCount !== 1) return;
    const centers = liveCenters ?? [];
    const frontRowY = centers[0];
    if (!Number.isFinite(frontRowY)) return;
    const offset = Number.isFinite(seatingBlockOffset) ? seatingBlockOffset : 0;
    const frontRowYAtZeroOffset = frontRowY - offset;
    const newOffset = effectiveRspY - frontRowYAtZeroOffset;
    onSeatingBlockOffsetChange == null ? void 0 : onSeatingBlockOffsetChange(clampViewingOffset(Math.round(newOffset * 100) / 100));
  }, [rowCount, liveCenters, seatingBlockOffset, effectiveRspY, onSeatingBlockOffsetChange]);
  reactExports.useEffect(() => {
    if (validMlpBasis !== mlpBasis && onMlpBasisChange) {
      onMlpBasisChange(validMlpBasis);
    }
  }, [validMlpBasis, mlpBasis, onMlpBasisChange]);
  reactExports.useCallback((value) => {
    onMlpBasisChange == null ? void 0 : onMlpBasisChange(value);
  }, [onMlpBasisChange]);
  reactExports.useCallback(() => {
    if (onGenerateSeating) {
      onGenerateSeating({
        seatsPerRow,
        numberOfRows: seatingRows,
        seatSpacing,
        rowSpacingM
        // NEW: Include rowSpacingM in reset
      });
    }
  }, [onGenerateSeating, seatsPerRow, seatingRows, seatSpacing, rowSpacingM]);
  const safeRowSpacingValue = typeof rowSpacingM === "number" && Number.isFinite(rowSpacingM) ? rowSpacingM : 1.8;
  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px"
  };
  const fieldLabelStyle = "block mb-1.5 text-xs text-[#6B7280]";
  const stepperBtnStyle = {
    border: "1px solid #C1B6AD",
    backgroundColor: "#ffffff",
    color: "#1B1A1A"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-5 seating-layout-sliders", "data-rp22": "seating", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
      .seating-layout-sliders .slider-track {
        position: relative;
        height: 6px;
        width: 100%;
        flex-grow: 1;
        overflow: hidden;
        border-radius: 9999px;
        background-color: #DCDBD6;
      }
      .seating-layout-sliders .slider-range {
        position: absolute;
        height: 100%;
        background-color: #213428;
      }
      .seating-layout-sliders .slider-thumb {
        display: block;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: #1B1A1A;
        border: 2px solid #FFFFFF;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .seating-layout-sliders .slider-thumb:focus-visible {
        outline: 2px solid #213428;
        outline-offset: 2px;
      }
    ` }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Seating Summary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-3 border border-[#E5E5E5] rounded-lg bg-[#FAF9F6]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Rows" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#1B1A1A] text-sm font-semibold", children: rowCount })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Total Seats" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#1B1A1A] text-sm font-semibold", children: totalSeats })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#1B1A1A] text-sm font-semibold", children: seatPriorityCounts.primary })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "Secondary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#1B1A1A] text-sm font-semibold", children: seatPriorityCounts.secondary })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "RSP from Screen" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#1B1A1A] text-sm font-semibold", children: Number.isFinite(effectiveRspY) && Number.isFinite(screenFrontPlaneM) ? `${(effectiveRspY - screenFrontPlaneM).toFixed(2)} m` : "—" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#9CA3AF] text-[11px]", children: "RSP from Front Wall" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[#1B1A1A] text-sm font-semibold", children: Number.isFinite(effectiveRspY) ? `${effectiveRspY.toFixed(2)} m` : "—" })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Rows & Priority" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        rowsArray.map((count, idx) => {
          const currentZ = Number.isFinite(rowEarHeights[idx]) ? rowEarHeights[idx] : getEarHeightForRow(idx + 1);
          const currentPlatformH = (() => {
            const seat = Array.isArray(seatingPositions) ? seatingPositions.find((s) => s.rowNumber === idx + 1) : null;
            if (seat && Number.isFinite(seat.platformHeightM)) return seat.platformHeightM;
            if (idx === 0) return 0;
            const ear0 = Number.isFinite(rowEarHeights[0]) ? rowEarHeights[0] : getEarHeightForRow(1);
            return Math.max(0, Math.round((currentZ - ear0) * 100) / 100);
          })();
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 p-2 rounded-md border border-[#ECEAE4] bg-white", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-medium", style: { color: "#3E4349", width: 56 }, children: [
              "Row ",
              idx + 1
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs", style: { color: "#625143" }, children: "Seats" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Button,
                {
                  type: "button",
                  variant: "outline",
                  size: "icon",
                  "aria-label": `Remove one seat from row ${idx + 1}`,
                  disabled: disabled || count <= 1,
                  className: "h-8 w-8 shrink-0",
                  style: stepperBtnStyle,
                  onClick: () => commitSeatCount(idx, stepSeatCount(count, -1)),
                  children: "–"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "text",
                  inputMode: "numeric",
                  pattern: "[0-9]*",
                  "aria-label": `Seats in row ${idx + 1}`,
                  value: count,
                  disabled,
                  className: "h-8 w-14 text-center",
                  style: { backgroundColor: "#ffffff", border: "1px solid #C1B6AD", color: "#1B1A1A" },
                  onKeyDown: (e) => {
                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                    e.preventDefault();
                    commitSeatCount(idx, stepSeatCount(count, e.key === "ArrowUp" ? 1 : -1));
                  },
                  onChange: (e) => commitSeatCount(idx, e.target.value)
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Button,
                {
                  type: "button",
                  variant: "outline",
                  size: "icon",
                  "aria-label": `Add one seat to row ${idx + 1}`,
                  disabled,
                  className: "h-8 w-8 shrink-0",
                  style: stepperBtnStyle,
                  onClick: () => commitSeatCount(idx, stepSeatCount(count, 1)),
                  children: "+"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs", style: { color: "#625143" }, children: "Ear" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "number",
                  step: "0.1",
                  min: "0.1",
                  max: "3.0",
                  value: currentZ,
                  disabled,
                  className: "h-8 w-16 text-xs text-center",
                  style: { backgroundColor: "#ffffff", border: "1px solid #C1B6AD", color: "#1B1A1A" },
                  onChange: (e) => {
                    if (disabled) return;
                    const val = parseFloat(e.target.value);
                    if (!Number.isFinite(val) || val <= 0) return;
                    const clamped = Math.max(0.1, Math.min(3, Math.round(val * 10) / 10));
                    const next = [...rowEarHeights.length ? rowEarHeights : Array.from({ length: rowCount }, (_, j) => getEarHeightForRow(j + 1))];
                    while (next.length < rowCount) next.push(getEarHeightForRow(next.length + 1));
                    next[idx] = clamped;
                    onRowEarHeightsChange == null ? void 0 : onRowEarHeightsChange(next);
                    if (typeof onSetSeatingPositions === "function" && Array.isArray(seatingPositions)) {
                      let updated = seatingPositions.map(
                        (seat) => seat.rowNumber === idx + 1 ? { ...seat, z: clamped } : seat
                      );
                      if (linkEarPlatformHeights && idx > 0) {
                        const delta = clamped - currentZ;
                        const newPlatform = Math.max(0, Math.min(2, Math.round((currentPlatformH + delta) * 100) / 100));
                        updated = updated.map(
                          (seat) => seat.rowNumber === idx + 1 ? { ...seat, platformHeightM: newPlatform } : seat
                        );
                      }
                      onSetSeatingPositions(updated);
                    }
                  }
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs", style: { color: "#625143" }, children: "m" })
            ] }),
            idx > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs", style: { color: "#625143" }, children: "Platform" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "number",
                  step: "0.01",
                  min: "0",
                  max: "2.0",
                  value: Number.isFinite(currentPlatformH) ? Number(currentPlatformH.toFixed(2)) : 0,
                  disabled,
                  className: "h-8 w-24 text-xs text-center",
                  style: { backgroundColor: "#ffffff", border: "1px solid #C1B6AD", color: "#1B1A1A" },
                  onChange: (e) => {
                    if (disabled) return;
                    const val = parseFloat(e.target.value);
                    if (!Number.isFinite(val)) return;
                    const clamped = Math.max(0, Math.min(2, Math.round(val * 100) / 100));
                    if (typeof onSetSeatingPositions === "function" && Array.isArray(seatingPositions)) {
                      let updated = seatingPositions.map(
                        (seat) => seat.rowNumber === idx + 1 ? { ...seat, platformHeightM: clamped } : seat
                      );
                      if (linkEarPlatformHeights) {
                        const delta = clamped - currentPlatformH;
                        const newEar = Math.max(0.1, Math.min(3, Math.round((currentZ + delta) * 10) / 10));
                        updated = updated.map(
                          (seat) => seat.rowNumber === idx + 1 ? { ...seat, z: newEar } : seat
                        );
                        const next = [...rowEarHeights.length ? rowEarHeights : Array.from({ length: rowCount }, (_, j) => getEarHeightForRow(j + 1))];
                        while (next.length < rowCount) next.push(getEarHeightForRow(next.length + 1));
                        next[idx] = newEar;
                        onRowEarHeightsChange == null ? void 0 : onRowEarHeightsChange(next);
                      }
                      onSetSeatingPositions(updated);
                    }
                  }
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs", style: { color: "#625143" }, children: "m" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled: disabled || rowsArray.length <= 1,
                className: "h-8 ml-auto",
                style: { border: "1px solid #C1B6AD", backgroundColor: "#ffffff", color: "#625143" },
                onClick: () => {
                  if (disabled || rowsArray.length <= 1) return;
                  const next = rowsArray.filter((_row, i) => i !== idx);
                  const safe = next.length ? next : [rowsArray[0] ?? 3];
                  onGenerateSeating == null ? void 0 : onGenerateSeating({
                    seatsPerRowByRow: safe,
                    numberOfRows: safe.length,
                    seatSpacing,
                    rowSpacingM
                  });
                  const currentHeights = rowEarHeights.length ? [...rowEarHeights] : rowsArray.map((_, j) => getEarHeightForRow(j + 1));
                  const nextHeights = currentHeights.filter((_, j) => j !== idx);
                  onRowEarHeightsChange == null ? void 0 : onRowEarHeightsChange(nextHeights);
                },
                children: "Remove"
              }
            )
          ] }, `row-${idx}`);
        }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            type: "button",
            variant: "outline",
            className: "h-8",
            disabled,
            style: { border: "1px solid #C1B6AD", backgroundColor: "#ffffff", color: "#213428" },
            onClick: () => {
              if (disabled) return;
              const last = rowsArray[rowsArray.length - 1] ?? 3;
              const next = [...rowsArray, Math.max(1, Number(last) || 3)];
              onGenerateSeating == null ? void 0 : onGenerateSeating({
                seatsPerRowByRow: next,
                numberOfRows: next.length,
                seatSpacing,
                rowSpacingM
              });
              const currentHeights = rowEarHeights.length ? [...rowEarHeights] : rowsArray.map((_, j) => getEarHeightForRow(j + 1));
              currentHeights.push(getEarHeightForRow(next.length));
              onRowEarHeightsChange == null ? void 0 : onRowEarHeightsChange(currentHeights);
            },
            children: "+ Add Row"
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center justify-between py-2 px-3 rounded-md", style: { border: "1px solid #ECEAE4", backgroundColor: "#FAF9F6" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium", style: { color: "#3E4349" }, children: "Link ear & platform heights" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Switch,
          {
            checked: linkEarPlatformHeights,
            onCheckedChange: (v) => onLinkEarPlatformHeightsChange == null ? void 0 : onLinkEarPlatformHeightsChange(v),
            disabled
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        SeatPrioritySelector,
        {
          seatingPositions,
          onSetSeatingPositions,
          disabled,
          designatedRspSeatId,
          onSetDesignatedRspSeatId,
          rspMode,
          onRspModeChange
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Positioning" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Seat Spacing (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "icon",
                disabled,
                className: "h-9 w-9 shrink-0",
                style: stepperBtnStyle,
                onClick: () => {
                  if (disabled) return;
                  const base = Number.isFinite(seatSpacing) ? seatSpacing : 0.6;
                  const next = Math.max(0.5, Math.min(3, Math.round((base - 0.1) * 100) / 100));
                  onSeatSpacingChange == null ? void 0 : onSeatSpacingChange(next);
                },
                children: "–"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "text",
                inputMode: "decimal",
                min: "0.5",
                max: "3.0",
                step: "0.1",
                value: seatSpacing,
                onChange: (e) => {
                  if (disabled) return;
                  const raw = e.target.value;
                  if (raw === "") return;
                  const num = Number(raw);
                  if (Number.isFinite(num)) {
                    const clamped = Math.max(0.5, Math.min(3, Math.round(num * 100) / 100));
                    onSeatSpacingChange == null ? void 0 : onSeatSpacingChange(clamped);
                  }
                },
                disabled,
                className: "h-9 flex-1 text-center",
                style: { backgroundColor: "#ffffff", border: "1px solid #C1B6AD", color: "#1B1A1A" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "icon",
                disabled,
                className: "h-9 w-9 shrink-0",
                style: stepperBtnStyle,
                onClick: () => {
                  if (disabled) return;
                  const base = Number.isFinite(seatSpacing) ? seatSpacing : 0.6;
                  const next = Math.max(0.5, Math.min(3, Math.round((base + 0.1) * 100) / 100));
                  onSeatSpacingChange == null ? void 0 : onSeatSpacingChange(next);
                },
                children: "+"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Row Spacing (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  if (disabled || rowCount <= 1) return;
                  const current = Number.isFinite(rowSpacingM) ? Number(rowSpacingM) : 1.8;
                  const next = normaliseRowSpacing(String(current - 0.1));
                  if (next !== "") onRowSpacingChange == null ? void 0 : onRowSpacingChange(next);
                },
                disabled: disabled || rowCount <= 1,
                className: "h-9 w-9 shrink-0",
                style: stepperBtnStyle,
                children: "–"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "text",
                inputMode: "decimal",
                value: safeRowSpacingValue,
                onChange: (e) => {
                  if (disabled || rowCount <= 1) return;
                  const raw = e.target.value;
                  if (raw === "") return;
                  const normalized = normaliseRowSpacing(raw);
                  if (normalized !== "") onRowSpacingChange == null ? void 0 : onRowSpacingChange(normalized);
                },
                onBlur: (e) => {
                  if (disabled || rowCount <= 1) return;
                  const raw = e.target.value;
                  const normalized = normaliseRowSpacing(raw);
                  if (normalized !== "") onRowSpacingChange == null ? void 0 : onRowSpacingChange(normalized);
                },
                disabled: disabled || rowCount <= 1,
                className: "h-9 flex-1 text-center",
                style: { backgroundColor: "#ffffff", border: "1px solid #C1B6AD", color: "#1B1A1A" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  if (disabled || rowCount <= 1) return;
                  const current = Number.isFinite(rowSpacingM) ? Number(rowSpacingM) : 1.8;
                  const next = normaliseRowSpacing(String(current + 0.1));
                  if (next !== "") onRowSpacingChange == null ? void 0 : onRowSpacingChange(next);
                },
                disabled: disabled || rowCount <= 1,
                className: "h-9 w-9 shrink-0",
                style: stepperBtnStyle,
                children: "+"
              }
            )
          ] })
        ] }),
        (() => {
          const centers = liveCenters ?? (Array.isArray(rowCentersM) && rowCentersM.length > 0 ? rowCentersM : null);
          const offset = Number.isFinite(seatingBlockOffset) ? seatingBlockOffset : 0;
          const frontRowY = centers ? centers[0] : null;
          const frontRowYAtZeroOffset = Number.isFinite(frontRowY) ? frontRowY - offset : null;
          const displayValue = Number.isFinite(frontRowY) ? Math.round(frontRowY * 100) / 100 : null;
          const handleChange = (desiredFrontRowY) => {
            if (!Number.isFinite(desiredFrontRowY) || !Number.isFinite(frontRowYAtZeroOffset)) return;
            const newOffset = desiredFrontRowY - frontRowYAtZeroOffset;
            onSeatingBlockOffsetChange == null ? void 0 : onSeatingBlockOffsetChange(clampViewingOffset(Math.round(newOffset * 100) / 100));
          };
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sm:col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelStyle, children: "Front Row Distance from Front Wall (m)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] mb-1.5", style: { color: "#9CA3AF" }, children: "Sets the distance from the front wall to Row 1. Other rows are derived from row spacing." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Button,
                {
                  type: "button",
                  variant: "outline",
                  size: "icon",
                  disabled: disabled || !Number.isFinite(displayValue),
                  className: "h-9 w-9 shrink-0",
                  style: stepperBtnStyle,
                  onClick: () => {
                    if (disabled || !Number.isFinite(displayValue)) return;
                    handleChange(Math.round((displayValue - 0.1) * 100) / 100);
                  },
                  children: "–"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "text",
                  inputMode: "decimal",
                  step: "0.1",
                  value: displayValue !== null ? displayValue.toFixed(2) : "",
                  onChange: (e) => {
                    if (disabled) return;
                    const raw = e.target.value;
                    if (raw === "") return;
                    const num = Number(raw);
                    if (Number.isFinite(num)) handleChange(num);
                  },
                  disabled: disabled || displayValue === null,
                  className: "h-9 flex-1 text-center",
                  style: { backgroundColor: "#ffffff", border: "1px solid #C1B6AD", color: "#1B1A1A" }
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Button,
                {
                  type: "button",
                  variant: "outline",
                  size: "icon",
                  disabled: disabled || !Number.isFinite(displayValue),
                  className: "h-9 w-9 shrink-0",
                  style: stepperBtnStyle,
                  onClick: () => {
                    if (disabled || !Number.isFinite(displayValue)) return;
                    handleChange(Math.round((displayValue + 0.1) * 100) / 100);
                  },
                  children: "+"
                }
              )
            ] }),
            centers && centers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-1.5 flex flex-wrap gap-1.5", children: centers.slice(0, 4).map((y, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]",
                style: { backgroundColor: "#F8F8F7", border: "1px solid #ECEAE4", color: "#625143" },
                children: [
                  "R",
                  i + 1,
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { color: "#1B1A1A", fontWeight: 600 }, children: [
                    Number.isFinite(y) ? y.toFixed(2) : "—",
                    " m"
                  ] })
                ]
              },
              i
            )) })
          ] });
        })()
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              disabled,
              className: "h-9",
              style: { border: "1px solid #C1B6AD", backgroundColor: "#ffffff", color: "#213428", fontWeight: 600, fontSize: 12 },
              onClick: () => {
                cancelMlpGrab();
                onRspModeChange == null ? void 0 : onRspModeChange("auto_from_screen");
                onManualRspX_mChange == null ? void 0 : onManualRspX_mChange(null);
                onManualRspY_mChange == null ? void 0 : onManualRspY_mChange(null);
                onSetDesignatedRspSeatId == null ? void 0 : onSetDesignatedRspSeatId(null);
              },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "w-3.5 h-3.5 mr-1" }),
                "Reset RSP to 57.5°"
              ]
            }
          ),
          rowCount === 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              disabled,
              className: "h-9",
              style: { border: "1px solid #C1B6AD", backgroundColor: "#ffffff", color: "#213428", fontWeight: 600, fontSize: 12 },
              onClick: handleMoveSeatsToRsp,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Move, { className: "w-3.5 h-3.5 mr-1" }),
                "Move seats to RSP"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between py-2 px-3 rounded-md", style: { border: "1px solid #ECEAE4", backgroundColor: "#FAF9F6" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium", style: { color: "#3E4349" }, children: "RSP Position Ruler" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: showMlpRuler,
              onCheckedChange: onShowMlpRulerChange,
              disabled
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Viewing Angle Analysis" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ViewingAnglePanel,
        {
          screen,
          seatingPositions,
          viewingDistanceOffsetM: seatingBlockOffset,
          mlpOverride,
          mlpDotOffsetM: seatingBlockOffset,
          showMlpRuler,
          onShowMlpRulerChange
        }
      ) })
    ] })
  ] });
}
export {
  SeatingLayout as default
};
