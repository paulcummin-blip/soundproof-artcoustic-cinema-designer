import { R as React, j as jsxRuntimeExports, aE as Plus, aF as ChevronDown, aG as Trash2, L as Label, I as Input, e as Select, f as SelectTrigger, h as SelectValue, i as SelectContent, k as SelectItem } from "./index-BdFovajD.js";
import { S as StepperInput } from "./StepperInput-D7kZNv61.js";
const round2 = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : value;
};
const clamp = (value, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return num;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(Math.max(num, low), high);
};
function sanitizeProjectorElement(el, roomDims) {
  if ((el == null ? void 0 : el.type) !== "projector") return el;
  const widthM = Number(roomDims == null ? void 0 : roomDims.widthM);
  const lengthM = Number(roomDims == null ? void 0 : roomDims.lengthM);
  const heightM = Number(roomDims == null ? void 0 : roomDims.heightM);
  let x_lens_m = round2(el.x_lens_m);
  let y_lens_m = round2(el.y_lens_m);
  let z_lens_m = round2(el.z_lens_m);
  const body_width_m = round2(el.body_width_m);
  const body_height_m = round2(el.body_height_m);
  const body_depth_m = round2(el.body_depth_m);
  if (Number.isFinite(widthM)) {
    x_lens_m = clamp(x_lens_m, 0.1, widthM - 0.1);
  }
  if (Number.isFinite(lengthM)) {
    y_lens_m = clamp(y_lens_m, 0.1, lengthM - 0.1);
  }
  if (Number.isFinite(heightM)) {
    z_lens_m = clamp(z_lens_m, 0.1, heightM - 0.1);
    if (Number.isFinite(Number(body_height_m))) {
      const halfBodyHeight = Number(body_height_m) / 2;
      z_lens_m = clamp(z_lens_m, 0.1 + halfBodyHeight, heightM - 0.1 - halfBodyHeight);
    }
  }
  return {
    ...el,
    x_lens_m,
    y_lens_m,
    z_lens_m,
    body_width_m,
    body_height_m,
    body_depth_m
  };
}
function fmtM(value, fallback = "") {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback !== void 0 ? String(fallback) : "";
  return n.toFixed(2);
}
function RoomElements({ elements = [], onChange, roomDims }) {
  const [drafts, setDrafts] = React.useState({});
  const [collapsedOverride, setCollapsedOverride] = React.useState({});
  const newlyCreatedIdsRef = React.useRef(/* @__PURE__ */ new Set());
  const isCollapsed = (id) => {
    if (Object.prototype.hasOwnProperty.call(collapsedOverride, id)) return collapsedOverride[id];
    return !newlyCreatedIdsRef.current.has(id);
  };
  const toggleCollapsed = (id) => {
    setCollapsedOverride((prev) => ({ ...prev, [id]: !isCollapsed(id) }));
  };
  const makeId = () => `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
  const addDoor = () => {
    const elementCount = (elements || []).length;
    const newId = makeId();
    newlyCreatedIdsRef.current.add(newId);
    const newElement = {
      id: newId,
      type: "door",
      // Placement
      wall: "rear",
      // Front / Rear / Left / Right (screen is on Front)
      length_m: 0.9,
      // along the wall
      thickness_m: 0.05,
      // 5cm
      // Position along the wall:
      // - If Front/Rear: use x_m (0..room width)
      // - If Left/Right: use y_m (0..room length)
      x_m: 1,
      y_m: 1,
      // Vertical placement
      z_m: 0,
      z_position: 0,
      height: 2.1,
      // UI
      label: `Element ${elementCount + 1}`
    };
    onChange([...elements || [], newElement]);
  };
  const addProjector = () => {
    (elements || []).length;
    const roomW = Number((roomDims == null ? void 0 : roomDims.widthM) ?? (roomDims == null ? void 0 : roomDims.width) ?? 0) || 0;
    const roomL = Number((roomDims == null ? void 0 : roomDims.lengthM) ?? (roomDims == null ? void 0 : roomDims.length) ?? 0) || 0;
    const roomH = Number((roomDims == null ? void 0 : roomDims.heightM) ?? (roomDims == null ? void 0 : roomDims.height) ?? 2.4) || 2.4;
    const bodyW = 0.46;
    const bodyH = 0.21;
    const bodyD = 0.517;
    const lensX = roomW > 0 ? roomW / 2 : 0;
    const lensY = roomL > 0 ? Math.max(0, roomL - 0.15) : 0;
    const lensZ = Math.max(0, roomH - 0.1 - bodyH / 2);
    const newId = makeId();
    newlyCreatedIdsRef.current.add(newId);
    const newElement = {
      id: newId,
      type: "projector",
      wall: "rear",
      label: "Projector",
      // Formal projector fields
      x_lens_m: lensX,
      y_lens_m: lensY,
      z_lens_m: lensZ,
      body_width_m: bodyW,
      body_height_m: bodyH,
      body_depth_m: bodyD,
      // Legacy plan-view fields kept for RV rendering compatibility
      length_m: bodyW,
      thickness_m: bodyD,
      pos_m: roomW > 0 ? roomW / 2 - bodyW / 2 : 0,
      wall_offset_m: 0.1,
      height_m: bodyH
    };
    onChange([...elements || [], sanitizeProjectorElement(newElement, roomDims)]);
  };
  const updateElement = (id, field, value) => {
    const numberFields = /* @__PURE__ */ new Set(["length_m", "thickness_m", "height_m", "height", "z_position", "wall_offset_m", "x_m", "y_m", "z_m", "pos_m", "x_lens_m", "y_lens_m", "z_lens_m", "body_width_m", "body_height_m", "body_depth_m"]);
    let parsed = numberFields.has(field) ? parseFloat(value) : value;
    const next = (elements || []).map((el) => {
      if (el.id !== id) return el;
      let finalValue = Number.isFinite(parsed) ? parsed : parsed;
      if (field === "z_lens_m" && Number.isFinite(parsed)) {
        const roomH = Number((roomDims == null ? void 0 : roomDims.heightM) ?? (roomDims == null ? void 0 : roomDims.height) ?? 2.4) || 2.4;
        const bodyH = Number((el == null ? void 0 : el.body_height_m) ?? 0.21) || 0.21;
        const maxLensZ = Math.max(0, roomH - 0.1 - bodyH / 2);
        finalValue = Math.min(Math.max(0, parsed), maxLensZ);
      }
      return sanitizeProjectorElement({ ...el, [field]: finalValue }, roomDims);
    });
    onChange(next);
  };
  const removeElement = (id) => {
    onChange((elements || []).filter((el) => el.id !== id));
  };
  const wallLabel = (w) => {
    const v = String(w || "").toLowerCase();
    if (v === "front") return "Front";
    if (v === "rear") return "Rear";
    if (v === "left") return "Left";
    if (v === "right") return "Right";
    if (v === "back") return "Rear";
    return "Rear";
  };
  const normaliseWallValue = (w) => {
    const v = String(w || "").toLowerCase();
    if (v === "back") return "rear";
    if (v === "front" || v === "rear" || v === "left" || v === "right") return v;
    return "rear";
  };
  const typeLabel = (type) => {
    const t = String(type || "").toLowerCase();
    if (t === "projector") return "Projector";
    if (t === "door") return "Door";
    if (t === "window") return "Window";
    if (t === "column") return "Column";
    if (t === "opening") return "Opening";
    return "Element";
  };
  const buildSummary = (element) => {
    if ((element == null ? void 0 : element.type) === "projector") {
      return `X ${fmtM(element == null ? void 0 : element.x_lens_m, "—")} · Y ${fmtM(element == null ? void 0 : element.y_lens_m, "—")} · Z ${fmtM(element == null ? void 0 : element.z_lens_m, "—")} m`;
    }
    return `${wallLabel(element == null ? void 0 : element.wall)} wall · ${fmtM(element == null ? void 0 : element.length_m, "—")} m`;
  };
  const groupTitleStyle = {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#625143",
    marginBottom: "10px"
  };
  const fieldLabelClassName = "block mb-1.5 text-xs text-[#6B7280]";
  const helperTextStyle = {
    fontSize: "10px",
    color: "#9CA3AF",
    marginTop: "4px"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 font-body", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: addDoor,
          className: "group flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all duration-150 border-[#DCDBD6] bg-white hover:bg-[#F9F8F6] hover:border-[#C4B5A8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#625143] focus-visible:ring-offset-1 active:translate-y-[1px]",
          "aria-label": "Create Room Element",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold", style: { color: "#625143", letterSpacing: 0.3 }, children: "CREATE ROOM ELEMENT" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4 shrink-0 transition-transform group-hover:scale-110", style: { color: "#625143" } })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: addProjector,
          className: "group flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all duration-150 border-[#DCDBD6] bg-white hover:bg-[#F9F8F6] hover:border-[#7A9B8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428] focus-visible:ring-offset-1 active:translate-y-[1px]",
          "aria-label": "Create Projector",
          title: "Add Projector",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold", style: { color: "#213428", letterSpacing: 0.3 }, children: "CREATE PROJECTOR" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4 shrink-0 transition-transform group-hover:scale-110", style: { color: "#213428" } })
          ]
        }
      )
    ] }),
    (elements || []).map((element) => {
      const wall = normaliseWallValue(element == null ? void 0 : element.wall);
      const isFrontOrRear = wall === "front" || wall === "rear";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "rounded-lg border",
          style: {
            borderColor: "#DCDBD6",
            background: "#FFFFFF",
            borderLeftWidth: 3,
            borderLeftColor: (element == null ? void 0 : element.type) === "projector" ? "#7A9B8C" : "#C4B5A8"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: "flex justify-between items-center px-4 py-2.5 cursor-pointer select-none",
                onClick: () => toggleCollapsed(element.id),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0 flex-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium shrink-0", style: { color: (element == null ? void 0 : element.type) === "projector" ? "#213428" : "#625143" }, children: (element == null ? void 0 : element.label) || typeLabel(element == null ? void 0 : element.type) }),
                    isCollapsed(element.id) && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs truncate", style: { color: "#9CA3AF" }, children: buildSummary(element) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 shrink-0", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "p-1.5 rounded-md", style: { color: "#9CA3AF" }, "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: `w-3.5 h-3.5 transition-transform ${isCollapsed(element.id) ? "" : "rotate-180"}` }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: (e) => {
                          e.stopPropagation();
                          removeElement(element.id);
                        },
                        className: "p-1.5 rounded-md transition-colors hover:bg-[#F3F2EF]",
                        style: { color: "#9CA3AF" },
                        "aria-label": "Remove element",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" })
                      }
                    )
                  ] })
                ]
              }
            ),
            !isCollapsed(element.id) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pb-4 pt-1", children: (element == null ? void 0 : element.type) === "projector" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Label" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    type: "text",
                    value: (element == null ? void 0 : element.label) ?? "",
                    onChange: (e) => updateElement(element.id, "label", e.target.value),
                    className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                    placeholder: "Projector"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Lens Centre (m)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 mb-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Lens X (m)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: fmtM(element == null ? void 0 : element.x_lens_m, ""),
                      onChange: (e) => updateElement(element.id, "x_lens_m", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "—"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", style: helperTextStyle, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "From left wall" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        className: "underline hover:opacity-80",
                        onClick: () => {
                          const roomW = Number((roomDims == null ? void 0 : roomDims.widthM) ?? (roomDims == null ? void 0 : roomDims.width) ?? 0) || 0;
                          if (!roomW) return;
                          updateElement(element.id, "x_lens_m", roomW / 2);
                        },
                        children: "Centre"
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Lens Y (m)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: fmtM(element == null ? void 0 : element.y_lens_m, ""),
                      onChange: (e) => updateElement(element.id, "y_lens_m", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "—"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: "From front wall" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Lens Z (m)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: fmtM(element == null ? void 0 : element.z_lens_m, ""),
                      onChange: (e) => updateElement(element.id, "z_lens_m", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "—"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: "Height from floor" })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: groupTitleStyle, children: "Body Dimensions (m)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Body Width (m)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: fmtM(element == null ? void 0 : element.body_width_m, ""),
                      onChange: (e) => updateElement(element.id, "body_width_m", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "—"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Body Height (m)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: fmtM(element == null ? void 0 : element.body_height_m, ""),
                      onChange: (e) => updateElement(element.id, "body_height_m", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "—"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Body Depth (m)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "number",
                      step: "0.01",
                      value: fmtM(element == null ? void 0 : element.body_depth_m, ""),
                      onChange: (e) => updateElement(element.id, "body_depth_m", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "—"
                    }
                  )
                ] })
              ] })
            ] }) : (
              /* NON-PROJECTOR layout */
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Wall" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      Select,
                      {
                        value: wall,
                        onValueChange: (value) => updateElement(element.id, "wall", value),
                        modal: false,
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "bg-white border-[#DCDBD6] text-[#1B1A1A]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { position: "popper", sideOffset: 6, className: "z-[70]", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "front", children: "Front" }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "rear", children: "Rear" }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "left", children: "Left" }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "right", children: "Right" })
                          ] })
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: "Screen is always on the Front wall." })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Length (m)" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      StepperInput,
                      {
                        value: Number(element == null ? void 0 : element.length_m) || 0.9,
                        step: 0.01,
                        min: 0.05,
                        onChange: (newLen) => {
                          const roomW = Number((roomDims == null ? void 0 : roomDims.widthM) ?? (roomDims == null ? void 0 : roomDims.width) ?? 0) || 0;
                          const roomL = Number((roomDims == null ? void 0 : roomDims.lengthM) ?? (roomDims == null ? void 0 : roomDims.length) ?? 0) || 0;
                          const wallLen = isFrontOrRear ? roomW : roomL;
                          const posM = Number((element == null ? void 0 : element.pos_m) ?? (element == null ? void 0 : element.x_m) ?? (element == null ? void 0 : element.y_m) ?? 0) || 0;
                          const maxPos = wallLen > 0 ? Math.max(0, wallLen - newLen) : posM;
                          const clampedPos = Math.min(posM, maxPos);
                          const next = { ...element, length_m: newLen, pos_m: clampedPos };
                          onChange((elements || []).map((el) => el.id === element.id ? next : el));
                        }
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Label" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    Input,
                    {
                      type: "text",
                      value: (element == null ? void 0 : element.label) ?? "",
                      onChange: (e) => updateElement(element.id, "label", e.target.value),
                      className: "bg-white border-[#DCDBD6] text-[#1B1A1A]",
                      placeholder: "e.g. Entrance door"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-3", children: (() => {
                  const roomH = Number((roomDims == null ? void 0 : roomDims.heightM) ?? (roomDims == null ? void 0 : roomDims.height) ?? 2.8) || 2.8;
                  const elH = Number(element == null ? void 0 : element.height) || 2.1;
                  const elZ = Number(element == null ? void 0 : element.z_position) || 0;
                  const maxZ = Math.max(0, roomH - elH);
                  const maxH = Math.max(0.05, roomH - elZ);
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Height from Floor (m)" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        StepperInput,
                        {
                          value: elZ,
                          step: 0.01,
                          min: 0,
                          max: maxZ,
                          onChange: (val) => updateElement(element.id, "z_position", Math.max(0, Math.min(val, maxZ)))
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: "Bottom of element AFF" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: fieldLabelClassName, children: "Element Height (m)" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        StepperInput,
                        {
                          value: elH,
                          step: 0.01,
                          min: 0.05,
                          max: maxH,
                          onChange: (val) => updateElement(element.id, "height", Math.max(0.05, Math.min(val, maxH)))
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: "Opening height" })
                    ] })
                  ] });
                })() }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-3", children: (() => {
                  const posM = Number((element == null ? void 0 : element.pos_m) ?? (element == null ? void 0 : element.x_m) ?? (element == null ? void 0 : element.y_m) ?? 0) || 0;
                  const elLen = Number(element == null ? void 0 : element.length_m) || 0.9;
                  const roomW = Number((roomDims == null ? void 0 : roomDims.widthM) ?? (roomDims == null ? void 0 : roomDims.width) ?? 0) || 0;
                  const roomL = Number((roomDims == null ? void 0 : roomDims.lengthM) ?? (roomDims == null ? void 0 : roomDims.length) ?? 0) || 0;
                  const wallLen = isFrontOrRear ? roomW : roomL;
                  const distA = wallLen > 0 ? Math.max(0, posM) : 0;
                  const distB = wallLen > 0 ? Math.max(0, wallLen - posM - elLen) : 0;
                  const maxDistA = wallLen > 0 ? Math.max(0, wallLen - elLen) : 0;
                  const labelA = isFrontOrRear ? "Left Distance" : "Front Distance";
                  const labelB = isFrontOrRear ? "Right Distance" : "Rear Distance";
                  const hintA = isFrontOrRear ? "From left wall to element edge" : "From front wall to element edge";
                  const hintB = isFrontOrRear ? "From element edge to right wall" : "From element edge to rear wall";
                  const setDistA = (newDistA) => {
                    const clamped = Math.max(0, Math.min(newDistA, maxDistA));
                    onChange((elements || []).map(
                      (el) => el.id === element.id ? { ...el, pos_m: clamped } : el
                    ));
                  };
                  const setDistB = (newDistB) => {
                    const maxDistB = Math.max(0, wallLen - elLen);
                    const clamped = Math.max(0, Math.min(newDistB, maxDistB));
                    const newPosM = wallLen - elLen - clamped;
                    onChange((elements || []).map(
                      (el) => el.id === element.id ? { ...el, pos_m: Math.max(0, newPosM) } : el
                    ));
                  };
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { className: fieldLabelClassName, children: [
                        labelA,
                        " (m)"
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        StepperInput,
                        {
                          value: distA,
                          step: 0.01,
                          min: 0,
                          max: maxDistA,
                          onChange: setDistA
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: hintA })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { className: fieldLabelClassName, children: [
                        labelB,
                        " (m)"
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        StepperInput,
                        {
                          value: distB,
                          step: 0.01,
                          min: 0,
                          max: Math.max(0, wallLen - elLen),
                          onChange: setDistB
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: helperTextStyle, children: hintB })
                    ] })
                  ] });
                })() })
              ] })
            ) })
          ]
        },
        element.id
      );
    })
  ] });
}
export {
  RoomElements as default
};
