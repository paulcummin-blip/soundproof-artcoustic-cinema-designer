import { F as sameCentreCabinetAim, R as React, j as jsxRuntimeExports, L as Label, e as Select, f as SelectTrigger, i as SelectContent, k as SelectItem, h as SelectValue, S as Switch, g as getSpeakerModelMeta, u as useAppState, G as useProductRoleOptions, P as PRODUCT_ROLES, a as reactExports, H as normaliseModelKey, J as getCanonicalRole, K as rolesForLayout, M as timeNowMs, I as Input, N as cn, O as useSubwooferCompatibilityActions, Q as subwooferDisplayLabel, T as subwooferModelKey, U as CollapsiblePanel, V as Card, W as CardHeader, X as CardTitle, Y as Volume2, Z as CardContent, _ as formatDb, n as RP22GradingPill, $ as getTargetOverheadIds, a0 as assignModelsForRoles, B as Button, a1 as resolveOverheadModelForRole, a2 as Check, a3 as canonicalProductId, a4 as getMlpSeat, a5 as getSeatSplMetrics, a6 as isCentreCabinetRole, a7 as DUAL_CENTRE_SPL_GAIN_DB, a8 as formatHeightM, a9 as resolveSoundbarMetaM, aa as computeTvVerticalCentreM, ab as resolveInitialLcrPosition, ac as CENTRE_CABINET_ROLES, ad as normaliseCabinetOrientation, ae as defaultCentreCabinetOrientation, af as P12_MODE_RECOMMENDED, ag as detectDualCentreStage, ah as FRONT_STAGE_DUAL_CENTRE, ai as FRONT_STAGE_STANDARD, aj as eligibleDualCentreCentreOptions, ak as centreCabinets, al as effectiveCentreAcousticMidpoint, am as yawDegToMLP, an as centreCabinetOrientation, ao as calculateLcrAcousticCentreBand, ap as resolveCanonicalRsp, aq as withCentreCabinetAim, ar as centreCabinetAimAtRsp, as as resolveSpeakerYaw, at as normaliseFrontStageMode, au as defaultDualCentreCentreModelLabel, av as FRONT_STAGE_MODE_LABELS, aw as FRONT_STAGE_MODE_OPTIONS, ax as needsSeriesParallelWarning, ay as CABINET_ORIENTATION_OPTIONS, az as CENTRE_CABINET_AIM_OPTIONS, aA as computeMLPAndPrimary, aB as resolveAutoSurroundHeight, aC as hasInvalidAutomaticRearPair, aD as resolveInitialWallPosition } from "./index-BdFovajD.js";
import { S as StepperInput } from "./StepperInput-D7kZNv61.js";
const __b44SigFor = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
function __b44SameSpeakers(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  if (!sameCentreCabinetAim(a, b)) return false;
  for (let i = 0; i < a.length; i++) {
    const A = a[i] || {};
    const B = b[i] || {};
    if ((A.id ?? null) !== (B.id ?? null)) return false;
    if ((A.role ?? null) !== (B.role ?? null)) return false;
    if ((A.model ?? null) !== (B.model ?? null)) return false;
    const Ap = A.position || {};
    const Bp = B.position || {};
    if (!Number.isFinite(Ap.x) || !Number.isFinite(Ap.y) || !Number.isFinite(Bp.x) || !Number.isFinite(Bp.y)) {
      if (A.position || B.position) return false;
    } else {
      if (Math.abs(Ap.x - Bp.x) > 1e-4) return false;
      if (Math.abs(Ap.y - Bp.y) > 1e-4) return false;
      if (Number.isFinite(Ap.z) || Number.isFinite(Bp.z)) {
        if (Math.abs((Ap.z ?? 0) - (Bp.z ?? 0)) > 1e-4) return false;
      }
    }
  }
  return true;
}
function SurroundsSelector({
  layout,
  choices,
  sideChoices,
  rearChoices,
  wideChoices,
  value,
  override,
  onChange,
  activeRoles,
  disabled,
  extraSurroundCount,
  onExtraSurroundCountChange,
  allowExtraSurrounds
}) {
  const filteredSideChoices = sideChoices || choices;
  const filteredRearChoices = rearChoices || choices;
  const filteredWideChoices = wideChoices || choices;
  const [showSurroundOverrides, setShowSurroundOverrides] = React.useState(false);
  const rolesReady = Array.isArray(activeRoles) && activeRoles.length > 0;
  const choicesReady = Array.isArray(choices) && choices.length > 0;
  const ready = rolesReady && choicesReady;
  const uiDisabled = disabled || !ready;
  const showSides = (activeRoles || []).includes("SL");
  const showRears = (activeRoles || []).includes("SBL");
  const showWides = (activeRoles || []).includes("LW");
  const isReal = (m) => !!m && m !== "(none)" && m !== "off" && m !== "none";
  const masterModel = isReal(value == null ? void 0 : value.master) ? value.master : "off";
  const sideModel = isReal(value == null ? void 0 : value.side) ? value.side : masterModel;
  const rearModel = isReal(value == null ? void 0 : value.rear) ? value.rear : masterModel;
  const wideModel = isReal(value == null ? void 0 : value.wide) ? value.wide : masterModel;
  const sideOverride = !!(override == null ? void 0 : override.side);
  const rearOverride = !!(override == null ? void 0 : override.rear);
  const wideOverride = !!(override == null ? void 0 : override.wide);
  const safeExtraCount = Number.isFinite(extraSurroundCount) ? extraSurroundCount : 0;
  const getModelLabel = (modelKey) => {
    if (!modelKey || modelKey === "off" || modelKey === "OFF") return "Off";
    const choice = choices.find((c) => c.value === modelKey) || filteredSideChoices.find((c) => c.value === modelKey) || filteredRearChoices.find((c) => c.value === modelKey) || filteredWideChoices.find((c) => c.value === modelKey);
    if (choice == null ? void 0 : choice.label) return choice.label;
    const meta = getSpeakerModelMeta(modelKey);
    return (meta == null ? void 0 : meta.label) && !meta.notFound ? meta.label : modelKey;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Surround Model (All)" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Select,
        {
          value: masterModel,
          onValueChange: (newMaster) => {
            const next = !newMaster || newMaster === "off" ? "off" : newMaster;
            onChange({
              value: { ...value, master: next },
              override
            });
          },
          disabled: uiDisabled,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-2xl font-semibold", style: { color: masterModel === "off" ? "#9B9890" : "#213428" }, children: masterModel === "off" ? "Select surround model" : getModelLabel(masterModel) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: (choices || []).map((choice) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              SelectItem,
              {
                value: choice.value,
                className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]",
                style: { color: "#213428" },
                children: choice.label
              },
              choice.value
            )) })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#625143]", children: "Applies to all surrounds unless overridden." }),
      allowExtraSurrounds && /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, marginBottom: 18 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontWeight: 600, fontSize: 14 }, children: "Extra Surrounds" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 150 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: String(safeExtraCount),
            onValueChange: (v) => {
              const n = parseInt(v, 10);
              if (typeof onExtraSurroundCountChange === "function") {
                onExtraSurroundCountChange(Number.isFinite(n) ? n : 0);
              }
            },
            disabled: uiDisabled,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { className: "bg-white border-[#DCDBD6]", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "0", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "Off" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "2", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "2" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "4", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "4" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "6", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "6" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "8", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: "8" })
              ] })
            ]
          }
        ) })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setShowSurroundOverrides((v) => !v),
          style: {
            marginTop: 16,
            marginBottom: 8,
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 13,
            fontStyle: "italic",
            textDecoration: "underline",
            color: "#625143"
          },
          children: showSurroundOverrides ? "Hide individual control" : "Individual Control"
        }
      )
    ] }),
    showSurroundOverrides && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-[#E5E5E5]" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        showSides && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Side Surrounds" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-[#625143]", children: "Use Global" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Switch,
                {
                  checked: !sideOverride,
                  onCheckedChange: (checked) => {
                    onChange({
                      value,
                      override: { ...override, side: !checked }
                    });
                  },
                  disabled: uiDisabled
                }
              )
            ] })
          ] }),
          sideOverride ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: sideModel,
              onValueChange: (newSide) => {
                onChange({
                  value: { ...value, side: !newSide || newSide === "off" ? "off" : newSide },
                  override
                });
              },
              disabled: uiDisabled,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: sideModel === "off" ? "#9B9890" : "#1B1A1A" }, children: sideModel === "off" ? "Select surround model" : getModelLabel(sideModel) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: (filteredSideChoices || []).map((choice) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: choice.value, className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: choice.label }, choice.value)) })
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-[#625143] italic", children: [
            "Using: ",
            getModelLabel(masterModel)
          ] })
        ] }),
        showRears && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Rear Surrounds" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-[#625143]", children: "Use Global" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Switch,
                {
                  checked: !rearOverride,
                  onCheckedChange: (checked) => {
                    onChange({
                      value,
                      override: { ...override, rear: !checked }
                    });
                  },
                  disabled: uiDisabled
                }
              )
            ] })
          ] }),
          rearOverride ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: rearModel,
              onValueChange: (newRear) => {
                onChange({
                  value: { ...value, rear: !newRear || newRear === "off" ? "off" : newRear },
                  override
                });
              },
              disabled: uiDisabled,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: rearModel === "off" ? "#9B9890" : "#1B1A1A" }, children: rearModel === "off" ? "Select surround model" : getModelLabel(rearModel) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: (filteredRearChoices || []).map((choice) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: choice.value, className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: choice.label }, choice.value)) })
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-[#625143] italic", children: [
            "Using: ",
            getModelLabel(masterModel)
          ] })
        ] }),
        showWides && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Front Wides" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-[#625143]", children: "Use Global" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Switch,
                {
                  checked: !wideOverride,
                  onCheckedChange: (checked) => {
                    onChange({
                      value,
                      override: { ...override, wide: !checked }
                    });
                  },
                  disabled: uiDisabled
                }
              )
            ] })
          ] }),
          wideOverride ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: wideModel,
              onValueChange: (newWide) => {
                onChange({
                  value: { ...value, wide: !newWide || newWide === "off" ? "off" : newWide },
                  override
                });
              },
              disabled: uiDisabled,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: wideModel === "off" ? "#9B9890" : "#1B1A1A" }, children: wideModel === "off" ? "Select surround model" : getModelLabel(wideModel) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: (filteredWideChoices || []).map((choice) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: choice.value, className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: choice.label }, choice.value)) })
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-[#625143] italic", children: [
            "Using: ",
            getModelLabel(masterModel)
          ] })
        ] })
      ] })
    ] })
  ] });
}
function UnifiedSurroundsConfig$1({
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  dolbyPreset,
  sevenBedLayoutType,
  dimensions,
  getHuggingCenterLines,
  applyCornerClearance,
  applyRoomBoundsClamp,
  disabled,
  allowedRoles,
  canSides,
  canRears,
  canWides,
  is7xOrHigher,
  safePos,
  effectivePreset,
  useWides,
  resetSurroundPositions,
  surroundConfig,
  setSurroundConfig,
  needsSurroundResetRef,
  lastSurroundModelKeyRef,
  extraSurroundCount,
  onExtraSurroundCountChange,
  allowExtraSurrounds,
  surroundHeightConfig,
  setSurroundHeightConfig,
  autoSurroundHeight,
  roomHeight
}) {
  var _a, _b, _c;
  const dimsSafe = React.useMemo(() => {
    const src = dimensions || {};
    return {
      width: Number(src.width ?? src.widthM) || 4.5,
      length: Number(src.length ?? src.lengthM) || 6,
      height: Number(src.height ?? src.heightM) || 2.4
    };
  }, [dimensions]);
  const app = useAppState();
  const { options: sideModels } = useProductRoleOptions(PRODUCT_ROLES.SURROUND);
  const { options: rearModels } = useProductRoleOptions(PRODUCT_ROLES.REAR_SURROUND);
  const { options: wideModels } = useProductRoleOptions(PRODUCT_ROLES.FRONT_WIDE);
  const activeRoles = reactExports.useMemo(() => {
    const roles = [];
    if (allowedRoles.has("SL")) roles.push("SL", "SR");
    if (allowedRoles.has("SBL")) roles.push("SBL", "SBR");
    if (allowedRoles.has("LW")) roles.push("LW", "RW");
    return roles;
  }, [allowedRoles]);
  const safeExtraSurroundCount = Number.isFinite(extraSurroundCount) ? extraSurroundCount : 0;
  const safeOnExtraSurroundCountChange = typeof onExtraSurroundCountChange === "function" ? onExtraSurroundCountChange : () => {
  };
  const safeAllowExtraSurrounds = !!allowExtraSurrounds;
  React.useEffect(() => {
    const stripSurroundSuffix = (value) => {
      const str = String(value || "").trim();
      return str.endsWith("_s") ? str.slice(0, -2) : str;
    };
    const surroundChoiceKeys = new Set(
      [...sideModels, ...rearModels, ...wideModels].map((item) => item.key)
    );
    for (const speaker of Array.isArray(placedSpeakers) ? placedSpeakers : []) {
      const historicalKey = stripSurroundSuffix(normaliseModelKey((speaker == null ? void 0 : speaker.model) || ""));
      if (historicalKey) surroundChoiceKeys.add(historicalKey);
    }
    const normalizeSurroundChoiceModel = (value) => {
      const normalized = normaliseModelKey(String(value || "").trim());
      const lower = normalized.toLowerCase();
      if (!normalized || lower === "off" || lower === "none") return null;
      if (surroundChoiceKeys.has(normalized)) return normalized;
      const baseKey = stripSurroundSuffix(normalized);
      return surroundChoiceKeys.has(baseKey) ? baseKey : null;
    };
    let restoredMaster = normalizeSurroundChoiceModel(app == null ? void 0 : app.globalSurroundModel);
    if (!restoredMaster) {
      const surroundRoles = /* @__PURE__ */ new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);
      const inferred = (Array.isArray(placedSpeakers) ? placedSpeakers : []).find((speaker) => {
        const role = getCanonicalRole(speaker == null ? void 0 : speaker.role);
        const model = normalizeSurroundChoiceModel(speaker == null ? void 0 : speaker.model);
        return surroundRoles.has(role) && !!model;
      });
      restoredMaster = normalizeSurroundChoiceModel(inferred == null ? void 0 : inferred.model);
    }
    if (!restoredMaster) return;
    setSurroundConfig((prev) => {
      var _a2, _b2, _c2, _d, _e, _f, _g, _h, _i, _j;
      const currentMaster = String(((_a2 = prev == null ? void 0 : prev.value) == null ? void 0 : _a2.master) || "off");
      const nextMaster = restoredMaster;
      if (currentMaster === nextMaster) return prev;
      const next = {
        ...prev,
        value: {
          ...prev.value,
          master: nextMaster
        },
        override: {
          ...prev.override
        }
      };
      if (!((_b2 = prev == null ? void 0 : prev.override) == null ? void 0 : _b2.side) && (((_c2 = prev == null ? void 0 : prev.value) == null ? void 0 : _c2.side) === currentMaster || ((_d = prev == null ? void 0 : prev.value) == null ? void 0 : _d.side) === "off")) {
        next.value.side = nextMaster;
      }
      if (!((_e = prev == null ? void 0 : prev.override) == null ? void 0 : _e.rear) && (((_f = prev == null ? void 0 : prev.value) == null ? void 0 : _f.rear) === currentMaster || ((_g = prev == null ? void 0 : prev.value) == null ? void 0 : _g.rear) === "off")) {
        next.value.rear = nextMaster;
      }
      if (!((_h = prev == null ? void 0 : prev.override) == null ? void 0 : _h.wide) && (((_i = prev == null ? void 0 : prev.value) == null ? void 0 : _i.wide) === currentMaster || ((_j = prev == null ? void 0 : prev.value) == null ? void 0 : _j.wide) === "off")) {
        next.value.wide = nextMaster;
      }
      return next;
    });
  }, [app == null ? void 0 : app.globalSurroundModel, placedSpeakers, setSurroundConfig, sideModels, rearModels, wideModels]);
  const handleSurroundModelChange = reactExports.useCallback((config) => {
    var _a2, _b2, _c2, _d, _e, _f, _g;
    const safeConfig = {
      value: {
        master: String(((_a2 = config == null ? void 0 : config.value) == null ? void 0 : _a2.master) || "off"),
        side: String(((_b2 = config == null ? void 0 : config.value) == null ? void 0 : _b2.side) || "off"),
        rear: String(((_c2 = config == null ? void 0 : config.value) == null ? void 0 : _c2.rear) || "off"),
        wide: String(((_d = config == null ? void 0 : config.value) == null ? void 0 : _d.wide) || "off")
      },
      override: {
        side: !!((_e = config == null ? void 0 : config.override) == null ? void 0 : _e.side),
        rear: !!((_f = config == null ? void 0 : config.override) == null ? void 0 : _f.rear),
        wide: !!((_g = config == null ? void 0 : config.override) == null ? void 0 : _g.wide)
      }
    };
    setSurroundConfig(safeConfig);
    const modelKeyRaw = safeConfig.value.master;
    let modelKey = String(modelKeyRaw || "").trim();
    modelKey = normaliseModelKey(modelKey);
    const modelKeyLower = modelKey.toLowerCase();
    const resolveGroupModel = (groupVal, groupOverride) => {
      if (!groupOverride) return modelKey;
      const raw = String(groupVal || "").trim();
      const norm = normaliseModelKey(raw);
      const lower = norm.toLowerCase();
      if (!norm || lower === "off" || lower === "none") return modelKey;
      return norm;
    };
    const sideModel = resolveGroupModel(safeConfig.value.side, safeConfig.override.side);
    const rearModel = resolveGroupModel(safeConfig.value.rear, safeConfig.override.rear);
    const wideModel = resolveGroupModel(safeConfig.value.wide, safeConfig.override.wide);
    const roleModelMap = {
      SL: sideModel,
      SR: sideModel,
      SBL: rearModel,
      SBR: rearModel,
      LW: wideModel,
      RW: wideModel
    };
    if (app && typeof app.setGlobalSurroundModel === "function") {
      app.setGlobalSurroundModel(modelKeyLower === "off" ? "off" : modelKey);
    }
    if (globalThis.__B44_LOGS) {
      console.log("[SP handleSurroundModelChange]", { modelKey, sideModel, rearModel, wideModel, effectivePreset, useWides });
    }
    setSpeakers((prev) => {
      const layout = String(effectivePreset || "5.1").split(" ")[0].split("_")[0];
      const layoutMajor = parseInt(String(layout || "5.1").split(".")[0], 10) || 5;
      const useWidesInsteadOfRearsForThisLayout = layoutMajor === 7 ? !!useWides : false;
      const layoutRoles = rolesForLayout({
        dolbyLayout: layout,
        useWidesInsteadOfRears: useWidesInsteadOfRearsForThisLayout
      }).filter((r) => ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(r));
      const byRole = /* @__PURE__ */ new Map();
      for (const s of Array.isArray(prev) ? prev : []) {
        byRole.set(getCanonicalRole(s.role), s);
      }
      for (const role of layoutRoles) {
        if (!byRole.has(role)) {
          byRole.set(role, {
            id: `${role.toLowerCase()}-${timeNowMs()}`,
            role,
            label: role,
            model: null,
            position: null,
            rotation: { x: 0, y: 0, z: 0 },
            draggable: true
          });
        }
      }
      for (const role of ["SL", "SR", "SBL", "SBR", "LW", "RW"]) {
        if (!layoutRoles.includes(role)) byRole.delete(role);
      }
      if (!modelKey || modelKeyLower === "off" || modelKeyLower === "none") {
        const result = Array.from(byRole.values()).map((s) => {
          const canon = getCanonicalRole(s.role);
          if (!["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) return s;
          return { ...s, model: null };
        });
        if (needsSurroundResetRef) needsSurroundResetRef.current = false;
        if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = null;
        if (globalThis.__B44_LOGS) {
          console.log(
            "[SP] Surrounds OFF -> kept stubs:",
            result.filter((s) => ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(getCanonicalRole(s.role))).map((s) => ({ role: s.role, model: s.model }))
          );
        }
        return result;
      }
      const draft = Array.from(byRole.values()).map((s) => {
        const canon = getCanonicalRole(s.role);
        if (!layoutRoles.includes(canon)) return s;
        const resolvedModel = roleModelMap[canon] || modelKey;
        return { ...s, model: resolvedModel };
      });
      if (needsSurroundResetRef) needsSurroundResetRef.current = true;
      if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = modelKey;
      if (globalThis.__B44_LOGS) {
        console.log(
          "[SP] Surrounds ON -> draft:",
          draft.filter((s) => ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(getCanonicalRole(s.role))).map((s) => ({ role: s.role, model: s.model, pos: s.position }))
        );
      }
      const hydrated = resetSurroundPositions(
        effectivePreset,
        mlpPoint,
        dimsSafe,
        draft,
        modelKey
      );
      return Array.isArray(hydrated) && hydrated.length ? hydrated : draft;
    });
  }, [
    app,
    setSurroundConfig,
    setSpeakers,
    effectivePreset,
    useWides,
    mlpPoint,
    dimsSafe,
    resetSurroundPositions,
    needsSurroundResetRef,
    lastSurroundModelKeyRef
  ]);
  const surroundChoices = reactExports.useMemo(() => {
    const activeGroups = [];
    if (canSides) activeGroups.push(sideModels);
    if (canRears) activeGroups.push(rearModels);
    if (canWides) activeGroups.push(wideModels);
    const groups = activeGroups.length ? activeGroups : [sideModels];
    const allowedByEveryActiveRole = groups[0].filter(
      (model) => groups.every((group) => group.some((candidate) => candidate.key === model.key))
    );
    return [
      { value: "off", label: "Off" },
      ...allowedByEveryActiveRole.map((model) => ({ value: model.key, label: model.label }))
    ];
  }, [canSides, canRears, canWides, sideModels, rearModels, wideModels]);
  const sideChoices = reactExports.useMemo(() => sideModels.map((model) => ({ value: model.key, label: model.label })), [sideModels]);
  const rearChoices = reactExports.useMemo(() => rearModels.map((model) => ({ value: model.key, label: model.label })), [rearModels]);
  const wideChoices = reactExports.useMemo(() => wideModels.map((model) => ({ value: model.key, label: model.label })), [wideModels]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 p-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      SurroundsSelector,
      {
        layout: dolbyPreset,
        choices: surroundChoices,
        sideChoices,
        rearChoices,
        wideChoices,
        value: surroundConfig.value,
        override: surroundConfig.override,
        onChange: handleSurroundModelChange,
        activeRoles,
        disabled,
        extraSurroundCount: safeExtraSurroundCount,
        onExtraSurroundCountChange: safeOnExtraSurroundCountChange,
        allowExtraSurrounds: safeAllowExtraSurrounds
      }
    ),
    (canSides || canRears || canWides) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 border-t border-[#E6E4DD] pt-3 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#625143]", children: "RP22 Auto: acoustic centre at or slightly above listener ear plane, raised only where needed for acoustic clearance." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        canSides && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs font-medium text-[#3E4349]", children: "Side Surround Height" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                step: "0.01",
                min: "0.80",
                max: roomHeight ? (roomHeight - 0.3).toFixed(2) : 2.5,
                value: ((_a = surroundHeightConfig == null ? void 0 : surroundHeightConfig.side) == null ? void 0 : _a.mode) === "manual" ? surroundHeightConfig.side.value ?? autoSurroundHeight ?? 1.2 : Number.isFinite(autoSurroundHeight) ? Number(autoSurroundHeight.toFixed(2)) : 1.2,
                onChange: (e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setSurroundHeightConfig == null ? void 0 : setSurroundHeightConfig((prev) => ({ ...prev, side: { mode: "manual", value: v } }));
                },
                disabled,
                className: "pr-8 bg-white text-[#1B1A1A]"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none", children: "m" })
          ] })
        ] }),
        canRears && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs font-medium text-[#3E4349]", children: "Rear Surround Height" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                step: "0.01",
                min: "0.80",
                max: roomHeight ? (roomHeight - 0.3).toFixed(2) : 2.5,
                value: ((_b = surroundHeightConfig == null ? void 0 : surroundHeightConfig.rear) == null ? void 0 : _b.mode) === "manual" ? surroundHeightConfig.rear.value ?? autoSurroundHeight ?? 1.2 : Number.isFinite(autoSurroundHeight) ? Number(autoSurroundHeight.toFixed(2)) : 1.2,
                onChange: (e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setSurroundHeightConfig == null ? void 0 : setSurroundHeightConfig((prev) => ({ ...prev, rear: { mode: "manual", value: v } }));
                },
                disabled,
                className: "pr-8 bg-white text-[#1B1A1A]"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none", children: "m" })
          ] })
        ] }),
        canWides && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs font-medium text-[#3E4349]", children: "Front Wide Height" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                step: "0.01",
                min: "0.80",
                max: roomHeight ? (roomHeight - 0.3).toFixed(2) : 2.5,
                value: ((_c = surroundHeightConfig == null ? void 0 : surroundHeightConfig.wide) == null ? void 0 : _c.mode) === "manual" ? surroundHeightConfig.wide.value ?? autoSurroundHeight ?? 1.25 : Number.isFinite(autoSurroundHeight) ? Number(autoSurroundHeight.toFixed(2)) : 1.25,
                onChange: (e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setSurroundHeightConfig == null ? void 0 : setSurroundHeightConfig((prev) => ({ ...prev, wide: { mode: "manual", value: v } }));
                },
                disabled,
                className: "pr-8 bg-white text-[#1B1A1A]"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none", children: "m" })
          ] })
        ] })
      ] })
    ] })
  ] });
}
function HeightInput({ value, onChange, min = 0, max = 2.5, step = 0.01, className = "", disabled = false }) {
  const [draft, setDraft] = reactExports.useState(null);
  const displayValue = draft !== null ? draft : Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Input,
    {
      type: "number",
      min,
      max,
      step,
      disabled,
      value: displayValue,
      className,
      onFocus: () => setDraft(String(value ?? "")),
      onChange: (e) => {
        setDraft(e.target.value);
        const raw = Number(e.target.value);
        if (Number.isFinite(raw)) onChange(raw);
      },
      onBlur: () => setDraft(null)
    }
  );
}
const MODEL_SELECT_TRIGGER_CLASS = "w-full bg-white border-[#DCDBD6] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]";
const MODEL_SELECT_LABEL_CLASS = "text-sm font-medium text-[#3E4349]";
const MODEL_VALUE_TEXT_CLASS = "text-2xl font-semibold";
const MODEL_VALUE_COLOR = "#213428";
const MODEL_VALUE_MUTED_COLOR = "#9B9890";
function ModelSelectTrigger({ className, children, ...rest }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: cn(MODEL_SELECT_TRIGGER_CLASS, className), ...rest, children });
}
function ModelValueText({ muted = false, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: MODEL_VALUE_TEXT_CLASS,
      style: { color: muted ? MODEL_VALUE_MUTED_COLOR : MODEL_VALUE_COLOR },
      children
    }
  );
}
function ModelSelectLabel({ className, children, ...rest }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn(MODEL_SELECT_LABEL_CLASS, className), ...rest, children });
}
function rectsOverlap$1(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
function hasFrontLcrSubClash$1({ speakers, frontSubs, frontSubsCfg }) {
  const lcrRoles = /* @__PURE__ */ new Set(["FL", "FC", "FR", "FCL", "FCR"]);
  const lcrRects = (Array.isArray(speakers) ? speakers : []).filter((speaker) => lcrRoles.has(getCanonicalRole(speaker == null ? void 0 : speaker.role))).map((speaker) => {
    var _a, _b;
    const x = Number((_a = speaker == null ? void 0 : speaker.position) == null ? void 0 : _a.x);
    const z = Number((_b = speaker == null ? void 0 : speaker.position) == null ? void 0 : _b.z);
    const meta = getSpeakerModelMeta(speaker == null ? void 0 : speaker.model);
    const width = Number(meta == null ? void 0 : meta.widthM);
    const height = Number(meta == null ? void 0 : meta.heightM);
    if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { left: x - width / 2, right: x + width / 2, bottom: z - height / 2, top: z + height / 2 };
  }).filter(Boolean);
  const frontSubRects = (Array.isArray(frontSubs) ? frontSubs : []).filter((sub) => (sub == null ? void 0 : sub.group) === "front" || String((sub == null ? void 0 : sub.role) || "").toUpperCase().startsWith("SUBF")).map((sub) => {
    var _a;
    const x = Number.isFinite(Number((_a = sub == null ? void 0 : sub.position) == null ? void 0 : _a.x)) ? Number(sub.position.x) : Number(sub == null ? void 0 : sub.x);
    const bottom = Number.isFinite(Number(sub == null ? void 0 : sub.bottomHeightM)) ? Number(sub.bottomHeightM) : Number.isFinite(Number(frontSubsCfg == null ? void 0 : frontSubsCfg.bottomHeightM)) ? Number(frontSubsCfg.bottomHeightM) : 0.05;
    const model = (sub == null ? void 0 : sub.model) || (frontSubsCfg == null ? void 0 : frontSubsCfg.model);
    const orientation = (sub == null ? void 0 : sub.orientation) || (frontSubsCfg == null ? void 0 : frontSubsCfg.orientation);
    const meta = getSpeakerModelMeta(model, orientation);
    const width = Number(meta == null ? void 0 : meta.widthM);
    const height = Number(meta == null ? void 0 : meta.heightM);
    if (![x, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { left: x - width / 2, right: x + width / 2, bottom, top: bottom + height };
  }).filter(Boolean);
  if (lcrRects.length === 0 || frontSubRects.length === 0) return false;
  return lcrRects.some((lcrRect) => frontSubRects.some((subRect) => rectsOverlap$1(lcrRect, subRect)));
}
function SubwooferPanel({ appState, disabled, frontSubsCfg, rearSubsCfg, subWarnings, noWrapper = false }) {
  var _a, _b, _c;
  appState == null ? void 0 : appState.roomDims;
  appState == null ? void 0 : appState.seatingPositions;
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  const hasLcrSubClash = reactExports.useMemo(() => {
    var _a2;
    return hasFrontLcrSubClash$1({
      speakers: (_a2 = appState == null ? void 0 : appState.speakerSystem) == null ? void 0 : _a2.placedSpeakers,
      frontSubs: appState == null ? void 0 : appState.subwoofers,
      frontSubsCfg
    });
  }, [(_a = appState == null ? void 0 : appState.speakerSystem) == null ? void 0 : _a.placedSpeakers, appState == null ? void 0 : appState.subwoofers, frontSubsCfg]);
  const innerContent = /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-none border border-[#E7E4DF] bg-[#F7F4F0]/40 px-4 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-12 gap-x-4 gap-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 md:col-span-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[15px] font-semibold text-[#1B1A1A] mb-2", children: "Front Subwoofers" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-12 items-end gap-x-3 gap-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectLabel, { className: "col-span-7", children: "Model" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectLabel, { className: "col-span-5", children: "Quantity" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "col-span-7", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: compat.frontModelDisplay ?? void 0,
            disabled: disabled || !compat.hasCanonicalInstances,
            onValueChange: (model) => {
              if (model === "__mixed__") return;
              compat.setFrontSubModel(model);
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ModelValueText, { muted: !compat.frontModelDisplay, children: compat.frontModelDisplay ? compat.frontModelDisplay === "__mixed__" ? "Mixed" : subwooferDisplayLabel(compat.frontModelDisplay) : "Select subwoofer model" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__mixed__", disabled: true, children: "Mixed" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "sub2-12", children: subwooferDisplayLabel("sub2-12") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "sub3-12", children: subwooferDisplayLabel("sub3-12") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "sub4-12", children: subwooferDisplayLabel("sub4-12") })
              ] })
            ]
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "col-span-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: String(compat.frontCount ?? 0),
            disabled: disabled || !compat.hasCanonicalInstances,
            onValueChange: (v) => {
              compat.setFrontSubCount(Number(v));
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectTrigger, { className: "w-[90px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ModelValueText, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "0" }) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "0", children: "0" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "1", children: "1" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "2", children: "2" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "3", children: "3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "4", children: "4" })
              ] })
            ]
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 mt-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[12px] text-[#625143] mb-1", children: "Sub bottom height (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            HeightInput,
            {
              value: (frontSubsCfg == null ? void 0 : frontSubsCfg.bottomHeightM) ?? ((frontSubsCfg == null ? void 0 : frontSubsCfg.mountMode) === "wall" ? 0.8 : 0.05),
              disabled: disabled || !compat.hasCanonicalInstances,
              onChange: (raw) => {
                const clamped = Math.max(0, Math.min(2.5, raw));
                compat.setFrontBottomHeight(clamped);
              },
              className: "h-10 w-full bg-white border-[#DCDBD6]"
            }
          ),
          hasLcrSubClash && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs font-medium text-red-600", children: "⚠ Speaker and subwoofer clashing" })
        ] })
      ] }),
      subwooferModelKey(frontSubsCfg == null ? void 0 : frontSubsCfg.model) === "sub4-12" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 mt-3 flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "shrink-0 text-[12px] text-[#625143]", children: "Orientation" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative z-10 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: !compat.hasCanonicalInstances,
              onClick: () => compat.setFrontOrientation("vertical"),
              className: `cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${((frontSubsCfg == null ? void 0 : frontSubsCfg.orientation) ?? "vertical") === "vertical" ? "bg-[#213428] text-white border-[#213428]" : "bg-white text-[#213428] border-[#DCDBD6]"}`,
              children: "Vertical"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: !compat.hasCanonicalInstances,
              onClick: () => compat.setFrontOrientation("horizontal"),
              className: `cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${((frontSubsCfg == null ? void 0 : frontSubsCfg.orientation) ?? "vertical") === "horizontal" ? "bg-[#213428] text-white border-[#213428]" : "bg-white text-[#213428] border-[#DCDBD6]"}`,
              children: "Horizontal"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-2 mt-1 border-t border-[#DCDBD6] space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] font-medium text-[#1B1A1A]", children: "Lock screen position" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#625143] leading-tight", children: "Keeps the screen at its current depth even if subwoofer position changes." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: !!(appState == null ? void 0 : appState.screenPlaneLocked),
              onCheckedChange: (checked) => {
                if (checked) {
                  const live = appState == null ? void 0 : appState.screenFrontPlaneM;
                  if (Number.isFinite(live)) appState.setLockedScreenFrontPlaneM(live);
                  appState.setScreenPlaneLocked(true);
                } else {
                  appState.setScreenPlaneLocked(false);
                }
              }
            }
          )
        ] }),
        (appState == null ? void 0 : appState.screenPlaneLocked) && Number.isFinite(appState == null ? void 0 : appState.lockedScreenFrontPlaneM) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] text-[#213428] font-medium", children: [
          "Locked at ",
          (appState.lockedScreenFrontPlaneM * 100).toFixed(1),
          " cm"
        ] })
      ] }),
      ((_b = subWarnings == null ? void 0 : subWarnings.front) == null ? void 0 : _b.length) > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200", children: subWarnings.front[0] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 md:col-span-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[15px] font-semibold text-[#1B1A1A] mb-2", children: "Rear Subwoofers" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-12 items-end gap-x-3 gap-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectLabel, { className: "col-span-7", children: "Model" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectLabel, { className: "col-span-5", children: "Quantity" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "col-span-7", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: compat.rearModelDisplay ?? void 0,
            disabled: disabled || !compat.hasCanonicalInstances,
            onValueChange: (model) => {
              if (model === "__mixed__") return;
              compat.setRearSubModel(model);
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ModelValueText, { muted: !compat.rearModelDisplay, children: compat.rearModelDisplay ? compat.rearModelDisplay === "__mixed__" ? "Mixed" : subwooferDisplayLabel(compat.rearModelDisplay) : "Select subwoofer model" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__mixed__", disabled: true, children: "Mixed" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "sub2-12", children: subwooferDisplayLabel("sub2-12") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "sub3-12", children: subwooferDisplayLabel("sub3-12") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "sub4-12", children: subwooferDisplayLabel("sub4-12") })
              ] })
            ]
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "col-span-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: String(compat.rearCount ?? 0),
            disabled: disabled || !compat.hasCanonicalInstances,
            onValueChange: (v) => {
              compat.setRearSubCount(Number(v));
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectTrigger, { className: "w-[90px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ModelValueText, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "0" }) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { align: "end", className: "w-[64px]", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "0", children: "0" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "1", children: "1" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "2", children: "2" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "3", children: "3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "4", children: "4" })
              ] })
            ]
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 mt-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[12px] text-[#625143] mb-1", children: "Sub bottom height (m)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            HeightInput,
            {
              value: (rearSubsCfg == null ? void 0 : rearSubsCfg.bottomHeightM) ?? ((rearSubsCfg == null ? void 0 : rearSubsCfg.mountMode) === "wall" ? 0.8 : 0.05),
              disabled: disabled || !compat.hasCanonicalInstances,
              onChange: (raw) => {
                const clamped = Math.max(0, Math.min(2.5, raw));
                compat.setRearBottomHeight(clamped);
              },
              className: "h-10 w-full bg-white border-[#DCDBD6]"
            }
          )
        ] })
      ] }),
      subwooferModelKey(rearSubsCfg == null ? void 0 : rearSubsCfg.model) === "sub4-12" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 mt-3 flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "shrink-0 text-[12px] text-[#625143]", children: "Orientation" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative z-10 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: !compat.hasCanonicalInstances,
              onClick: () => compat.setRearOrientation("vertical"),
              className: `cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${((rearSubsCfg == null ? void 0 : rearSubsCfg.orientation) ?? "vertical") === "vertical" ? "bg-[#213428] text-white border-[#213428]" : "bg-white text-[#213428] border-[#DCDBD6]"}`,
              children: "Vertical"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: !compat.hasCanonicalInstances,
              onClick: () => compat.setRearOrientation("horizontal"),
              className: `cursor-pointer pointer-events-auto relative z-10 shrink-0 px-3 py-1 text-[12px] rounded border ${((rearSubsCfg == null ? void 0 : rearSubsCfg.orientation) ?? "vertical") === "horizontal" ? "bg-[#213428] text-white border-[#213428]" : "bg-white text-[#213428] border-[#DCDBD6]"}`,
              children: "Horizontal"
            }
          )
        ] })
      ] }),
      ((_c = subWarnings == null ? void 0 : subWarnings.rear) == null ? void 0 : _c.length) > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200", children: subWarnings.rear[0] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "col-span-12 mt-4 border-t border-[#DCDBD6] pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h5", { className: "text-[14px] font-semibold text-[#1B1A1A]", children: "Show Room Mode Guide" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#625143] leading-relaxed mt-1", children: "Shows the approximate node positions of the first axial room modes. These are design guides, not predicted bass nulls." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Switch,
          {
            checked: !!(appState == null ? void 0 : appState.showRoomModesOverlay),
            onCheckedChange: (checked) => {
              var _a2;
              return (_a2 = appState == null ? void 0 : appState.setShowRoomModesOverlay) == null ? void 0 : _a2.call(appState, checked);
            }
          }
        )
      ] }),
      (appState == null ? void 0 : appState.showRoomModesOverlay) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-lg border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h6", { className: "text-[12px] font-semibold text-[#1B1A1A] mb-1.5", children: "Understanding Room Modes" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#625143] leading-relaxed mb-2", children: "Room modes are natural low-frequency pressure patterns created by the room dimensions. The shaded guides show positions that may be more sensitive to individual axial modes. They do not mean that every seat within these areas will experience a bass null." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#625143] leading-relaxed mb-2", children: "The final bass response is determined by the combination of all active subwoofers, their positions, the seating positions and the interaction of multiple room modes. Use this guide alongside the predicted bass response when comparing layouts." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium text-[#1B1A1A] leading-relaxed mb-0.5", children: "Design principle:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#625143] leading-relaxed", children: "Multiple subwoofers in complementary locations can significantly improve bass consistency across the seating area. Deep cancellations are normally addressed through subwoofer or seating placement rather than large EQ boosts." })
      ] })
    ] }) })
  ] }) });
  if (noWrapper) return innerContent;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsiblePanel, { title: "Subwoofers", defaultOpen: false, children: innerContent });
}
function OverheadChannelSelector({
  overheadCount,
  globalModel,
  onGlobalModelChange,
  frontOverride,
  midOverride,
  rearOverride,
  onFrontOverrideChange,
  onMidOverrideChange,
  onRearOverrideChange,
  useFrontGlobal,
  useMidGlobal,
  useRearGlobal,
  onUseFrontGlobalChange,
  onUseMidGlobalChange,
  onUseRearGlobalChange,
  disabled
}) {
  const [showIndividualOverheads, setShowIndividualOverheads] = reactExports.useState(false);
  const { options: overheadModels } = useProductRoleOptions(PRODUCT_ROLES.OVERHEAD);
  const showFront = overheadCount === 4 || overheadCount === 6;
  const showMid = overheadCount === 2 || overheadCount === 6;
  const showRear = overheadCount === 4 || overheadCount === 6;
  const isOff = !globalModel || globalModel === "OFF";
  const rowsDisabled = disabled || isOff;
  const getModelLabel = (modelKey) => {
    if (!modelKey || modelKey === "OFF") return "OFF — (no overheads active)";
    const product = overheadModels.find((m) => m.key === modelKey);
    if (product == null ? void 0 : product.label) return product.label;
    const meta = getSpeakerModelMeta(modelKey);
    return (meta == null ? void 0 : meta.label) && !meta.notFound ? meta.label : modelKey;
  };
  if (overheadCount === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 italic", children: "No overhead channels in current system configuration." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectLabel, { children: "Overhead Model (All)" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Select,
        {
          value: globalModel || "OFF",
          onValueChange: (val) => onGlobalModelChange(val === "OFF" ? null : val),
          disabled,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ModelSelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ModelValueText, { muted: isOff, children: isOff ? "Select overhead model" : getModelLabel(globalModel) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { className: "bg-white border-[#DCDBD6]", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "OFF", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: "OFF — (no overheads active)" }),
              overheadModels.map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.key, className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: model.label }, model.key))
            ] })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#625143]", children: "Applies to all overheads unless overridden." }),
      !isOff && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setShowIndividualOverheads((v) => !v),
          style: {
            marginTop: 4,
            marginBottom: 8,
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 13,
            fontStyle: "italic",
            textDecoration: "underline",
            color: "#625143"
          },
          children: showIndividualOverheads ? "Hide individual control" : "Individual Control"
        }
      )
    ] }),
    showIndividualOverheads && !isOff && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-[#E5E5E5]" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        showFront && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Front Overhead" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-[#625143]", children: "Use Global" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Switch,
                {
                  checked: !!useFrontGlobal,
                  onCheckedChange: (next) => {
                    if (typeof onUseFrontGlobalChange === "function") onUseFrontGlobalChange(!!next);
                  },
                  disabled: rowsDisabled
                }
              )
            ] })
          ] }),
          !useFrontGlobal ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: frontOverride,
              onValueChange: (val) => {
                onFrontOverrideChange(val);
                onUseFrontGlobalChange(false);
              },
              disabled: rowsDisabled,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: overheadModels.map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.key, className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: model.label }, model.key)) })
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-[#625143] italic", children: [
            "Using: ",
            getModelLabel(globalModel)
          ] })
        ] }),
        showMid && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Mid Overhead" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-[#625143]", children: "Use Global" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Switch,
                {
                  checked: !!useMidGlobal,
                  onCheckedChange: (next) => {
                    if (typeof onUseMidGlobalChange === "function") onUseMidGlobalChange(!!next);
                  },
                  disabled: rowsDisabled
                }
              )
            ] })
          ] }),
          !useMidGlobal ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: midOverride,
              onValueChange: (val) => {
                onMidOverrideChange(val);
                onUseMidGlobalChange(false);
              },
              disabled: rowsDisabled,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: overheadModels.map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.key, className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: model.label }, model.key)) })
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-[#625143] italic", children: [
            "Using: ",
            getModelLabel(globalModel)
          ] })
        ] }),
        showRear && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#3E4349]", children: "Rear Overhead" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-[#625143]", children: "Use Global" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Switch,
                {
                  checked: !!useRearGlobal,
                  onCheckedChange: (next) => {
                    if (typeof onUseRearGlobalChange === "function") onUseRearGlobalChange(!!next);
                  },
                  disabled: rowsDisabled
                }
              )
            ] })
          ] }),
          !useRearGlobal ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: rearOverride,
              onValueChange: (val) => {
                onRearOverrideChange(val);
                onUseRearGlobalChange(false);
              },
              disabled: rowsDisabled,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-full bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: overheadModels.map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.key, className: "text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", children: model.label }, model.key)) })
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-[#625143] italic", children: [
            "Using: ",
            getModelLabel(globalModel)
          ] })
        ] })
      ] })
    ] })
  ] });
}
function OverheadSplStrip({ allSeatSplMetrics, mlpSeat, dolbyLayout }) {
  const mlpSplData = reactExports.useMemo(() => {
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = allSeatSplMetrics.get("mlp");
    if (mlpMetrics == null ? void 0 : mlpMetrics.spl) return mlpMetrics.spl;
    if (mlpSeat == null ? void 0 : mlpSeat.id) {
      const metrics = allSeatSplMetrics.get(mlpSeat.id);
      return (metrics == null ? void 0 : metrics.spl) || null;
    }
    return null;
  }, [allSeatSplMetrics, mlpSeat == null ? void 0 : mlpSeat.id]);
  const groups = reactExports.useMemo(() => {
    if (!dolbyLayout) return [];
    const parts = String(dolbyLayout).split(".");
    const heights = parts.length >= 3 ? Number(parts[2]) || 0 : 0;
    if (heights === 0) return [];
    const result = [];
    if (heights === 2) {
      result.push({
        key: "mid",
        label: "Top Middle",
        roles: ["TL", "TR", "TML", "TMR"]
      });
    }
    if (heights === 4) {
      result.push({
        key: "front",
        label: "Upper Front",
        roles: ["TFL", "TFR", "TFC"]
      });
      result.push({
        key: "rear",
        label: "Upper Rear",
        roles: ["TRL", "TRR", "TBL", "TBR", "TBC"]
      });
    }
    if (heights === 6) {
      result.push({
        key: "front",
        label: "Upper Front",
        roles: ["TFL", "TFR", "TFC"]
      });
      result.push({
        key: "mid",
        label: "Top Middle",
        roles: ["TL", "TR", "TML", "TMR"]
      });
      result.push({
        key: "rear",
        label: "Upper Rear",
        roles: ["TRL", "TRR", "TBL", "TBR", "TBC"]
      });
    }
    return result;
  }, [dolbyLayout]);
  const groupSplValues = reactExports.useMemo(() => {
    if (!(mlpSplData == null ? void 0 : mlpSplData.uppers)) return {};
    const result = {};
    for (const group of groups) {
      const splValues = group.roles.map((role) => {
        var _a;
        return (_a = mlpSplData.uppers[role]) == null ? void 0 : _a.value;
      }).filter(Number.isFinite);
      if (splValues.length > 0) {
        result[group.key] = Math.max(...splValues);
      }
    }
    return result;
  }, [mlpSplData, groups]);
  if (!mlpSeat || groups.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-medium text-[#625143] mb-2", children: "SPL @ RSP" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-2", children: groups.map((group) => {
      const splValue = groupSplValues[group.key];
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "bg-white", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardHeader, { className: "pb-2 pt-3 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "text-xs font-medium flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Volume2, { className: "w-3 h-3", style: { color: "#625143" } }),
          group.label
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "px-3 pb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold", style: { color: "#1B1A1A" }, children: formatDb(splValue) }) })
      ] }, group.key);
    }) })
  ] });
}
function RP22LabelledLevelPill({ label, level }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        marginTop: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap"
      },
      children: [
        label ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 13, fontWeight: 600, color: "#3E4349" }, children: label }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx(RP22GradingPill, { level: level == null ? "FAIL" : level })
      ]
    }
  );
}
const P13_THRESHOLDS_REC$1 = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_MIN$1 = { L1: 96, L2: 99, L3: 102, L4: 105 };
function computeRP22Level$2(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return "FAIL";
}
function OverheadChannelsPanel({
  overheadCount,
  overheadGlobalModel,
  setOverheadGlobalModel,
  overheadFrontOverride,
  setOverheadFrontOverride,
  overheadMidOverride,
  setOverheadMidOverride,
  overheadRearOverride,
  setOverheadRearOverride,
  useFrontGlobal,
  setUseFrontGlobal,
  useMidGlobal,
  setUseMidGlobal,
  useRearGlobal,
  setUseRearGlobal,
  disabled,
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  effectivePreset,
  allSeatSplMetrics,
  mlpSeat
}) {
  const appState = useAppState() || {};
  const { splConfig = {}, updateGlobalSpl } = appState;
  const [overheadsPowerInputValue, setOverheadsPowerInputValue] = reactExports.useState(String((splConfig == null ? void 0 : splConfig.overheadsW) ?? 100));
  reactExports.useEffect(() => {
    setOverheadsPowerInputValue(String((splConfig == null ? void 0 : splConfig.overheadsW) || 100));
  }, [splConfig == null ? void 0 : splConfig.overheadsW]);
  const selection = {
    globalModel: overheadGlobalModel,
    frontOverride: overheadFrontOverride,
    midOverride: overheadMidOverride,
    rearOverride: overheadRearOverride,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal
  };
  const applyOverheadSelection = reactExports.useCallback((next) => {
    if (typeof setSpeakers !== "function") return;
    const roles = getTargetOverheadIds(effectivePreset);
    if (!roles.length) return;
    setSpeakers((prev) => assignModelsForRoles(
      Array.isArray(prev) ? prev : [],
      roles,
      (role) => resolveOverheadModelForRole(role, next)
    ));
  }, [setSpeakers, effectivePreset]);
  const handleGlobalModelChange = (model) => {
    setOverheadGlobalModel(model);
    applyOverheadSelection({ ...selection, globalModel: model });
  };
  const handleFrontOverrideChange = (model) => {
    setOverheadFrontOverride(model);
    setUseFrontGlobal(false);
    applyOverheadSelection({ ...selection, frontOverride: model, useFrontGlobal: false });
  };
  const handleMidOverrideChange = (model) => {
    setOverheadMidOverride(model);
    setUseMidGlobal(false);
    applyOverheadSelection({ ...selection, midOverride: model, useMidGlobal: false });
  };
  const handleRearOverrideChange = (model) => {
    setOverheadRearOverride(model);
    setUseRearGlobal(false);
    applyOverheadSelection({ ...selection, rearOverride: model, useRearGlobal: false });
  };
  const handleUseFrontGlobalChange = (next) => {
    setUseFrontGlobal(next);
    applyOverheadSelection({ ...selection, useFrontGlobal: next });
  };
  const handleUseMidGlobalChange = (next) => {
    setUseMidGlobal(next);
    applyOverheadSelection({ ...selection, useMidGlobal: next });
  };
  const handleUseRearGlobalChange = (next) => {
    setUseRearGlobal(next);
    applyOverheadSelection({ ...selection, useRearGlobal: next });
  };
  if (overheadCount === 0) return null;
  const p13Pill = (() => {
    var _a;
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = allSeatSplMetrics.get("mlp");
    const seatMetrics = mlpMetrics || (mlpSeat ? allSeatSplMetrics.get(mlpSeat.id) : null);
    if (!((_a = seatMetrics == null ? void 0 : seatMetrics.spl) == null ? void 0 : _a.uppers)) return null;
    const overheadTileSplDb = Object.values(seatMetrics.spl.uppers).map((s) => s == null ? void 0 : s.value).filter((v) => Number.isFinite(v)).map((v) => Math.ceil(v));
    if (overheadTileSplDb.length === 0) return null;
    const pillBasisDb = Math.min(...overheadTileSplDb);
    const isMinimumMode = (splConfig == null ? void 0 : splConfig.p13Mode) === "minimum" || !(splConfig == null ? void 0 : splConfig.p13Mode);
    const thresholds = isMinimumMode ? P13_THRESHOLDS_MIN$1 : P13_THRESHOLDS_REC$1;
    const level = computeRP22Level$2(pillBasisDb, thresholds);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(RP22LabelledLevelPill, { level, label: "RP22 P13 (Overheads)" });
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsiblePanel, { title: "Overhead Channels", defaultOpen: false, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      OverheadChannelSelector,
      {
        overheadCount,
        globalModel: overheadGlobalModel,
        onGlobalModelChange: handleGlobalModelChange,
        frontOverride: overheadFrontOverride,
        midOverride: overheadMidOverride,
        rearOverride: overheadRearOverride,
        onFrontOverrideChange: handleFrontOverrideChange,
        onMidOverrideChange: handleMidOverrideChange,
        onRearOverrideChange: handleRearOverrideChange,
        useFrontGlobal,
        useMidGlobal,
        useRearGlobal,
        onUseFrontGlobalChange: handleUseFrontGlobalChange,
        onUseMidGlobalChange: handleUseMidGlobalChange,
        onUseRearGlobalChange: handleUseRearGlobalChange,
        disabled
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        OverheadSplStrip,
        {
          allSeatSplMetrics,
          mlpSeat,
          dolbyLayout: effectivePreset
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: "Amplifier Power (Overheads)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "text",
              inputMode: "numeric",
              pattern: "[0-9]*",
              value: overheadsPowerInputValue,
              onChange: (e) => {
                const newValue = e.target.value;
                if (newValue !== "" && !/^\d+$/.test(newValue)) return;
                setOverheadsPowerInputValue(newValue);
                if (newValue === "") return;
                const val = parseInt(newValue, 10);
                if (Number.isFinite(val) && val >= 1 && val <= 5e3) {
                  updateGlobalSpl == null ? void 0 : updateGlobalSpl({ overheadsW: val });
                }
              },
              onBlur: (e) => {
                const val = parseInt(e.target.value, 10);
                if (!Number.isFinite(val) || val < 1 || val > 5e3) {
                  setOverheadsPowerInputValue(String((splConfig == null ? void 0 : splConfig.overheadsW) || 100));
                } else {
                  const clamped = Math.max(1, Math.min(5e3, val));
                  setOverheadsPowerInputValue(String(clamped));
                  if (clamped !== ((splConfig == null ? void 0 : splConfig.overheadsW) || 100)) {
                    updateGlobalSpl == null ? void 0 : updateGlobalSpl({ overheadsW: clamped });
                  }
                }
              },
              disabled,
              className: "pr-8"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none", children: "W" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: "Parameter 13. Non-screen speakers SPL capability at RSP" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: (splConfig == null ? void 0 : splConfig.p13Mode) === "minimum" || !(splConfig == null ? void 0 : splConfig.p13Mode) ? "default" : "outline",
              className: (splConfig == null ? void 0 : splConfig.p13Mode) === "minimum" || !(splConfig == null ? void 0 : splConfig.p13Mode) ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
              onClick: () => updateGlobalSpl == null ? void 0 : updateGlobalSpl({ p13Mode: "minimum" }),
              disabled,
              children: "Minimum"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: (splConfig == null ? void 0 : splConfig.p13Mode) === "recommended" ? "default" : "outline",
              className: (splConfig == null ? void 0 : splConfig.p13Mode) === "recommended" ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
              onClick: () => updateGlobalSpl == null ? void 0 : updateGlobalSpl({ p13Mode: "recommended" }),
              disabled,
              children: "Recommended"
            }
          )
        ] })
      ] }),
      p13Pill
    ] })
  ] }) });
}
function useFinalSafetyPass({
  placedSpeakers,
  effectivePreset,
  useWides,
  effectiveDims,
  allowedRoles,
  setSpeakers,
  surroundConfig
}) {
  reactExports.useEffect(() => {
    setSpeakers((prevSpeakers) => {
      var _a;
      let speakers = [...prevSpeakers];
      let changed = false;
      const W = Number((effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM)) || 0;
      const L = Number((effectiveDims == null ? void 0 : effectiveDims.length) ?? (effectiveDims == null ? void 0 : effectiveDims.lengthM)) || 0;
      if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
        return prevSpeakers;
      }
      const earZ = 1.1;
      const EPS = 1e-4;
      const layoutMajor = parseInt(String(effectivePreset || "5.1").split(".")[0], 10) || 5;
      const expectsRears = layoutMajor >= 9 || layoutMajor === 7 && !useWides;
      const masterModel = (_a = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _a.master;
      const masterModelValid = masterModel && String(masterModel).toLowerCase() !== "off" && String(masterModel).toLowerCase() !== "none";
      if (expectsRears && masterModelValid) {
        let SBL = speakers.find((s) => getCanonicalRole(s.role) === "SBL");
        let SBR = speakers.find((s) => getCanonicalRole(s.role) === "SBR");
        const hasFiniteXY = (s) => !!(s == null ? void 0 : s.position) && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);
        if (!SBL) {
          const fixedX = Math.max(0.01, Math.min(W - 0.01, W * 0.25));
          const fixedY = Math.max(0.01, L - 0.1);
          SBL = { id: `sbl-${timeNowMs()}`, role: "SBL", model: null, position: { x: fixedX, y: fixedY, z: earZ }, rotation: { x: 0, y: 0, z: 0 }, draggable: true };
          speakers.push(SBL);
          changed = true;
        }
        if (!SBR) {
          const fixedX = Math.max(0.01, Math.min(W - 0.01, W * 0.75));
          const fixedY = Math.max(0.01, L - 0.1);
          SBR = { id: `sbr-${timeNowMs()}`, role: "SBR", model: null, position: { x: fixedX, y: fixedY, z: earZ }, rotation: { x: 0, y: 0, z: 0 }, draggable: true };
          speakers.push(SBR);
          changed = true;
        }
        const fixRearSpeaker = (speaker, defaultXFraction) => {
          if (!speaker || speaker.positionSource === "user") return speaker;
          const mk = String((speaker == null ? void 0 : speaker.model) || "").trim().toLowerCase();
          const modelOn = !!mk && mk !== "off" && mk !== "none";
          if (modelOn && !hasFiniteXY(speaker)) {
            const fixedX = Math.max(0.01, Math.min(W - 0.01, W * defaultXFraction));
            const fixedY = Math.max(0.01, L - 0.1);
            changed = true;
            return { ...speaker, position: { x: fixedX, y: fixedY, z: earZ }, rotation: speaker.rotation || { x: 0, y: 0, z: 0 } };
          }
          return speaker;
        };
        const newSBL = fixRearSpeaker(SBL, 0.25);
        const newSBR = fixRearSpeaker(SBR, 0.75);
        if (newSBL !== SBL) speakers = speakers.map((s) => getCanonicalRole(s.role) === "SBL" ? newSBL : s);
        if (newSBR !== SBR) speakers = speakers.map((s) => getCanonicalRole(s.role) === "SBR" ? newSBR : s);
      } else if (expectsRears && !masterModelValid) {
        speakers = speakers.map((s) => {
          const canon = getCanonicalRole(s.role);
          if (canon === "SBL" || canon === "SBR") {
            const modelKey = String((s == null ? void 0 : s.model) || "").trim().toLowerCase();
            const hasValidModel = !!modelKey && modelKey !== "off" && modelKey !== "none";
            const hasValidPosition = !!(s == null ? void 0 : s.position) && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);
            if (!hasValidModel || !hasValidPosition) {
              if (s.position) {
                changed = true;
                return { ...s, position: null };
              }
            }
          }
          return s;
        });
      }
      const LW = speakers.find((s) => getCanonicalRole(s.role) === "LW");
      const RW = speakers.find((s) => getCanonicalRole(s.role) === "RW");
      if (LW && RW && LW.position && RW.position && Number.isFinite(LW.position.x) && Number.isFinite(LW.position.y) && Number.isFinite(RW.position.x) && Number.isFinite(RW.position.y)) {
        const lwUser = LW.positionSource === "user";
        const rwUser = RW.positionSource === "user";
        if (lwUser && rwUser) return changed ? speakers : prevSpeakers;
        let sharedY;
        if (lwUser && !rwUser) sharedY = LW.position.y;
        else if (!lwUser && rwUser) sharedY = RW.position.y;
        else sharedY = (LW.position.y + RW.position.y) / 2;
        const roomCenter = W / 2;
        let targetLwX, targetRwX;
        if (lwUser && !rwUser) {
          targetLwX = LW.position.x;
          targetRwX = W - LW.position.x;
        } else if (!lwUser && rwUser) {
          targetRwX = RW.position.x;
          targetLwX = W - RW.position.x;
        } else {
          const avgDistFromCenter = (roomCenter - LW.position.x + (RW.position.x - roomCenter)) / 2;
          targetLwX = roomCenter - avgDistFromCenter;
          targetRwX = roomCenter + avgDistFromCenter;
        }
        const minXClamp = 0.02, maxXClamp = W - 0.02;
        targetLwX = Math.max(minXClamp, Math.min(maxXClamp, targetLwX));
        targetRwX = Math.max(minXClamp, Math.min(maxXClamp, targetRwX));
        let lwChanged = false, rwChanged = false;
        const updatedSpeakers = speakers.map((s) => {
          const canon = getCanonicalRole(s.role);
          if (canon === "LW") {
            let newPos = { ...s.position };
            if (Number.isFinite(sharedY) && Math.abs(newPos.y - sharedY) > EPS) {
              newPos.y = sharedY;
              lwChanged = true;
            }
            if (!lwUser && Number.isFinite(targetLwX) && Math.abs(newPos.x - targetLwX) > EPS) {
              newPos.x = targetLwX;
              lwChanged = true;
            }
            return lwChanged ? { ...s, position: newPos } : s;
          } else if (canon === "RW") {
            let newPos = { ...s.position };
            if (Number.isFinite(sharedY) && Math.abs(newPos.y - sharedY) > EPS) {
              newPos.y = sharedY;
              rwChanged = true;
            }
            if (!rwUser && Number.isFinite(targetRwX) && Math.abs(newPos.x - targetRwX) > EPS) {
              newPos.x = targetRwX;
              rwChanged = true;
            }
            return rwChanged ? { ...s, position: newPos } : s;
          }
          return s;
        });
        if (lwChanged || rwChanged) {
          changed = true;
          speakers = updatedSpeakers;
        }
      }
      return changed ? speakers : prevSpeakers;
    });
  }, [
    placedSpeakers,
    effectivePreset,
    useWides,
    effectiveDims == null ? void 0 : effectiveDims.width,
    effectiveDims == null ? void 0 : effectiveDims.widthM,
    effectiveDims == null ? void 0 : effectiveDims.length,
    effectiveDims == null ? void 0 : effectiveDims.lengthM,
    allowedRoles,
    setSpeakers
  ]);
}
const audioConfigurations = {
  // ... (keep existing non-Atmos configs like 5.1, 7.1)
  "5.1": {
    label: "5.1 Surround",
    description: "Standard 5.1 surround sound with LCR front stage and surround speakers",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Surround", type: "base" },
      { role: "RS", name: "Right Surround", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" }
    ]
  },
  "7.1": {
    label: "7.1 Surround",
    description: "Extended 7.1 surround with additional rear surround speakers",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" }
    ]
  },
  // START REPLACING ATMOS CONFIGS
  "5.1.2": {
    label: "5.1.2 Atmos",
    description: "5 bed layer + 2 overheads (Top Middle L/R)",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Surround", type: "base" },
      { role: "RS", name: "Right Surround", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TML", name: "Top Middle Left", type: "overhead" },
      { role: "TMR", name: "Top Middle Right", type: "overhead" }
    ]
  },
  "5.1.4": {
    label: "5.1.4 Atmos",
    description: "5 bed layer + 4 overheads (Top Front/Rear)",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Surround", type: "base" },
      { role: "RS", name: "Right Surround", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TFL", name: "Top Front Left", type: "overhead" },
      { role: "TFR", name: "Top Front Right", type: "overhead" },
      { role: "TRL", name: "Top Rear Left", type: "overhead" },
      { role: "TRR", name: "Top Rear Right", type: "overhead" }
    ]
  },
  "5.1.6": {
    label: "5.1.6 Dolby Atmos",
    description: "5.1 with 6 overhead speakers for maximum height immersion",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Surround", type: "base" },
      { role: "RS", name: "Right Surround", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TFL", name: "Top Front Left", type: "overhead" },
      { role: "TFR", name: "Top Front Right", type: "overhead" },
      { role: "TML", name: "Top Middle Left", type: "overhead" },
      { role: "TMR", name: "Top Middle Right", type: "overhead" },
      { role: "TRL", name: "Top Rear Left", type: "overhead" },
      { role: "TRR", name: "Top Rear Right", type: "overhead" }
    ]
  },
  "7.1.2": {
    label: "7.1.2 Atmos",
    description: "7 bed layer + 2 overheads (Top Middle L/R)",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TML", name: "Top Middle Left", type: "overhead" },
      { role: "TMR", name: "Top Middle Right", type: "overhead" }
    ]
  },
  "7.1.4": {
    label: "7.1.4 Atmos",
    description: "7 bed layer + 4 overheads (Top Front/Rear)",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TFL", name: "Top Front Left", type: "overhead" },
      { role: "TFR", name: "Top Front Right", type: "overhead" },
      { role: "TRL", name: "Top Rear Left", type: "overhead" },
      { role: "TRR", name: "Top Rear Right", type: "overhead" }
    ]
  },
  "7.1.6": {
    label: "7.1.6 Atmos",
    description: "7 bed layer + 6 overheads (Top Front/Middle/Rear)",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TFL", name: "Top Front Left", type: "overhead" },
      { role: "TFR", name: "Top Front Right", type: "overhead" },
      { role: "TML", name: "Top Middle Left", type: "overhead" },
      { role: "TMR", name: "Top Middle Right", type: "overhead" },
      { role: "TRL", name: "Top Rear Left", type: "overhead" },
      { role: "TRR", name: "Top Rear Right", type: "overhead" }
    ]
  },
  "9.1.2": {
    label: "9.1.2 Dolby Atmos",
    description: "9.1 with front wide speakers and 2 overhead speakers",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LW", name: "Left Wide", type: "base" },
      { role: "RW", name: "Right Wide", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TML", name: "Top Middle Left", type: "overhead" },
      { role: "TMR", name: "Top Middle Right", type: "overhead" }
    ]
  },
  "9.1.4": {
    label: "9.1.4 Dolby Atmos",
    description: "9.1 with front wide speakers and 4 overhead speakers",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LW", name: "Left Wide", type: "base" },
      { role: "RW", name: "Right Wide", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TFL", name: "Top Front Left", type: "overhead" },
      { role: "TFR", name: "Top Front Right", type: "overhead" },
      { role: "TRL", name: "Top Rear Left", type: "overhead" },
      { role: "TRR", name: "Top Rear Right", type: "overhead" }
    ]
  },
  "9.1.6": {
    label: "9.1.6 Dolby Atmos",
    description: "9.1 with front wide speakers and 6 overhead speakers for ultimate immersion",
    speakers: [
      { role: "L", name: "Left", type: "base" },
      { role: "C", name: "Center", type: "base" },
      { role: "R", name: "Right", type: "base" },
      { role: "LW", name: "Left Wide", type: "base" },
      { role: "RW", name: "Right Wide", type: "base" },
      { role: "LS", name: "Left Side", type: "base" },
      { role: "RS", name: "Right Side", type: "base" },
      { role: "LBS", name: "Left Back", type: "base" },
      { role: "RBS", name: "Right Back", type: "base" },
      { role: "SUB", name: "Subwoofer", type: "sub" },
      { role: "TFL", name: "Top Front Left", type: "overhead" },
      { role: "TFR", name: "Top Front Right", type: "overhead" },
      { role: "TML", name: "Top Middle Left", type: "overhead" },
      { role: "TMR", name: "Top Middle Right", type: "overhead" },
      { role: "TRL", name: "Top Rear Left", type: "overhead" },
      { role: "TRR", name: "Top Rear Right", type: "overhead" }
    ]
  }
};
const isSevenBedLayout = (layout) => {
  return layout && (layout.startsWith("7.1") || layout.startsWith("7.2"));
};
function SevenLayoutSwitcher() {
  const { dolbyLayout, sevenBedLayoutType, setSevenBedLayoutType } = useAppState();
  if (!isSevenBedLayout(dolbyLayout)) {
    return null;
  }
  const isWidesMode = sevenBedLayoutType === "wides";
  const handleToggle = (checked) => {
    setSevenBedLayoutType(checked ? "wides" : "rears");
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-[#DCDBD6] mt-4 pt-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "seven-bed-switch", className: "text-sm text-[#3E4349] pr-4", children: "Use Front Wides instead of Rear Surrounds" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          id: "seven-bed-switch",
          checked: isWidesMode,
          onCheckedChange: handleToggle,
          className: "data-[state=checked]:bg-[#213428] data-[state=unchecked]:bg-[#C1B6AD]"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#625143] mt-2", children: "Toggles the 7-channel bed layer between a rear surround pair (SBL/SBR) and a front wide pair (LW/RW)." })
  ] });
}
function MedianAngleReset({
  placedSpeakers,
  mlpPoint,
  roomDims,
  setSpeakers,
  disabled = false,
  frontWideOverlay = null
}) {
  var _a, _b;
  const [justReset, setJustReset] = reactExports.useState(false);
  const normalizeRole = (role) => {
    const r = String(role || "").toUpperCase();
    if (r === "LW" || r === "FWL" || r === "WL" || r === "LFW") return "LW";
    if (r === "RW" || r === "FWR" || r === "WR" || r === "RFW") return "RW";
    return r;
  };
  const getPos = (s) => {
    if (!s) return null;
    if (s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y))
      return s.position;
    if (s.pos && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y))
      return s.pos;
    if (Number.isFinite(s.x) && Number.isFinite(s.y))
      return { x: s.x, y: s.y };
    return null;
  };
  const findSpeaker = (targetRole) => {
    const spk = (placedSpeakers || []).find((s) => normalizeRole(s.role) === targetRole);
    if (!spk) return null;
    const pos = getPos(spk);
    return pos ? { ...spk, position: pos } : null;
  };
  const L = findSpeaker("L") || findSpeaker("FL");
  const R = findSpeaker("R") || findSpeaker("FR");
  const SL = findSpeaker("SL");
  const SR = findSpeaker("SR");
  const LW = (placedSpeakers || []).find((s) => normalizeRole(s.role) === "LW");
  const RW = (placedSpeakers || []).find((s) => normalizeRole(s.role) === "RW");
  const hasWides = !!(LW && RW);
  const canReset = hasWides && mlpPoint && Number.isFinite(mlpPoint.x) && Number.isFinite(mlpPoint.y) && L && R && SL && SR && roomDims && Number.isFinite(roomDims.widthM) && Number.isFinite(roomDims.lengthM);
  const handleReset = () => {
    if (!canReset) return;
    window.dispatchEvent(new CustomEvent("b44:fw:resetToMedian"));
    setJustReset(true);
    setTimeout(() => setJustReset(false), 1500);
  };
  if (!hasWides) return null;
  (frontWideOverlay == null ? void 0 : frontWideOverlay.status) === "ok" && ((_a = frontWideOverlay == null ? void 0 : frontWideOverlay.left) == null ? void 0 : _a.status) === "ok" && ((_b = frontWideOverlay == null ? void 0 : frontWideOverlay.right) == null ? void 0 : _b.status) === "ok";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-t border-gray-200", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-gray-700", children: "Individual Control" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          size: "sm",
          variant: "outline",
          onClick: handleReset,
          disabled: disabled || !canReset,
          className: "text-xs",
          children: justReset ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "w-3 h-3 mr-1" }),
            "Done"
          ] }) : "Median Angle Reset"
        }
      )
    ] }),
    !canReset && hasWides && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-gray-500 mt-1", children: "Front Wides not available (missing L, R, SL, SR, or MLP)" })
  ] });
}
function SurroundSplStrip({
  allSeatSplMetrics,
  mlpSeat,
  dolbyLayout,
  placedSpeakers,
  mlpPoint,
  roomDims,
  setSpeakers,
  disabled = false,
  frontWideOverlay = null,
  sevenBedLayoutType = "rears"
  // NEW: Add toggle state for 7.x layouts
}) {
  const mlpSplData = reactExports.useMemo(() => {
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = allSeatSplMetrics.get("mlp");
    if (mlpMetrics == null ? void 0 : mlpMetrics.spl) return mlpMetrics.spl;
    if (mlpSeat) {
      const metrics = allSeatSplMetrics.get(mlpSeat.id);
      return (metrics == null ? void 0 : metrics.spl) || null;
    }
    return null;
  }, [mlpSeat, allSeatSplMetrics]);
  const groups = reactExports.useMemo(() => {
    if (!dolbyLayout) return [];
    const parts = String(dolbyLayout).split(".");
    const major = Number(parts[0]) || 5;
    const result = [];
    if (major >= 5) {
      result.push({
        key: "sides",
        label: "Side Surrounds",
        roles: ["SL", "SR"]
      });
    }
    if (major >= 7) {
      const useWides = sevenBedLayoutType === "wides";
      if (major === 7) {
        result.push(
          useWides ? { key: "wides", label: "Front Wides", roles: ["LW", "RW"] } : { key: "rears", label: "Rear Surrounds", roles: ["SBL", "SBR"] }
        );
      } else {
        result.push({
          key: "rears",
          label: "Rear Surrounds",
          roles: ["SBL", "SBR"]
        });
        result.push({
          key: "wides",
          label: "Front Wides",
          roles: ["LW", "RW"]
        });
      }
    }
    return result;
  }, [dolbyLayout, sevenBedLayoutType]);
  const groupSplValues = reactExports.useMemo(() => {
    if (!(mlpSplData == null ? void 0 : mlpSplData.surrounds)) return {};
    const result = {};
    for (const group of groups) {
      const splValues = group.roles.map((role) => {
        var _a;
        return (_a = mlpSplData.surrounds[role]) == null ? void 0 : _a.value;
      }).filter(Number.isFinite);
      if (splValues.length > 0) {
        result[group.key] = Math.max(...splValues);
      }
    }
    return result;
  }, [mlpSplData, groups]);
  if (!mlpSeat) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      MedianAngleReset,
      {
        placedSpeakers,
        mlpPoint,
        roomDims,
        setSpeakers,
        disabled,
        frontWideOverlay
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-medium text-[#625143] mb-2", children: "SPL @ RSP" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-2", children: groups.map((group) => {
      const splValue = groupSplValues[group.key];
      const hasValue = Number.isFinite(splValue);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "bg-white", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardHeader, { className: "pb-2 pt-3 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "text-xs font-medium flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Volume2, { className: "w-3 h-3", style: { color: "#625143" } }),
          group.label
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "px-3 pb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold", style: { color: "#1B1A1A" }, children: hasValue ? formatDb(splValue) : "Not Calculated" }) })
      ] }, group.key);
    }) })
  ] });
}
const optionKey = (option) => (option == null ? void 0 : option.key) ?? (option == null ? void 0 : option.value) ?? "";
function resolveModelOption(options, storedModel) {
  const list = Array.isArray(options) ? options : [];
  const raw = String(storedModel ?? "").trim();
  if (!raw || list.length === 0) return null;
  const canonical = canonicalProductId(raw);
  if (canonical) {
    const byKey = list.find((option) => canonicalProductId(optionKey(option)) === canonical);
    if (byKey) return byKey;
  }
  const normalised = normaliseModelKey(raw);
  if (normalised) {
    const byValueOrLabel = list.find((option) => normaliseModelKey(optionKey(option)) === normalised) || list.find((option) => normaliseModelKey(option == null ? void 0 : option.label) === normalised);
    if (byValueOrLabel) return byValueOrLabel;
  }
  return list.find((option) => String((option == null ? void 0 : option.label) ?? "").trim() === raw) || null;
}
function LcrSplCard({ role, label, allSeatSplMetrics, integratedLcrMode = false, dualCentre = false }) {
  var _a, _b, _c;
  const appState = useAppState();
  const mlpSeat = reactExports.useMemo(() => {
    return getMlpSeat((appState == null ? void 0 : appState.seatingPositions) || []);
  }, [appState == null ? void 0 : appState.seatingPositions]);
  const mlpSplData = reactExports.useMemo(() => {
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = getSeatSplMetrics(allSeatSplMetrics, "mlp");
    if (mlpMetrics) return mlpMetrics;
    if (mlpSeat) {
      return getSeatSplMetrics(allSeatSplMetrics, mlpSeat.id);
    }
    return null;
  }, [mlpSeat, allSeatSplMetrics]);
  const placedSpeakers = ((_a = appState == null ? void 0 : appState.speakerSystem) == null ? void 0 : _a.placedSpeakers) || [];
  const speaker = reactExports.useMemo(() => {
    const canonical = { "L": "FL", "C": "FC", "R": "FR" }[role] || role;
    const direct = placedSpeakers.find((s) => {
      const sRole = String((s == null ? void 0 : s.role) || "").toUpperCase();
      return sRole === canonical || sRole === role;
    });
    if (direct) return direct;
    return placedSpeakers.find((s) => isCentreCabinetRole(s == null ? void 0 : s.role) && (s == null ? void 0 : s.model)) || null;
  }, [placedSpeakers, role]);
  const canonicalRole = { "L": "FL", "C": "FC", "R": "FR" }[role] || role;
  const isFlankingRole = integratedLcrMode && (canonicalRole === "FL" || canonicalRole === "FR");
  const splLookupRole = isFlankingRole ? "FC" : canonicalRole;
  const splEntry = (_b = mlpSplData == null ? void 0 : mlpSplData.screen) == null ? void 0 : _b[splLookupRole];
  const splValue = splEntry == null ? void 0 : splEntry.value;
  const theoreticalValue = splEntry == null ? void 0 : splEntry.theoretical;
  const finalSplDb = Number.isFinite(splValue) ? splValue : null;
  const finalTheoreticalDb = Number.isFinite(theoreticalValue) ? theoreticalValue : null;
  const isOutputLimited = finalSplDb !== null && finalTheoreticalDb !== null && finalTheoreticalDb - finalSplDb > 3;
  const { distanceM, sensitivity, modelLabel } = reactExports.useMemo(() => {
    var _a2, _b2, _c2;
    if (!(speaker == null ? void 0 : speaker.position) || !Number.isFinite(speaker.position.x) || !Number.isFinite(speaker.position.y)) {
      return { distanceM: null, sensitivity: null, modelLabel: null };
    }
    if (!mlpSeat) {
      return { distanceM: null, sensitivity: null, modelLabel: null };
    }
    const modelId = speaker.model;
    if (!modelId) {
      return { distanceM: null, sensitivity: null, modelLabel: "No model" };
    }
    const meta = getSpeakerModelMeta(modelId);
    const sensitivity2 = (meta == null ? void 0 : meta.sensitivity_dB_1w1m) || (meta == null ? void 0 : meta.sensitivity_dB_2p83);
    const dx = speaker.position.x - (mlpSeat.x || ((_a2 = mlpSeat.position) == null ? void 0 : _a2.x) || 0);
    const dy = speaker.position.y - (mlpSeat.y || ((_b2 = mlpSeat.position) == null ? void 0 : _b2.y) || 0);
    const dz = (speaker.position.z || 1.2) - (mlpSeat.z || ((_c2 = mlpSeat.position) == null ? void 0 : _c2.z) || 1.2);
    const distanceM2 = Math.hypot(dx, dy, dz);
    return {
      distanceM: distanceM2,
      sensitivity: sensitivity2,
      modelLabel: (meta == null ? void 0 : meta.label) || modelId
    };
  }, [speaker, mlpSeat]);
  const dualCentreDb = dualCentre && canonicalRole === "FC" && ((_c = splEntry == null ? void 0 : splEntry.debug) == null ? void 0 : _c.dualCentreAllowanceDb) === DUAL_CENTRE_SPL_GAIN_DB ? finalSplDb : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "bg-white", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardHeader, { className: "pb-2 pt-3 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "text-xs font-medium flex items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Volume2, { className: "w-3 h-3", style: { color: "#625143" } }),
      label
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "px-3 pb-3", children: !isFlankingRole && !(speaker == null ? void 0 : speaker.model) ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-[#625143] mt-1", children: "Select LCR model" }) : !isFlankingRole && !(speaker == null ? void 0 : speaker.position) ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-[#625143] mt-1", children: "Not placed" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold", style: { color: "#1B1A1A" }, children: formatDb(dualCentreDb !== null ? dualCentreDb : finalSplDb) }),
      dualCentreDb === null && isOutputLimited && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs mt-0.5", style: { color: "#b08060" }, children: "Output limited by speaker" })
    ] }) })
  ] });
}
function calculateTvFrontStageHeightGuidance({
  isTv,
  frontStageMode,
  screenBottomHeightM,
  viewableImageHeightM,
  soundbarHeightM,
  placementOffsetFromScreenBottomMm,
  currentAcousticCentreM
}) {
  if (!isTv) {
    return {
      isValid: false,
      mode: "not_tv",
      status: "unknown",
      explanationText: "TV front-stage guidance is not applicable."
    };
  }
  const screenBottom = Number(screenBottomHeightM);
  const imageHeight = Number(viewableImageHeightM);
  if (!Number.isFinite(screenBottom) || !Number.isFinite(imageHeight) || imageHeight <= 0) {
    return {
      isValid: false,
      mode: frontStageMode === "standard" ? "tv_separate_lcr" : "tv_soundbar",
      status: "unknown",
      explanationText: "Screen geometry data is missing or invalid."
    };
  }
  const screenCentreHeightM = screenBottom + imageHeight / 2;
  const currentIsValid = Number.isFinite(Number(currentAcousticCentreM));
  const current = currentIsValid ? Number(currentAcousticCentreM) : null;
  if (frontStageMode === "standard") {
    const TOLERANCE_M = 0.05;
    let status = "unknown";
    if (current !== null) {
      const diff = current - screenCentreHeightM;
      if (Math.abs(diff) <= TOLERANCE_M) status = "ideal";
      else if (diff < 0) status = "below";
      else status = "above";
    }
    return {
      isValid: true,
      mode: "tv_separate_lcr",
      idealHeightM: screenCentreHeightM,
      currentAcousticCentreM: current,
      status,
      explanationText: "For TV layouts with separate left/right speakers, align the speaker acoustic centre with the middle of the TV image where practical."
    };
  }
  if (frontStageMode === "dual_centre") {
    const TOLERANCE_M = 0.05;
    let status = "unknown";
    if (current !== null) {
      const diff = current - screenCentreHeightM;
      if (Math.abs(diff) <= TOLERANCE_M) status = "ideal";
      else if (diff < 0) status = "below";
      else status = "above";
    }
    return {
      isValid: true,
      mode: "tv_dual_centre",
      idealHeightM: screenCentreHeightM,
      currentAcousticCentreM: current,
      status,
      explanationText: "Dual physical centre speakers flank the TV and are fed from the centre channel. Centre speaker acoustic centre: TV midpoint height."
    };
  }
  if (frontStageMode === "center_only" || frontStageMode === "integrated_lcr") {
    const soundbarH = Number(soundbarHeightM);
    if (!Number.isFinite(soundbarH) || soundbarH <= 0) {
      return {
        isValid: false,
        mode: "tv_soundbar",
        status: "unknown",
        explanationText: "Soundbar height data is missing or invalid."
      };
    }
    const fixedGapBelowTvM = 0.05;
    const soundbarCentreHeightM = screenBottom - fixedGapBelowTvM - soundbarH / 2;
    const TOLERANCE_M = 0.03;
    let status = "unknown";
    if (current !== null) {
      const diff = current - soundbarCentreHeightM;
      if (Math.abs(diff) <= TOLERANCE_M) status = "ideal";
      else if (diff < 0) status = "below";
      else status = "above";
    }
    return {
      isValid: true,
      mode: "tv_soundbar",
      idealHeightM: soundbarCentreHeightM,
      currentAcousticCentreM: current,
      placementOffsetM: fixedGapBelowTvM,
      status,
      explanationText: "For TV soundbar layouts, the soundbar is positioned with a fixed 5 cm gap below the TV screen."
    };
  }
  return {
    isValid: false,
    mode: frontStageMode || "unknown",
    status: "unknown",
    explanationText: "Unrecognised front-stage mode."
  };
}
const STATUS_META = {
  ideal: { label: "Ideal", color: "#2d7a4f" },
  below: { label: "Below range", color: "#b45309" },
  above: { label: "Above range", color: "#b45309" },
  unknown: { label: "Unknown", color: "#6b7280" }
};
function Row({ label, value, strong }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 11, color: "#888" }, children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 12, fontWeight: strong ? 700 : 600, color: "#1B1A1A" }, children: value })
  ] });
}
function LcrAcousticCentreGuidanceCard({ guidance }) {
  if (!(guidance == null ? void 0 : guidance.isValid)) return null;
  const { status, minHeightM, maxHeightM, idealHeightM, currentAcousticCentreM, placementOffsetM, mode } = guidance;
  const meta = STATUS_META[status] || STATUS_META.unknown;
  const title = mode === "tv_dual_centre" ? "TV DUAL CENTRE HEIGHT GUIDANCE" : mode === "tv_soundbar" ? "TV SOUNDBAR HEIGHT GUIDANCE" : mode === "tv_separate_lcr" ? "TV L/R HEIGHT GUIDANCE" : "ACOUSTIC CENTRE GUIDANCE";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#F8F8F7", border: "1px solid #E6E4DD" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 10, fontWeight: 700, color: "#625143", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }, children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 11, color: "#888" }, children: "Recommended" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 15, fontWeight: 700, color: "#213428" }, children: formatHeightM(idealHeightM) })
      ] }),
      mode === "tv_dual_centre" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Centre speaker acoustic centre", value: "TV midpoint" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Current", value: currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : "—" })
      ] }) : mode === "tv_soundbar" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Offset below TV", value: formatHeightM(placementOffsetM) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Current", value: currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : "—" })
      ] }) : mode === "tv_separate_lcr" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Current", value: currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : "—" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Allowed range", value: `${formatHeightM(minHeightM)} – ${formatHeightM(maxHeightM)}` }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { label: "Current", value: currentAcousticCentreM !== null ? formatHeightM(currentAcousticCentreM) : "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2, paddingTop: 6, borderTop: "1px solid #E6E4DD" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 11, color: "#888" }, children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: 12, fontWeight: 700, color: meta.color }, children: meta.label })
      ] })
    ] })
  ] });
}
const CENTER_ONLY_SOUNDBAR_LABELS = ["C-1", "C4-1", "Multi (Mono)", "HSPL (Mono)"];
const INTEGRATED_LCR_SOUNDBAR_LABELS = ["Multi (LCR)", "HSPL (LCR)"];
function buildRoleMap(list) {
  const m = /* @__PURE__ */ new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const raw = String(s.role || "").toUpperCase();
    const canon = getCanonicalRole(raw);
    m.set(raw, s);
    m.set(canon, s);
  });
  return m;
}
function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}
function hasFrontLcrSubClash({ speakers, frontSubs, frontSubsCfg }) {
  const lcrRoles = /* @__PURE__ */ new Set(["FL", "FC", "FR", "FCL", "FCR"]);
  const lcrRects = (Array.isArray(speakers) ? speakers : []).filter((speaker) => lcrRoles.has(getCanonicalRole(speaker == null ? void 0 : speaker.role))).map((speaker) => {
    var _a, _b;
    const x = Number((_a = speaker == null ? void 0 : speaker.position) == null ? void 0 : _a.x);
    const z = Number((_b = speaker == null ? void 0 : speaker.position) == null ? void 0 : _b.z);
    const meta = getSpeakerModelMeta(speaker == null ? void 0 : speaker.model);
    const width = Number(meta == null ? void 0 : meta.widthM);
    const height = Number(meta == null ? void 0 : meta.heightM);
    if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { left: x - width / 2, right: x + width / 2, bottom: z - height / 2, top: z + height / 2 };
  }).filter(Boolean);
  const frontSubRects = (Array.isArray(frontSubs) ? frontSubs : []).filter((sub) => (sub == null ? void 0 : sub.group) === "front" || String((sub == null ? void 0 : sub.role) || "").toUpperCase().startsWith("SUBF")).map((sub) => {
    var _a;
    const x = Number.isFinite(Number((_a = sub == null ? void 0 : sub.position) == null ? void 0 : _a.x)) ? Number(sub.position.x) : Number(sub == null ? void 0 : sub.x);
    const bottom = Number.isFinite(Number(sub == null ? void 0 : sub.bottomHeightM)) ? Number(sub.bottomHeightM) : Number.isFinite(Number(frontSubsCfg == null ? void 0 : frontSubsCfg.bottomHeightM)) ? Number(frontSubsCfg.bottomHeightM) : 0.05;
    const model = (sub == null ? void 0 : sub.model) || (frontSubsCfg == null ? void 0 : frontSubsCfg.model);
    const orientation = (sub == null ? void 0 : sub.orientation) || (frontSubsCfg == null ? void 0 : frontSubsCfg.orientation);
    const meta = getSpeakerModelMeta(model, orientation);
    const width = Number(meta == null ? void 0 : meta.widthM);
    const height = Number(meta == null ? void 0 : meta.heightM);
    if (![x, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { left: x - width / 2, right: x + width / 2, bottom, top: bottom + height };
  }).filter(Boolean);
  if (lcrRects.length === 0 || frontSubRects.length === 0) return false;
  return lcrRects.some((lcrRect) => frontSubRects.some((subRect) => rectsOverlap(lcrRect, subRect)));
}
function resolveSoundbarMeta(modelLabel, screen) {
  return resolveSoundbarMetaM(modelLabel, screen, { tvPresetKey: (screen == null ? void 0 : screen.tvPresetKey) || null });
}
function buildFrontStageSeed({
  baseModelLabel,
  frontStageMode,
  soundbarModelLabel,
  centreModelLabel = null,
  centreOrientation = null,
  dimensions,
  screen,
  splConfig,
  setSpeakers,
  rsp = null,
  screenFrontPlaneM = null,
  lcrAimMode = "flat",
  getModelDimsM
}) {
  setSpeakers((prev) => {
    const list = Array.isArray(prev) ? prev : [];
    const by = buildRoleMap(list);
    const isCentreLike = (role) => {
      const r = String(role || "").trim().toUpperCase();
      return r === "FC" || r === "C" || r === "CENTER" || r === "CENTRE";
    };
    const LCR_ROLES_SET = /* @__PURE__ */ new Set(["FL", "FR"]);
    const filtered = list.filter((s) => {
      const canon = getCanonicalRole(s.role);
      if (isCentreCabinetRole(canon)) return false;
      return !LCR_ROLES_SET.has(canon) && !isCentreLike(String(s.role || "").trim().toUpperCase());
    });
    const roomW = Number((dimensions == null ? void 0 : dimensions.width) ?? (dimensions == null ? void 0 : dimensions.widthM)) || 4.5;
    const roomH = Number((dimensions == null ? void 0 : dimensions.height) ?? (dimensions == null ? void 0 : dimensions.heightM)) || 2.8;
    const defaultY = 0.2;
    const tvCentreM = computeTvVerticalCentreM(screen, dimensions);
    const defaultZ = Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrHeightM)) ? Number(splConfig.lcrHeightM) : roomH * 0.5;
    const spread = Math.min(1.2, roomW * 0.22);
    const midX = roomW / 2;
    const heightForRole = (role) => {
      const isLr = role === "FL" || role === "FR";
      if (frontStageMode === "center_only" && isLr) {
        return Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM)) ? Number(splConfig.lcrLRHeightM) : tvCentreM;
      }
      if (frontStageMode === "dual_centre" && isCentreCabinetRole(role)) {
        return (splConfig == null ? void 0 : splConfig.lcrHeightManual) === true && Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrHeightM)) ? Number(splConfig.lcrHeightM) : tvCentreM;
      }
      return defaultZ;
    };
    const placeRole = (role, model, existing, orientation = null) => {
      const existingPos = existing == null ? void 0 : existing.position;
      const existingModel = String((existing == null ? void 0 : existing.model) ?? "").trim().toLowerCase();
      const alreadyInstalled = !!existingModel && existingModel !== "off" && existingModel !== "none";
      const userPlaced = (existing == null ? void 0 : existing.positionSource) === "user";
      const x0 = Number(existingPos == null ? void 0 : existingPos.x);
      const y0 = Number(existingPos == null ? void 0 : existingPos.y);
      const hasExisting = Number.isFinite(x0) && Number.isFinite(y0);
      const resolved = resolveInitialLcrPosition({
        role,
        model,
        // A centre cabinet is placed from its INSTALLED footprint, so a vertical
        // cabinet hugs the TV edge with its rotated width.
        orientation,
        roomDims: dimensions,
        rsp,
        screenFrontPlaneM,
        screen,
        lcrHeightM: heightForRole(role),
        lcrAimMode,
        fallbackSpreadM: spread,
        getModelDimsM
      });
      if (!resolved) return hasExisting ? existingPos : null;
      if (!hasExisting || !alreadyInstalled && !userPlaced) {
        return { x: resolved.x, y: resolved.y, z: resolved.z };
      }
      return { x: x0, y: Math.max(y0, resolved.y), z: resolved.z };
    };
    const FL = by.get("FL") || { role: "FL", id: "FL-1", draggable: true };
    const FC = by.get("FC") || { role: "FC", id: "FC-1", draggable: true };
    const FR = by.get("FR") || { role: "FR", id: "FR-1", draggable: true };
    const soundbarLabel = soundbarModelLabel || null;
    const centreLabel = centreModelLabel || null;
    const cabinetOrientation = (existing) => {
      const recorded = String((existing == null ? void 0 : existing.orientation) || "").trim();
      if (recorded) return normaliseCabinetOrientation(recorded);
      if (centreOrientation) return normaliseCabinetOrientation(centreOrientation);
      return defaultCentreCabinetOrientation(centreLabel, (screen == null ? void 0 : screen.tvPresetKey) || null);
    };
    const fallbackPosition = (role) => {
      if (isCentreCabinetRole(role)) {
        const left = getCanonicalRole(role) === CENTRE_CABINET_ROLES.left;
        return { x: left ? midX - spread : midX + spread, y: defaultY, z: heightForRole(role) };
      }
      return {
        x: role === "FL" ? midX - spread : role === "FR" ? midX + spread : midX,
        y: defaultY,
        z: heightForRole(role)
      };
    };
    if (frontStageMode === "integrated_lcr" && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FC,
          role: "FC",
          id: FC.id || "FC-1",
          model: soundbarLabel,
          position: placeRole("FC", soundbarLabel, FC) || fallbackPosition("FC"),
          rotation: FC.rotation || { x: 0, y: 0, z: 0 }
        }
      ];
    }
    if (frontStageMode === "center_only" && soundbarLabel) {
      return [
        ...filtered,
        {
          ...FL,
          role: "FL",
          id: FL.id || "FL-1",
          model: baseModelLabel,
          position: placeRole("FL", baseModelLabel, FL) || fallbackPosition("FL"),
          rotation: FL.rotation || { x: 0, y: 0, z: 0 }
        },
        {
          ...FC,
          role: "FC",
          id: FC.id || "FC-1",
          model: soundbarLabel,
          position: placeRole("FC", soundbarLabel, FC) || fallbackPosition("FC"),
          rotation: FC.rotation || { x: 0, y: 0, z: 0 }
        },
        {
          ...FR,
          role: "FR",
          id: FR.id || "FR-1",
          model: baseModelLabel,
          position: placeRole("FR", baseModelLabel, FR) || fallbackPosition("FR"),
          rotation: FR.rotation || { x: 0, y: 0, z: 0 }
        }
      ];
    }
    if (frontStageMode === "dual_centre" && centreLabel) {
      const FCL = by.get("FCL") || { role: "FCL", id: "FCL-1", draggable: true };
      const FCR = by.get("FCR") || { role: "FCR", id: "FCR-1", draggable: true };
      return [
        ...filtered,
        {
          ...FL,
          role: "FL",
          id: FL.id || "FL-1",
          model: baseModelLabel,
          position: placeRole("FL", baseModelLabel, FL) || fallbackPosition("FL"),
          rotation: FL.rotation || { x: 0, y: 0, z: 0 }
        },
        {
          ...FCL,
          role: "FCL",
          id: FCL.id || "FCL-1",
          model: centreLabel,
          orientation: cabinetOrientation(FCL),
          position: placeRole("FCL", centreLabel, FCL, cabinetOrientation(FCL)) || fallbackPosition("FCL"),
          rotation: FCL.rotation || { x: 0, y: 0, z: 0 }
        },
        {
          ...FCR,
          role: "FCR",
          id: FCR.id || "FCR-1",
          model: centreLabel,
          orientation: cabinetOrientation(FCR),
          position: placeRole("FCR", centreLabel, FCR, cabinetOrientation(FCR)) || fallbackPosition("FCR"),
          rotation: FCR.rotation || { x: 0, y: 0, z: 0 }
        },
        {
          ...FR,
          role: "FR",
          id: FR.id || "FR-1",
          model: baseModelLabel,
          position: placeRole("FR", baseModelLabel, FR) || fallbackPosition("FR"),
          rotation: FR.rotation || { x: 0, y: 0, z: 0 }
        }
      ];
    }
    return [
      ...filtered,
      {
        ...FL,
        role: "FL",
        id: FL.id || "FL-1",
        model: baseModelLabel,
        position: placeRole("FL", baseModelLabel, FL) || fallbackPosition("FL"),
        rotation: FL.rotation || { x: 0, y: 0, z: 0 }
      },
      {
        ...FC,
        role: "FC",
        id: FC.id || "FC-1",
        model: baseModelLabel,
        position: placeRole("FC", baseModelLabel, FC) || fallbackPosition("FC"),
        rotation: FC.rotation || { x: 0, y: 0, z: 0 }
      },
      {
        ...FR,
        role: "FR",
        id: FR.id || "FR-1",
        model: baseModelLabel,
        position: placeRole("FR", baseModelLabel, FR) || fallbackPosition("FR"),
        rotation: FR.rotation || { x: 0, y: 0, z: 0 }
      }
    ];
  });
}
const P12_THRESHOLDS_REC = { L1: 102, L2: 105, L3: 108, L4: 111 };
const P12_THRESHOLDS_MIN = { L1: 99, L2: 102, L3: 105, L4: 108 };
function computeRP22Level$1(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return "FAIL";
}
function LCRPanel({ setSpeakers, dimensions, lcrAimMode, onChangeLcrAimMode, lcrAngleDeg, mlpPoint, disabled, allSeatSplMetrics, onP12Update }) {
  var _a, _b, _c, _d;
  const appState = useAppState();
  const { speakerSystem, splConfig = {}, updateGlobalSpl, seatingPositions, screen, frontSubsCfg, subwoofers } = appState || {};
  const { options: standardLcrOptions } = useProductRoleOptions(PRODUCT_ROLES.LCR);
  const { options: soundbarOptions } = useProductRoleOptions(PRODUCT_ROLES.CENTRE_SOUNDBAR);
  const LCR_CANONICAL_ROLES = reactExports.useMemo(() => /* @__PURE__ */ new Set(["FL", "FC", "FR"]), []);
  const lcrRoles = reactExports.useMemo(() => ["FL", "FC", "FR"], []);
  const byRole = reactExports.useMemo(
    () => buildRoleMap((speakerSystem == null ? void 0 : speakerSystem.placedSpeakers) || []),
    [speakerSystem == null ? void 0 : speakerSystem.placedSpeakers]
  );
  const getByRole = reactExports.useCallback((r) => byRole.get(getCanonicalRole(r)), [byRole]);
  const initialModel = reactExports.useMemo(() => {
    var _a2, _b2, _c2;
    const fcModel2 = (_a2 = getByRole("FC")) == null ? void 0 : _a2.model;
    const fcMeta2 = fcModel2 ? getSpeakerModelMeta(fcModel2) : null;
    const installedLabel = (model) => {
      if (!model) return null;
      const meta = getSpeakerModelMeta(model);
      return meta && !meta.notFound ? meta.label || model : model;
    };
    const labelFor = (model) => {
      var _a3;
      return ((_a3 = resolveModelOption(standardLcrOptions, model)) == null ? void 0 : _a3.label) || installedLabel(model);
    };
    if ((fcMeta2 == null ? void 0 : fcMeta2.frontStageType) === "center_only" || (fcMeta2 == null ? void 0 : fcMeta2.frontStageType) === "integrated_lcr") {
      for (const role of ["FL", "FR"]) {
        const label = labelFor((_b2 = getByRole(role)) == null ? void 0 : _b2.model);
        if (label) return label;
      }
      return "";
    }
    for (const r of LCR_CANONICAL_ROLES) {
      const label = labelFor((_c2 = getByRole(r)) == null ? void 0 : _c2.model);
      if (label) return label;
    }
    return "";
  }, [getByRole, LCR_CANONICAL_ROLES, standardLcrOptions]);
  const lastP12SentRef = reactExports.useRef(null);
  reactExports.useRef(false);
  const hasLcrSubClash = reactExports.useMemo(() => hasFrontLcrSubClash({
    speakers: speakerSystem == null ? void 0 : speakerSystem.placedSpeakers,
    frontSubs: subwoofers,
    frontSubsCfg
  }), [speakerSystem == null ? void 0 : speakerSystem.placedSpeakers, subwoofers, frontSubsCfg]);
  const p12ActiveMode = (appState == null ? void 0 : appState.p12Mode) === P12_MODE_RECOMMENDED ? P12_MODE_RECOMMENDED : "minimum";
  const p12Computed = reactExports.useMemo(() => {
    var _a2;
    if (!allSeatSplMetrics) return null;
    const mlpMetrics = allSeatSplMetrics.get("mlp");
    const seatMetrics = mlpMetrics || (() => {
      const mlp = getMlpSeat(seatingPositions || []);
      return mlp ? allSeatSplMetrics.get(mlp.id) : null;
    })();
    if (!((_a2 = seatMetrics == null ? void 0 : seatMetrics.spl) == null ? void 0 : _a2.screen)) return null;
    const lcrTileSplDb = ["FL", "FC", "FR"].map((role) => {
      var _a3;
      return (_a3 = seatMetrics.spl.screen[role]) == null ? void 0 : _a3.value;
    }).filter((v) => Number.isFinite(v)).map((v) => Math.ceil(v));
    if (lcrTileSplDb.length === 0) return null;
    const pillBasisDb = Math.min(...lcrTileSplDb);
    const thresholds = p12ActiveMode === P12_MODE_RECOMMENDED ? P12_THRESHOLDS_REC : P12_THRESHOLDS_MIN;
    const level = computeRP22Level$1(pillBasisDb, thresholds);
    return { level, currentMode: p12ActiveMode };
  }, [allSeatSplMetrics, seatingPositions, p12ActiveMode]);
  reactExports.useEffect(() => {
    var _a2;
    if (!p12Computed) return;
    const sig = `${p12Computed.currentMode}|${p12Computed.level}`;
    if (lastP12SentRef.current === sig) return;
    lastP12SentRef.current = sig;
    (_a2 = appState == null ? void 0 : appState.setP12Level) == null ? void 0 : _a2.call(appState, p12Computed.level);
  }, [p12Computed, appState == null ? void 0 : appState.setP12Level]);
  const fcModel = (_a = getByRole("FC")) == null ? void 0 : _a.model;
  const fcMeta = fcModel ? getSpeakerModelMeta(fcModel) : null;
  const dualCentreStage = reactExports.useMemo(
    () => detectDualCentreStage(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers),
    [speakerSystem == null ? void 0 : speakerSystem.placedSpeakers]
  );
  const derivedFrontStageMode = dualCentreStage ? FRONT_STAGE_DUAL_CENTRE : (fcMeta == null ? void 0 : fcMeta.frontStageType) === "integrated_lcr" ? "integrated_lcr" : (fcMeta == null ? void 0 : fcMeta.frontStageType) === "center_only" ? "center_only" : FRONT_STAGE_STANDARD;
  const derivedSoundbarModel = reactExports.useMemo(() => {
    var _a2;
    const isSoundbarStage = (fcMeta == null ? void 0 : fcMeta.frontStageType) === "center_only" || (fcMeta == null ? void 0 : fcMeta.frontStageType) === "integrated_lcr";
    if (!isSoundbarStage || !fcModel) return "";
    const fromCatalogue = (_a2 = resolveModelOption(soundbarOptions, fcModel)) == null ? void 0 : _a2.label;
    if (fromCatalogue) return fromCatalogue;
    const meta = getSpeakerModelMeta(fcModel);
    return meta && !meta.notFound ? meta.label || fcModel : fcModel;
  }, [fcModel, fcMeta == null ? void 0 : fcMeta.frontStageType, soundbarOptions]);
  const centreOptions = reactExports.useMemo(
    () => eligibleDualCentreCentreOptions([...standardLcrOptions, ...soundbarOptions]),
    [standardLcrOptions, soundbarOptions]
  );
  const derivedCentreModel = reactExports.useMemo(() => {
    var _a2, _b2;
    if (!dualCentreStage) return "";
    const cabinet = centreCabinets(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers)[0];
    const model = cabinet == null ? void 0 : cabinet.model;
    if (!model) return "";
    return ((_a2 = resolveModelOption(centreOptions, model)) == null ? void 0 : _a2.label) || (((_b2 = getSpeakerModelMeta(model)) == null ? void 0 : _b2.label) || model);
  }, [dualCentreStage, speakerSystem == null ? void 0 : speakerSystem.placedSpeakers, centreOptions]);
  const centreChannelAngleDeg = reactExports.useMemo(() => {
    if (!dualCentreStage) return null;
    const midpoint = effectiveCentreAcousticMidpoint(centreCabinets(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers));
    if (!midpoint) return null;
    const target = mlpPoint && Number.isFinite(Number(mlpPoint.x)) && Number.isFinite(Number(mlpPoint.y)) ? { x: Number(mlpPoint.x), y: Number(mlpPoint.y) } : null;
    if (!target) return null;
    const deg = yawDegToMLP(midpoint, target);
    return Number.isFinite(deg) ? deg : null;
  }, [dualCentreStage, speakerSystem == null ? void 0 : speakerSystem.placedSpeakers, mlpPoint]);
  const roomH = Number((dimensions == null ? void 0 : dimensions.height) ?? (dimensions == null ? void 0 : dimensions.heightM)) || 2.8;
  const screenBottomM = Number(screen == null ? void 0 : screen.heightFromFloorM);
  const visibleWidthInches = Number(screen == null ? void 0 : screen.visibleWidthInches);
  const aspectRatio = String((screen == null ? void 0 : screen.aspectRatio) || "16:9");
  const [arW, arH] = aspectRatio.split(":").map(Number);
  const screenRatio = arW && arH ? arW / arH : 16 / 9;
  const screenHeightM = Number.isFinite(visibleWidthInches) && visibleWidthInches > 0 ? visibleWidthInches * 0.0254 / screenRatio : null;
  const defaultLcrHeightM = Number.isFinite(screenBottomM) && Number.isFinite(screenHeightM) ? screenBottomM + screenHeightM / 2 : roomH * 0.5;
  const clampLcrHeight = reactExports.useCallback((value) => Math.max(0.2, Math.min(roomH - 0.2, value)), [roomH]);
  const tvVerticalCentreM = reactExports.useMemo(
    () => clampLcrHeight(computeTvVerticalCentreM(screen, dimensions)),
    [screen, dimensions, clampLcrHeight]
  );
  const hasSavedLcrHeight = Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrHeightM));
  const lcrHeightManual = (splConfig == null ? void 0 : splConfig.lcrHeightManual) === true ? true : (splConfig == null ? void 0 : splConfig.lcrHeightManual) === false ? false : hasSavedLcrHeight;
  const hasSavedLrHeight = Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM));
  const lcrLRHeightManual = (splConfig == null ? void 0 : splConfig.lcrLRHeightManual) === true ? true : (splConfig == null ? void 0 : splConfig.lcrLRHeightManual) === false ? false : hasSavedLrHeight;
  const [lcrModel, setLcrModel] = reactExports.useState(initialModel);
  const [frontStageMode, setFrontStageMode] = reactExports.useState(derivedFrontStageMode);
  const [soundbarModel, setSoundbarModel] = reactExports.useState(derivedSoundbarModel);
  const [centreModel, setCentreModel] = reactExports.useState(derivedCentreModel);
  const [centreOrientation, setCentreOrientation] = reactExports.useState(
    () => centreCabinetOrientation(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers)
  );
  const [lcrPowerInputValue, setLcrPowerInputValue] = reactExports.useState(String((splConfig == null ? void 0 : splConfig.lcrW) || 100));
  const [lcrHeightInputValue, setLcrHeightInputValue] = reactExports.useState(String(clampLcrHeight(Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrHeightM)) ? Number(splConfig.lcrHeightM) : defaultLcrHeightM).toFixed(2)));
  const [lrHeightInputValue, setLrHeightInputValue] = reactExports.useState(String(clampLcrHeight(Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM)) ? Number(splConfig.lcrLRHeightM) : defaultLcrHeightM).toFixed(2)));
  reactExports.useEffect(() => {
    if (initialModel && initialModel !== lcrModel) setLcrModel(initialModel);
  }, [initialModel, lcrModel]);
  reactExports.useEffect(() => {
    if (derivedFrontStageMode !== frontStageMode) setFrontStageMode(derivedFrontStageMode);
    if (derivedSoundbarModel !== soundbarModel) setSoundbarModel(derivedSoundbarModel);
  }, [derivedFrontStageMode, derivedSoundbarModel, frontStageMode, soundbarModel]);
  reactExports.useEffect(() => {
    if (!dualCentreStage) return;
    if (derivedCentreModel && derivedCentreModel !== centreModel) setCentreModel(derivedCentreModel);
    const installed = centreCabinetOrientation(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers);
    if (installed !== centreOrientation) setCentreOrientation(installed);
  }, [
    dualCentreStage,
    derivedCentreModel,
    speakerSystem == null ? void 0 : speakerSystem.placedSpeakers,
    centreModel,
    centreOrientation
  ]);
  reactExports.useEffect(() => {
    setLcrPowerInputValue(String((splConfig == null ? void 0 : splConfig.lcrW) || 100));
  }, [splConfig == null ? void 0 : splConfig.lcrW]);
  reactExports.useEffect(() => {
    var _a2, _b2;
    const stored = Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM);
    const flZ = Number((_b2 = (_a2 = getByRole("FL")) == null ? void 0 : _a2.position) == null ? void 0 : _b2.z);
    const fallback = Number.isFinite(flZ) ? flZ : defaultLcrHeightM;
    const next = clampLcrHeight(Number.isFinite(stored) ? stored : fallback);
    setLrHeightInputValue(String(Number(next.toFixed(2))));
  }, [splConfig == null ? void 0 : splConfig.lcrLRHeightM, defaultLcrHeightM, clampLcrHeight, getByRole]);
  const handleLcrPowerChange = reactExports.useCallback((e) => {
    const newValue = e.target.value;
    if (newValue !== "" && !/^\d+$/.test(newValue)) return;
    setLcrPowerInputValue(newValue);
    if (newValue === "") return;
    const val = parseInt(newValue, 10);
    if (Number.isFinite(val) && val >= 1 && val <= 5e3) {
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrW: val });
    }
  }, [updateGlobalSpl]);
  const handleLcrPowerBlur = reactExports.useCallback((e) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isFinite(val) || val < 1 || val > 5e3) {
      const lastValid = (splConfig == null ? void 0 : splConfig.lcrW) || 100;
      setLcrPowerInputValue(String(lastValid));
    } else {
      const clamped = Math.max(1, Math.min(5e3, val));
      setLcrPowerInputValue(String(clamped));
      if (clamped !== ((splConfig == null ? void 0 : splConfig.lcrW) || 100)) {
        updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrW: clamped });
      }
    }
  }, [splConfig == null ? void 0 : splConfig.lcrW, updateGlobalSpl]);
  const updatePlacedLcrHeight = reactExports.useCallback((heightM) => {
    const rolesToUpdate = /* @__PURE__ */ new Set(["FL", "FC", "FR", "L", "C", "R", CENTRE_CABINET_ROLES.left, CENTRE_CABINET_ROLES.right]);
    setSpeakers == null ? void 0 : setSpeakers((prev) => Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker == null ? void 0 : speaker.role);
      if (!rolesToUpdate.has(role) || !(speaker == null ? void 0 : speaker.position)) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev);
  }, [setSpeakers]);
  const updatePlacedLRHeight = reactExports.useCallback((heightM) => {
    const lrRoles = /* @__PURE__ */ new Set(["FL", "FR", "L", "R"]);
    setSpeakers == null ? void 0 : setSpeakers((prev) => Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker == null ? void 0 : speaker.role);
      if (!lrRoles.has(role) || !(speaker == null ? void 0 : speaker.position)) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev);
  }, [setSpeakers]);
  const updatePlacedFCHeight = reactExports.useCallback((heightM) => {
    setSpeakers == null ? void 0 : setSpeakers((prev) => Array.isArray(prev) ? prev.map((speaker) => {
      const role = getCanonicalRole(speaker == null ? void 0 : speaker.role);
      if (role !== "FC" && role !== "C" || !(speaker == null ? void 0 : speaker.position)) return speaker;
      return { ...speaker, position: { ...speaker.position, z: heightM } };
    }) : prev);
  }, [setSpeakers]);
  const acousticCentreGuidance = reactExports.useMemo(() => {
    try {
      const activeModel = frontStageMode === "integrated_lcr" ? null : lcrModel;
      const modelMeta = activeModel ? getSpeakerModelMeta(activeModel) : null;
      const speakerHeightM = (modelMeta == null ? void 0 : modelMeta.heightM) || null;
      const screenBottom = Number(screen == null ? void 0 : screen.heightFromFloorM);
      const visWidthIn = Number(screen == null ? void 0 : screen.visibleWidthInches);
      const arStr = String((screen == null ? void 0 : screen.aspectRatio) || "16:9");
      const [arW2, arH2] = arStr.split(":").map(Number);
      const ratio = arW2 && arH2 ? arW2 / arH2 : 16 / 9;
      const viewableHeightM = Number.isFinite(visWidthIn) && visWidthIn > 0 ? visWidthIn * 0.0254 / ratio : null;
      const currentAcousticCentreM = Number.isFinite(Number(lcrHeightInputValue)) ? Number(lcrHeightInputValue) : null;
      const seatedEarHeightM = Number.isFinite(mlpPoint == null ? void 0 : mlpPoint.z) ? mlpPoint.z : 1.2;
      return calculateLcrAcousticCentreBand({
        screenBottomHeightM: Number.isFinite(screenBottom) ? screenBottom : null,
        viewableImageHeightM: viewableHeightM,
        seatedEarHeightM,
        speakerHeightM,
        currentAcousticCentreM
      });
    } catch {
      return null;
    }
  }, [
    lcrModel,
    frontStageMode,
    screen == null ? void 0 : screen.heightFromFloorM,
    screen == null ? void 0 : screen.visibleWidthInches,
    screen == null ? void 0 : screen.aspectRatio,
    lcrHeightInputValue,
    mlpPoint == null ? void 0 : mlpPoint.z
  ]);
  const activeHeightGuidance = reactExports.useMemo(() => {
    const isTv = Boolean(screen == null ? void 0 : screen.tvPresetKey);
    if (!isTv) return acousticCentreGuidance;
    const currentAcousticCentreM = Number.isFinite(Number(lcrHeightInputValue)) ? Number(lcrHeightInputValue) : null;
    const activeSoundbarMeta = soundbarModel ? resolveSoundbarMeta(soundbarModel, screen) : null;
    const soundbarHeightM = Number.isFinite(Number(activeSoundbarMeta == null ? void 0 : activeSoundbarMeta.heightM)) ? Number(activeSoundbarMeta.heightM) : Number.isFinite(Number(activeSoundbarMeta == null ? void 0 : activeSoundbarMeta.heightMm)) ? Number(activeSoundbarMeta.heightMm) / 1e3 : null;
    return calculateTvFrontStageHeightGuidance({
      isTv,
      frontStageMode,
      screenBottomHeightM: Number(screen == null ? void 0 : screen.heightFromFloorM),
      viewableImageHeightM: screenHeightM,
      soundbarHeightM,
      placementOffsetFromScreenBottomMm: activeSoundbarMeta == null ? void 0 : activeSoundbarMeta.placementOffsetFromScreenBottomMm,
      currentAcousticCentreM
    });
  }, [
    acousticCentreGuidance,
    frontStageMode,
    lcrHeightInputValue,
    screen,
    screenHeightM,
    soundbarModel
  ]);
  const recommendedLcrHeightM = reactExports.useMemo(() => {
    const ideal = Number(activeHeightGuidance == null ? void 0 : activeHeightGuidance.idealHeightM);
    return Number.isFinite(ideal) ? clampLcrHeight(ideal) : clampLcrHeight(defaultLcrHeightM);
  }, [activeHeightGuidance == null ? void 0 : activeHeightGuidance.idealHeightM, clampLcrHeight, defaultLcrHeightM]);
  reactExports.useEffect(() => {
    if (lcrHeightManual) {
      const stored2 = Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrHeightM)) ? Number(splConfig.lcrHeightM) : recommendedLcrHeightM;
      const next = clampLcrHeight(stored2);
      setLcrHeightInputValue(String(Number(next.toFixed(2))));
      return;
    }
    const target = recommendedLcrHeightM;
    setLcrHeightInputValue(String(Number(target.toFixed(2))));
    const stored = Number(splConfig == null ? void 0 : splConfig.lcrHeightM);
    if (!Number.isFinite(stored) || Math.abs(stored - target) > 5e-3) {
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightM: target, lcrHeightManual: false });
      if (frontStageMode === "center_only") {
        updatePlacedFCHeight == null ? void 0 : updatePlacedFCHeight(target);
      } else {
        updatePlacedLcrHeight == null ? void 0 : updatePlacedLcrHeight(target);
      }
    }
  }, [lcrHeightManual, recommendedLcrHeightM, splConfig == null ? void 0 : splConfig.lcrHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLcrHeight, updatePlacedFCHeight, frontStageMode]);
  reactExports.useEffect(() => {
    if (frontStageMode !== "center_only") return;
    if (lcrLRHeightManual) {
      const stored2 = Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM)) ? Number(splConfig.lcrLRHeightM) : tvVerticalCentreM;
      const next = clampLcrHeight(stored2);
      setLrHeightInputValue(String(Number(next.toFixed(2))));
      return;
    }
    const target = tvVerticalCentreM;
    setLrHeightInputValue(String(Number(target.toFixed(2))));
    const stored = Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM);
    if (!Number.isFinite(stored) || Math.abs(stored - target) > 5e-3) {
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrLRHeightM: target, lcrLRHeightManual: false });
      updatePlacedLRHeight == null ? void 0 : updatePlacedLRHeight(target);
    }
  }, [frontStageMode, lcrLRHeightManual, tvVerticalCentreM, splConfig == null ? void 0 : splConfig.lcrLRHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLRHeight]);
  reactExports.useCallback((e) => {
    const newValue = e.target.value;
    if (newValue !== "" && !/^\d*\.?\d*$/.test(newValue)) return;
    setLcrHeightInputValue(newValue);
    if (newValue === "" || newValue.endsWith(".")) return;
    const val = Number(newValue);
    const maxHeight = roomH - 0.2;
    if (Number.isFinite(val) && val >= 0.2 && val <= maxHeight) {
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightM: val });
      updatePlacedLcrHeight(val);
    }
  }, [roomH, updateGlobalSpl, updatePlacedLcrHeight]);
  reactExports.useCallback((e) => {
    const val = Number(e.target.value);
    const fallback = Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrHeightM)) ? Number(splConfig.lcrHeightM) : defaultLcrHeightM;
    const clamped = clampLcrHeight(Number.isFinite(val) ? val : fallback);
    setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
    updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightM: clamped });
    updatePlacedLcrHeight(clamped);
  }, [clampLcrHeight, defaultLcrHeightM, splConfig == null ? void 0 : splConfig.lcrHeightM, updateGlobalSpl, updatePlacedLcrHeight]);
  const onToggleLcrHeightManual = reactExports.useCallback((nextManual) => {
    if (nextManual) {
      const current = Number(lcrHeightInputValue);
      const clamped = clampLcrHeight(Number.isFinite(current) ? current : recommendedLcrHeightM);
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightManual: true, lcrHeightM: clamped });
      setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
    } else {
      const target = recommendedLcrHeightM;
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightManual: false, lcrHeightM: target });
      if (frontStageMode === "center_only") {
        updatePlacedFCHeight == null ? void 0 : updatePlacedFCHeight(target);
      } else {
        updatePlacedLcrHeight == null ? void 0 : updatePlacedLcrHeight(target);
      }
      setLcrHeightInputValue(String(Number(target.toFixed(2))));
    }
  }, [lcrHeightInputValue, recommendedLcrHeightM, clampLcrHeight, updateGlobalSpl, updatePlacedLcrHeight, updatePlacedFCHeight, frontStageMode]);
  const applyFrontStage = reactExports.useCallback((nextBaseModel, nextMode, nextSoundbarModel, nextCentreModel = null, nextCentreOrientation = null) => {
    buildFrontStageSeed({
      baseModelLabel: nextBaseModel,
      frontStageMode: nextMode,
      soundbarModelLabel: nextSoundbarModel,
      // Dual centre only: the ONE model both physical centre cabinets are built
      // from, and the orientation they are installed in (null = the product's own
      // form, an installed cabinet's own orientation always wins).
      centreModelLabel: nextMode === FRONT_STAGE_DUAL_CENTRE ? nextCentreModel : null,
      centreOrientation: nextMode === FRONT_STAGE_DUAL_CENTRE ? nextCentreOrientation : null,
      dimensions,
      screen,
      splConfig,
      setSpeakers,
      // Initial placement context. The canonical RSP is the published green-dot
      // position — the same authority the LCR zones and the plan view use — so
      // the speaker is placed where it will stay.
      rsp: resolveCanonicalRsp({
        roomDims: dimensions,
        mlpX_m: appState == null ? void 0 : appState.mlpX_m,
        mlpY_m: appState == null ? void 0 : appState.mlpY_m,
        fallbackMlp: mlpPoint
      }),
      screenFrontPlaneM: appState == null ? void 0 : appState.screenFrontPlaneM,
      lcrAimMode
    });
  }, [
    dimensions,
    screen,
    splConfig,
    setSpeakers,
    appState == null ? void 0 : appState.mlpX_m,
    appState == null ? void 0 : appState.mlpY_m,
    appState == null ? void 0 : appState.screenFrontPlaneM,
    mlpPoint,
    lcrAimMode
  ]);
  const onChooseModel = reactExports.useCallback((modelLabel) => {
    if (!standardLcrOptions.some((opt) => opt.label === modelLabel)) return;
    setLcrModel(modelLabel);
    applyFrontStage(modelLabel, frontStageMode, soundbarModel, centreModel, centreOrientation);
  }, [standardLcrOptions, applyFrontStage, frontStageMode, soundbarModel, centreModel, centreOrientation]);
  const onChooseCentreModel = reactExports.useCallback((modelLabel) => {
    if (!centreOptions.some((opt) => opt.label === modelLabel)) return;
    setCentreModel(modelLabel);
    applyFrontStage(lcrModel, FRONT_STAGE_DUAL_CENTRE, soundbarModel, modelLabel, centreOrientation);
  }, [centreOptions, applyFrontStage, lcrModel, soundbarModel, centreOrientation]);
  const onChooseCentreOrientation = reactExports.useCallback((value) => {
    const next = normaliseCabinetOrientation(value);
    setCentreOrientation(next);
    if (!centreModel) return;
    applyFrontStage(lcrModel, FRONT_STAGE_DUAL_CENTRE, soundbarModel, centreModel, next);
  }, [applyFrontStage, lcrModel, soundbarModel, centreModel]);
  const onChooseCentreAim = reactExports.useCallback((atRsp) => {
    setSpeakers == null ? void 0 : setSpeakers((prev) => withCentreCabinetAim(prev, atRsp));
  }, [setSpeakers]);
  const centreAimAtRsp = reactExports.useMemo(
    () => centreCabinetAimAtRsp(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers),
    [speakerSystem == null ? void 0 : speakerSystem.placedSpeakers]
  );
  const centreCabinetAims = reactExports.useMemo(() => {
    if (!dualCentreStage || !centreAimAtRsp) return null;
    return centreCabinets(speakerSystem == null ? void 0 : speakerSystem.placedSpeakers).map((cabinet) => ({
      role: getCanonicalRole(cabinet == null ? void 0 : cabinet.role),
      yawDeg: resolveSpeakerYaw({ speaker: cabinet, mlpPos: mlpPoint, appState: {} })
    }));
  }, [dualCentreStage, centreAimAtRsp, speakerSystem == null ? void 0 : speakerSystem.placedSpeakers, mlpPoint]);
  const onClearLcrModel = reactExports.useCallback(() => {
    setLcrModel("");
    const lcrRoleSet = /* @__PURE__ */ new Set(["FL", "FC", "FR", "L", "C", "R"]);
    setSpeakers == null ? void 0 : setSpeakers((prev) => Array.isArray(prev) ? prev.map((s) => {
      const role = getCanonicalRole(s == null ? void 0 : s.role);
      if (!lcrRoleSet.has(role)) return s;
      const next = { ...s };
      delete next.model;
      return next;
    }) : prev);
  }, [setSpeakers]);
  const onChooseFrontStageMode = reactExports.useCallback((mode) => {
    const nextMode = normaliseFrontStageMode(mode);
    const nextSoundbarModel = nextMode === FRONT_STAGE_STANDARD || nextMode === FRONT_STAGE_DUAL_CENTRE ? "" : nextMode === "center_only" ? CENTER_ONLY_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : CENTER_ONLY_SOUNDBAR_LABELS[0] : INTEGRATED_LCR_SOUNDBAR_LABELS.includes(soundbarModel) ? soundbarModel : INTEGRATED_LCR_SOUNDBAR_LABELS[0];
    const nextCentreModel = nextMode === FRONT_STAGE_DUAL_CENTRE ? centreOptions.some((opt) => opt.label === centreModel) ? centreModel : defaultDualCentreCentreModelLabel(centreOptions, screen == null ? void 0 : screen.tvPresetKey) : "";
    if (nextMode === FRONT_STAGE_DUAL_CENTRE) setCentreModel(nextCentreModel);
    if (nextMode === "center_only" && !Number.isFinite(Number(splConfig == null ? void 0 : splConfig.lcrLRHeightM))) {
      const tvCentre = clampLcrHeight(tvVerticalCentreM);
      setLrHeightInputValue(String(Number(tvCentre.toFixed(2))));
      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrLRHeightM: tvCentre, lcrLRHeightManual: false });
    }
    setFrontStageMode(nextMode);
    setSoundbarModel(nextSoundbarModel);
    applyFrontStage(lcrModel, nextMode, nextSoundbarModel, nextCentreModel, null);
  }, [applyFrontStage, lcrModel, soundbarModel, centreModel, centreOptions, splConfig == null ? void 0 : splConfig.lcrLRHeightM, splConfig == null ? void 0 : splConfig.lcrHeightM, defaultLcrHeightM, clampLcrHeight, updateGlobalSpl, tvVerticalCentreM, screen == null ? void 0 : screen.tvPresetKey]);
  const onChooseSoundbarModel = reactExports.useCallback((modelLabel) => {
    if (!soundbarOptions.some((opt) => opt.label === modelLabel)) return;
    setSoundbarModel(modelLabel);
    const meta = getSpeakerModelMeta(modelLabel);
    const nextMode = (meta == null ? void 0 : meta.frontStageType) === "integrated_lcr" ? "integrated_lcr" : "center_only";
    if (nextMode !== frontStageMode) setFrontStageMode(nextMode);
    applyFrontStage(lcrModel, nextMode, modelLabel);
  }, [soundbarOptions, applyFrontStage, lcrModel, frontStageMode]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "lcr-model", className: "text-[#3E4349] font-medium", children: "LCR Model" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: lcrModel || void 0, onValueChange: (val) => {
            if (val === "__none__") onClearLcrModel();
            else onChooseModel(val);
          }, disabled, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id: "lcr-model", className: "w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-2xl font-semibold", style: { color: "#213428" }, children: frontStageMode === "integrated_lcr" ? "-" : lcrModel ? ((_b = getSpeakerModelMeta(lcrModel)) == null ? void 0 : _b.label) || lcrModel : "Select LCR model" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { className: "bg-white border-[#DCDBD6]", children: [
              lcrModel && /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none__", className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#9B9890" }, children: "— Clear selection —" }),
              standardLcrOptions.map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.label, className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: model.label }, model.key))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "front-stage-mode", className: "text-[#3E4349] font-medium", children: "Front Stage" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: frontStageMode, onValueChange: onChooseFrontStageMode, disabled, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id: "front-stage-mode", className: "w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-base font-semibold", style: { color: "#213428" }, children: FRONT_STAGE_MODE_LABELS[frontStageMode] || FRONT_STAGE_MODE_LABELS[FRONT_STAGE_STANDARD] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: FRONT_STAGE_MODE_OPTIONS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: option.value, className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: option.label }, option.value)) })
          ] })
        ] })
      ] }),
      frontStageMode !== "standard" && frontStageMode !== FRONT_STAGE_DUAL_CENTRE && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "front-stage-soundbar", className: "text-[#3E4349] font-medium", children: "Soundbar Model" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: soundbarModel || void 0, onValueChange: onChooseSoundbarModel, disabled, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id: "front-stage-soundbar", className: "w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-base font-semibold", style: { color: "#213428" }, children: soundbarModel ? ((_c = getSpeakerModelMeta(soundbarModel)) == null ? void 0 : _c.label) || soundbarModel : "Select soundbar model" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: soundbarOptions.filter(
            (model) => frontStageMode === "center_only" ? CENTER_ONLY_SOUNDBAR_LABELS.includes(model.label) : INTEGRATED_LCR_SOUNDBAR_LABELS.includes(model.label)
          ).map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.label, className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: model.label }, model.key)) })
        ] })
      ] }),
      frontStageMode === FRONT_STAGE_DUAL_CENTRE && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "dual-centre-model", className: "text-[#3E4349] font-medium", children: "Centre Model (two cabinets)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: centreModel || void 0, onValueChange: onChooseCentreModel, disabled, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id: "dual-centre-model", className: "w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-base font-semibold", style: { color: "#213428" }, children: centreModel || "Select centre model" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: centreOptions.map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: model.label, className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: model.label }, model.key)) })
            ] }),
            needsSeriesParallelWarning(centreModel) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1", children: "Wire series/parallel" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "dual-centre-orientation", className: "text-[#3E4349] font-medium", children: "Centre Cabinet Orientation" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: centreOrientation, onValueChange: onChooseCentreOrientation, disabled, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id: "dual-centre-orientation", className: "w-full h-10 px-3 py-2 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-base font-semibold", style: { color: "#213428" }, children: ((_d = CABINET_ORIENTATION_OPTIONS.find((opt) => opt.value === centreOrientation)) == null ? void 0 : _d.label) || "Horizontal" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { className: "bg-white border-[#DCDBD6]", children: CABINET_ORIENTATION_OPTIONS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: option.value, className: "hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", style: { color: "#213428" }, children: option.label }, option.value)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-[#3E4349] font-medium", children: "Aiming" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: CENTRE_CABINET_AIM_OPTIONS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: centreAimAtRsp === option.atRsp ? "default" : "outline",
              className: centreAimAtRsp === option.atRsp ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
              onClick: () => onChooseCentreAim(option.atRsp),
              disabled,
              children: option.label
            },
            option.label
          )) }),
          centreCabinetAims && centreCabinetAims.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#8B7F76] pt-1", children: centreCabinetAims.map((aim) => `${aim.role} ${Math.round(aim.yawDeg)}°`).join("   ·   ") })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-[#8B7F76]", children: centreChannelAngleDeg === null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        "Angle to MLP: ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-medium text-[#625143]", children: [
          Math.round(lcrAngleDeg),
          "°"
        ] })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        "Centre Angle: ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-medium text-[#625143]", children: [
          Math.round(centreChannelAngleDeg),
          "°"
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143] mb-2 block", children: "SPL @ RSP" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-2", children: lcrRoles.map((role) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          LcrSplCard,
          {
            role,
            label: role === "FL" ? "Left" : role === "FC" ? "Center" : "Right",
            allSeatSplMetrics,
            integratedLcrMode: derivedFrontStageMode === "integrated_lcr",
            dualCentre: role === "FC" && derivedFrontStageMode === FRONT_STAGE_DUAL_CENTRE
          },
          role
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: "Amplifier Power (LCR)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "text",
              inputMode: "numeric",
              pattern: "[0-9]*",
              value: lcrPowerInputValue,
              onChange: handleLcrPowerChange,
              onBlur: handleLcrPowerBlur,
              disabled,
              className: "pr-8"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none", children: "W" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: "Parameter 12. Screen speakers SPL capability at RSP" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: p12ActiveMode === "minimum" ? "default" : "outline",
              className: p12ActiveMode === "minimum" ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
              onClick: () => {
                var _a2;
                return (_a2 = appState == null ? void 0 : appState.setP12Mode) == null ? void 0 : _a2.call(appState, "minimum");
              },
              disabled,
              children: "Minimum"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: p12ActiveMode === P12_MODE_RECOMMENDED ? "default" : "outline",
              className: p12ActiveMode === P12_MODE_RECOMMENDED ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
              onClick: () => {
                var _a2;
                return (_a2 = appState == null ? void 0 : appState.setP12Mode) == null ? void 0 : _a2.call(appState, P12_MODE_RECOMMENDED);
              },
              disabled,
              children: "Recommended"
            }
          )
        ] }),
        p12Computed && /* @__PURE__ */ jsxRuntimeExports.jsx(
          RP22LabelledLevelPill,
          {
            level: p12Computed.level,
            label: "RP22 P12"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-[#DCDBD6] bg-[#F8F8F7]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 pt-3 pb-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold tracking-[0.08em] uppercase text-[#625143]", children: "Acoustic Centre Height" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-[#625143]", children: "Manual override" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: lcrHeightManual,
              onCheckedChange: onToggleLcrHeightManual,
              disabled
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 pb-3 space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: frontStageMode === "center_only" ? "Centre soundbar height (to middle of speaker)" : frontStageMode === FRONT_STAGE_DUAL_CENTRE ? "Centre speakers height from floor (to middle of speaker)" : "LCR height from floor (to middle of speaker)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-[#625143]", children: lcrHeightManual ? "Manual" : `Auto: ${formatHeightM(recommendedLcrHeightM)}` })
        ] }),
        frontStageMode === "center_only" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-[11px] text-[#625143]", children: "Left / Right height from floor (to middle of speaker)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-[#625143]", children: lcrLRHeightManual ? "Manual" : `Auto: ${formatHeightM(tvVerticalCentreM)}` })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                StepperInput,
                {
                  value: Number(lrHeightInputValue) || 0,
                  step: 0.01,
                  min: 0.2,
                  max: roomH - 0.2,
                  disabled,
                  onChange: (val) => {
                    const clamped = clampLcrHeight(val);
                    setLrHeightInputValue(String(Number(clamped.toFixed(2))));
                    updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrLRHeightM: clamped, lcrLRHeightManual: true });
                    updatePlacedLRHeight(clamped);
                  }
                }
              ),
              lcrLRHeightManual && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  className: "text-[11px] text-[#213428] underline underline-offset-2 hover:no-underline whitespace-nowrap",
                  onClick: () => {
                    const target = clampLcrHeight(tvVerticalCentreM);
                    updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrLRHeightM: target, lcrLRHeightManual: false });
                    setLrHeightInputValue(String(Number(target.toFixed(2))));
                    updatePlacedLRHeight(target);
                  },
                  disabled,
                  children: "Auto"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-[11px] text-[#625143]", children: "Centre soundbar height from floor (to middle of speaker)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              StepperInput,
              {
                value: Number(lcrHeightInputValue) || 0,
                step: 0.01,
                min: 0.2,
                max: roomH - 0.2,
                disabled: disabled || !lcrHeightManual,
                onChange: (val) => {
                  if (!lcrHeightManual) return;
                  const clamped = clampLcrHeight(val);
                  setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
                  updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightM: clamped });
                  updatePlacedFCHeight(clamped);
                }
              }
            )
          ] }),
          hasLcrSubClash && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-red-600", children: "⚠ Speaker and subwoofer clashing" })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            StepperInput,
            {
              value: Number(lcrHeightInputValue) || 0,
              step: 0.01,
              min: 0.2,
              max: roomH - 0.2,
              disabled: disabled || !lcrHeightManual,
              onChange: (val) => {
                if (!lcrHeightManual) return;
                const clamped = clampLcrHeight(val);
                setLcrHeightInputValue(String(Number(clamped.toFixed(2))));
                updateGlobalSpl == null ? void 0 : updateGlobalSpl({ lcrHeightM: clamped });
                updatePlacedLcrHeight(clamped);
              }
            }
          ),
          hasLcrSubClash && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium text-red-600", children: "⚠ Speaker and subwoofer clashing" })
        ] }),
        frontStageMode !== "center_only" && /* @__PURE__ */ jsxRuntimeExports.jsx(LcrAcousticCentreGuidanceCard, { guidance: activeHeightGuidance })
      ] })
    ] }) })
  ] }) });
}
function countDiscreteSpeakers(preset) {
  const config = audioConfigurations[preset];
  if (!config || !Array.isArray(config.speakers)) return 0;
  return config.speakers.filter((s) => s.type !== "sub").length;
}
function p2LevelForFormat(preset) {
  const count = countDiscreteSpeakers(preset);
  if (count <= 0) return "";
  if (count >= 15) return "L4";
  if (count >= 11) return "L2";
  if (count >= 5) return "L1";
  return "";
}
const P13_THRESHOLDS_REC = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_MIN = { L1: 96, L2: 99, L3: 102, L4: 105 };
function computeRP22Level(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return "FAIL";
}
const SURROUND_BED_ROLES = /* @__PURE__ */ new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);
const UnifiedSurroundsConfig = UnifiedSurroundsConfig$1;
const MemoizedUnifiedSurroundsConfig = React.memo(UnifiedSurroundsConfig);
function formatDolbyLabel(key) {
  const [a = "5", b = "1", c = "0"] = String(key).split(".");
  const overheads = Number(c) || 0;
  return overheads > 0 ? `${a}.${b}.${overheads} Dolby Atmos` : `${a}.${b} Surround`;
}
function SpeakerPlacementImpl(props) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N;
  const dimensions = props == null ? void 0 : props.dimensions;
  const appState = useAppState() || {};
  const { splConfig = {}, updateGlobalSpl } = appState;
  const [surroundsPowerInputValue, setSurroundsPowerInputValue] = reactExports.useState(
    String((splConfig == null ? void 0 : splConfig.surroundsW) ?? 100)
  );
  reactExports.useEffect(() => {
    setSurroundsPowerInputValue(String((splConfig == null ? void 0 : splConfig.surroundsW) || 100));
  }, [splConfig == null ? void 0 : splConfig.surroundsW]);
  const dimsSafe = React.useMemo(() => {
    const src = dimensions || props.roomDimensions || {};
    return {
      width: Number(src.width ?? src.widthM) || 4.5,
      length: Number(src.length ?? src.lengthM) || 6,
      height: Number(src.height ?? src.heightM) || 2.4
    };
  }, [dimensions, props.roomDimensions]);
  const {
    disabled = false,
    dimensions: dimensionsProp,
    // NEW: Room dimensions from parent
    sevenBedLayoutType,
    onSevenBedLayoutTypeChange,
    dolbyPreset,
    onDolbyPresetChange,
    lcrAimMode = "flat",
    onChangeLcrAimMode = () => {
    },
    lcrAngleDeg = 0,
    allSeatSplMetrics,
    // NEW: SPL data from parent
    extraSurroundCount,
    onExtraSurroundCountChange,
    allowExtraSurrounds
  } = props;
  const {
    speakerSystem,
    setSpeakerSystem,
    seatingPositions,
    setDolbyConfig,
    showToast,
    setUseWidesInsteadOfRears,
    overheadGlobalModel,
    setOverheadGlobalModel,
    overheadFrontOverride,
    setOverheadFrontOverride,
    overheadMidOverride,
    setOverheadMidOverride,
    overheadRearOverride,
    setOverheadRearOverride,
    useFrontGlobal,
    setUseFrontGlobal,
    useMidGlobal,
    setUseMidGlobal,
    useRearGlobal,
    setUseRearGlobal
  } = appState;
  const effectiveDims = React.useMemo(() => {
    var _a2, _b2, _c2, _d2, _e2, _f2;
    const propW = Number((dimensionsProp == null ? void 0 : dimensionsProp.width) ?? (dimensionsProp == null ? void 0 : dimensionsProp.widthM));
    const propL = Number((dimensionsProp == null ? void 0 : dimensionsProp.length) ?? (dimensionsProp == null ? void 0 : dimensionsProp.lengthM));
    const propH = Number((dimensionsProp == null ? void 0 : dimensionsProp.height) ?? (dimensionsProp == null ? void 0 : dimensionsProp.heightM));
    const appW = Number(((_a2 = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _a2.widthM) ?? ((_b2 = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _b2.width));
    const appL = Number(((_c2 = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _c2.lengthM) ?? ((_d2 = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _d2.length));
    const appH = Number(((_e2 = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _e2.heightM) ?? ((_f2 = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _f2.height));
    const DEFAULT_WIDTH = 4.5;
    const DEFAULT_LENGTH = 6;
    const DEFAULT_HEIGHT = 2.4;
    const finalWidth = Number.isFinite(propW) && propW > 0 ? propW : Number.isFinite(appW) && appW > 0 ? appW : DEFAULT_WIDTH;
    const finalLength = Number.isFinite(propL) && propL > 0 ? propL : Number.isFinite(appL) && appL > 0 ? appL : DEFAULT_LENGTH;
    const finalHeight = Number.isFinite(propH) && propH > 0 ? propH : Number.isFinite(appH) && appH > 0 ? appH : DEFAULT_HEIGHT;
    const result = {
      width: finalWidth,
      length: finalLength,
      height: finalHeight,
      widthM: finalWidth,
      lengthM: finalLength,
      heightM: finalHeight
    };
    if (globalThis.__B44_LOGS) {
      console.log("[SP effectiveDims]", {
        propDims: dimensionsProp,
        appDims: appState == null ? void 0 : appState.roomDims,
        effectiveDims: result,
        W: finalWidth,
        L: finalLength,
        H: finalHeight
      });
    }
    return result;
  }, [
    dimensionsProp == null ? void 0 : dimensionsProp.width,
    dimensionsProp == null ? void 0 : dimensionsProp.widthM,
    dimensionsProp == null ? void 0 : dimensionsProp.length,
    dimensionsProp == null ? void 0 : dimensionsProp.lengthM,
    dimensionsProp == null ? void 0 : dimensionsProp.height,
    dimensionsProp == null ? void 0 : dimensionsProp.heightM,
    (_a = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _a.widthM,
    (_b = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _b.width,
    (_c = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _c.lengthM,
    (_d = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _d.length,
    (_e = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _e.heightM,
    (_f = appState == null ? void 0 : appState.roomDims) == null ? void 0 : _f.height
  ]);
  if (globalThis.__B44_LOGS) console.log("[B44] DIMENSIONS CHECK", {
    propDims: dimensionsProp,
    effectiveDims,
    width: effectiveDims == null ? void 0 : effectiveDims.width,
    length: effectiveDims == null ? void 0 : effectiveDims.length,
    height: effectiveDims == null ? void 0 : effectiveDims.height
  });
  const frontSubsCfg = (appState == null ? void 0 : appState.frontSubsCfg) || (props == null ? void 0 : props.frontSubsCfg) || {
    enabled: false,
    count: 0,
    model: null,
    placement: "front"
  };
  const rearSubsCfg = (appState == null ? void 0 : appState.rearSubsCfg) || (props == null ? void 0 : props.rearSubsCfg) || {
    enabled: false,
    count: 0,
    model: null,
    placement: "rear"
  };
  const subWarnings = (appState == null ? void 0 : appState.subWarnings) || { front: [], rear: [] };
  const _rawPreset = typeof dolbyPreset === "string" && dolbyPreset || typeof (appState == null ? void 0 : appState.dolbyLayout) === "string" && appState.dolbyLayout;
  const effectivePreset = _rawPreset || ((((_g = speakerSystem == null ? void 0 : speakerSystem.placedSpeakers) == null ? void 0 : _g.length) ?? 0) > 0 ? "5.1" : "");
  const is7xBed = React.useMemo(() => {
    const preset = String(effectivePreset || "");
    return preset.startsWith("7.1") || preset.startsWith("7.2");
  }, [effectivePreset]);
  const useWides = React.useMemo(() => {
    if (!is7xBed) return false;
    return String(sevenBedLayoutType || "").toLowerCase() === "wides";
  }, [is7xBed, sevenBedLayoutType]);
  React.useEffect(() => {
    if (!appState || typeof appState.setUseWidesInsteadOfRears !== "function") return;
    if (!is7xBed) {
      appState.setUseWidesInsteadOfRears(false);
      return;
    }
    appState.setUseWidesInsteadOfRears(useWides);
  }, [appState, is7xBed, useWides]);
  const allowedRoles = React.useMemo(() => {
    const layout = String(effectivePreset || "5.1");
    const major = parseInt(layout.split(".")[0], 10) || 5;
    const roles = /* @__PURE__ */ new Set();
    if (major >= 5) {
      roles.add("SL");
      roles.add("SR");
    }
    const showRears = major === 7 && !useWides || major >= 9;
    const showWides7 = major === 7 && !!useWides;
    if (showRears || major >= 9) {
      roles.add("SBL");
      roles.add("SBR");
    }
    if (showWides7 || major >= 9) {
      roles.add("LW");
      roles.add("RW");
    }
    return roles;
  }, [effectivePreset, useWides]);
  const placedSpeakers = reactExports.useMemo(() => (speakerSystem == null ? void 0 : speakerSystem.placedSpeakers) || [], [speakerSystem == null ? void 0 : speakerSystem.placedSpeakers]);
  const lastPresetRef = reactExports.useRef(effectivePreset);
  const __b44LastEffectSigRef = reactExports.useRef({});
  const needsSurroundResetRef = React.useRef(false);
  const lastSurroundModelKeyRef = React.useRef(null);
  const globalSurroundModel = reactExports.useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return null;
    for (const spk of placedSpeakers) {
      const canon = getCanonicalRole(spk.role);
      if (SURROUND_BED_ROLES.has(canon) && spk.model && spk.model !== "off" && spk.model !== "none") {
        return spk.model;
      }
    }
    return null;
  }, [placedSpeakers]);
  const overheadCount = reactExports.useMemo(() => {
    if (!effectivePreset) return 0;
    const parts = effectivePreset.split(".");
    if (parts.length < 3) return 0;
    return parseInt(parts[2]) || 0;
  }, [effectivePreset]);
  const CORNER_CLEARANCE_M = 0.5;
  const WALL_BUFFER_M = 0.01;
  const getModelDimsM = React.useCallback((model) => {
    const meta = getSpeakerModelMeta(model);
    return {
      widthM: Number(meta == null ? void 0 : meta.widthM) || 0.27,
      depthM: Number(meta == null ? void 0 : meta.depthM) || 0.082
    };
  }, []);
  const getHuggingCenterLines = reactExports.useCallback((speakerModel, roomDimensions) => {
    const W = Number((roomDimensions == null ? void 0 : roomDimensions.width) ?? (roomDimensions == null ? void 0 : roomDimensions.widthM)) || 0;
    const L = Number((roomDimensions == null ? void 0 : roomDimensions.length) ?? (roomDimensions == null ? void 0 : roomDimensions.lengthM)) || 0;
    const { widthM, depthM } = getModelDimsM(speakerModel);
    const shortEdge = Math.min(widthM, depthM);
    const longEdge = Math.max(widthM, depthM);
    return {
      leftWallX: shortEdge / 2 + WALL_BUFFER_M,
      rightWallX: W - shortEdge / 2 - WALL_BUFFER_M,
      backWallY: L - shortEdge / 2 - WALL_BUFFER_M,
      shortEdge,
      longEdge
    };
  }, [getModelDimsM, WALL_BUFFER_M]);
  const applyCornerClearance = reactExports.useCallback((position, role, speakerModel, roomDimensions, zones) => {
    const W = Number((roomDimensions == null ? void 0 : roomDimensions.width) ?? (roomDimensions == null ? void 0 : roomDimensions.widthM)) || 0;
    const L = Number((roomDimensions == null ? void 0 : roomDimensions.length) ?? (roomDimensions == null ? void 0 : roomDimensions.lengthM)) || 0;
    const hugging = getHuggingCenterLines(speakerModel, roomDimensions);
    const { shortEdge, longEdge } = hugging;
    let { x, y, z } = position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(W) || !Number.isFinite(L) || !Number.isFinite(shortEdge) || !Number.isFinite(longEdge)) {
      console.warn("[applyCornerClearance] Non-finite input detected", { x, y, W, L, shortEdge, longEdge });
      return { x, y, z };
    }
    const isOnLeftWall = Math.abs(x - hugging.leftWallX) < 1e-3;
    const isOnRightWall = Math.abs(x - hugging.rightWallX) < 1e-3;
    const isOnBackWall = Math.abs(y - hugging.backWallY) < 1e-3;
    const zone = (zones == null ? void 0 : zones[role]) || {};
    if (isOnBackWall) {
      const zoneXMin = Number.isFinite(zone.xMin) ? zone.xMin : 0;
      const zoneXMax = Number.isFinite(zone.xMax) ? zone.xMax : W;
      const cornerClearanceLeft = CORNER_CLEARANCE_M + shortEdge / 2;
      const cornerClearanceRight = W - (CORNER_CLEARANCE_M + shortEdge / 2);
      const xMinWithClearance = Math.max(
        zoneXMin,
        cornerClearanceLeft,
        shortEdge / 2
        // minimum room bounds
      );
      const xMaxWithClearance = Math.min(
        zoneXMax,
        cornerClearanceRight,
        W - shortEdge / 2
        // maximum room bounds
      );
      if (xMinWithClearance >= xMaxWithClearance) {
        if (globalThis.__B44_LOGS) console.warn(`[applyCornerClearance] Impossible X range for ${role} on back wall. Using safe center.`, {
          xMinWithClearance,
          xMaxWithClearance,
          W,
          shortEdge,
          CORNER_CLEARANCE_M
        });
        x = (xMinWithClearance + xMaxWithClearance) / 2;
        if (!Number.isFinite(x)) {
          x = W / 2;
        }
      } else {
        x = Math.max(xMinWithClearance, Math.min(xMaxWithClearance, x));
      }
    } else if (isOnLeftWall || isOnRightWall) {
      const zoneYMin = Number.isFinite(zone.yMin) ? zone.yMin : 0;
      const zoneYMax = Number.isFinite(zone.yMax) ? zone.yMax : L;
      const cornerClearanceRear = L - (CORNER_CLEARANCE_M + longEdge / 2);
      const yMinFromZone = Math.max(
        zoneYMin,
        longEdge / 2
        // minimum room bounds
      );
      const yMaxWithRearClearance = Math.min(
        zoneYMax,
        cornerClearanceRear,
        L - longEdge / 2
        // maximum room bounds
      );
      if (yMinFromZone >= yMaxWithRearClearance) {
        if (globalThis.__B44_LOGS) console.warn(`[applyCornerClearance] Impossible Y range for ${role} on side wall. Using safe center.`, {
          yMinFromZone,
          yMaxWithRearClearance,
          L,
          longEdge,
          CORNER_CLEARANCE_M
        });
        y = (yMinFromZone + yMaxWithRearClearance) / 2;
        if (!Number.isFinite(y)) {
          y = L / 2;
        }
      } else {
        y = Math.max(yMinFromZone, Math.min(yMaxWithRearClearance, y));
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (globalThis.__B44_LOGS) console.error("[applyCornerClearance] FINAL NaN DETECTED. Using room center fallback.", { x, y, role });
      return { x: W / 2, y: L / 2, z };
    }
    return { x, y, z };
  }, [getHuggingCenterLines, CORNER_CLEARANCE_M]);
  const applyRoomBoundsClamp = reactExports.useCallback((position, speakerModel, roomDimensions) => {
    const W = Number((roomDimensions == null ? void 0 : roomDimensions.width) ?? (roomDimensions == null ? void 0 : roomDimensions.widthM)) || 0;
    const L = Number((roomDimensions == null ? void 0 : roomDimensions.length) ?? (roomDimensions == null ? void 0 : roomDimensions.lengthM)) || 0;
    const { shortEdge } = getHuggingCenterLines(speakerModel, roomDimensions);
    let { x, y, z } = position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(W) || !Number.isFinite(L) || !Number.isFinite(shortEdge)) {
      if (globalThis.__B44_LOGS) console.warn("[applyRoomBoundsClamp] Non-finite input detected", { x, y, W, L, shortEdge });
      return { x, y, z };
    }
    const minX = shortEdge / 2;
    const maxX = W - shortEdge / 2;
    const minY = shortEdge / 2;
    const maxY = L - shortEdge / 2;
    if (minX >= maxX || minY >= maxY) {
      if (globalThis.__B44_LOGS) console.warn("[applyRoomBoundsClamp] Room too small for speaker dimensions", {
        W,
        L,
        shortEdge,
        minX,
        maxX,
        minY,
        maxY
      });
      return { x: W / 2, y: L / 2, z };
    }
    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (globalThis.__B44_LOGS) console.error("[applyRoomBoundsClamp] FINAL NaN DETECTED after clamping", { x, y });
      return { x: W / 2, y: L / 2, z };
    }
    return { x, y, z };
  }, [getHuggingCenterLines]);
  function safePos(pos, mlp, fallbackZ = 1.1) {
    const p = pos || {};
    const x = Number.isFinite(p.x) ? p.x : p.x;
    const y = Number.isFinite(p.y) ? p.y : p.y;
    const z = Number.isFinite(p.z) ? p.z : fallbackZ;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (globalThis.__B44_LOGS) console.warn("[SP safePos] Non-finite coordinates detected (will NOT fallback to MLP):", {
        pos: p,
        x,
        y,
        z
      });
    }
    return { x, y, z };
  }
  const mlpPoint = reactExports.useMemo(() => {
    var _a2;
    const W = Number((effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM)) || 0;
    const L = Number((effectiveDims == null ? void 0 : effectiveDims.length) ?? (effectiveDims == null ? void 0 : effectiveDims.lengthM)) || 0;
    return ((_a2 = computeMLPAndPrimary(
      seatingPositions || [],
      W,
      L,
      "front"
    )) == null ? void 0 : _a2.mlp) || null;
  }, [seatingPositions, effectiveDims == null ? void 0 : effectiveDims.width, effectiveDims == null ? void 0 : effectiveDims.widthM, effectiveDims == null ? void 0 : effectiveDims.length, effectiveDims == null ? void 0 : effectiveDims.lengthM]);
  const computeAutoSurroundHeight = reactExports.useCallback(
    (seatingPos, roomH) => resolveAutoSurroundHeight(seatingPos, roomH),
    []
  );
  const setSpeakers = reactExports.useCallback((updater) => {
    setSpeakerSystem((prev) => {
      const current = Array.isArray(prev == null ? void 0 : prev.placedSpeakers) ? prev.placedSpeakers : [];
      const next = typeof updater === "function" ? updater(current) : updater;
      const nextArr = Array.isArray(next) ? next : [];
      if (typeof __b44SameSpeakers === "function" && __b44SameSpeakers(nextArr, current)) {
        return prev;
      }
      return { ...prev, placedSpeakers: nextArr };
    });
  }, [setSpeakerSystem]);
  const canSides = allowedRoles.has("SL") && allowedRoles.has("SR");
  const canRears = allowedRoles.has("SBL") && allowedRoles.has("SBR");
  const canWides = allowedRoles.has("LW") && allowedRoles.has("RW");
  const isNineBed = canRears && canWides;
  const is7xOrHigher = reactExports.useMemo(() => {
    const major = Number(String(effectivePreset).split(".")[0]) || 5;
    return major >= 7;
  }, [effectivePreset]);
  const mlpSeat = reactExports.useMemo(() => {
    return getMlpSeat(seatingPositions || []);
  }, [seatingPositions]);
  const [surroundConfig, setSurroundConfig] = reactExports.useState(() => {
    const savedModel = appState == null ? void 0 : appState.globalSurroundModel;
    const cleanedModel = savedModel && savedModel.endsWith && savedModel.endsWith("_s") ? savedModel.slice(0, -2) : savedModel;
    const master = cleanedModel && cleanedModel !== "off" && cleanedModel !== "none" ? cleanedModel : "off";
    return {
      value: { master, side: master, rear: master, wide: master },
      override: { side: false, rear: false, wide: false }
    };
  });
  const [surroundHeightConfig, setSurroundHeightConfig] = reactExports.useState({
    side: { mode: "auto", value: null },
    rear: { mode: "auto", value: null },
    wide: { mode: "auto", value: null }
  });
  reactExports.useEffect(() => {
    const savedModel = appState == null ? void 0 : appState.globalSurroundModel;
    const cleaned = savedModel && savedModel.endsWith && savedModel.endsWith("_s") ? savedModel.slice(0, -2) : savedModel;
    const master = cleaned && cleaned !== "off" && cleaned !== "none" ? cleaned : "off";
    setSurroundConfig((prev) => {
      if (prev.value.master === master) return prev;
      return {
        ...prev,
        value: {
          master,
          side: prev.override.side ? prev.value.side : master,
          rear: prev.override.rear ? prev.value.rear : master,
          wide: prev.override.wide ? prev.value.wide : master
        },
        // preserve existing override flags exactly
        override: prev.override
      };
    });
  }, [appState == null ? void 0 : appState.globalSurroundModel]);
  reactExports.useEffect(() => {
    var _a2;
    const master = (_a2 = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _a2.master;
    if (!master || master === "off") return;
    setSurroundConfig((prev) => {
      const next = { ...prev, value: { ...prev.value } };
      let changed = false;
      if (!prev.override.side && prev.value.side !== master) {
        next.value.side = master;
        changed = true;
      }
      if (!prev.override.rear && prev.value.rear !== master) {
        next.value.rear = master;
        changed = true;
      }
      if (!prev.override.wide && prev.value.wide !== master) {
        next.value.wide = master;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [(_h = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _h.master]);
  const lastSurroundResetSigRef = React.useRef(null);
  const resetSurroundPositions = reactExports.useCallback(
    (layoutString, mlp, dims, currentSpeakers, modelKeyParam) => {
      const list = Array.isArray(currentSpeakers) ? currentSpeakers : [];
      const W = Number(dims == null ? void 0 : dims.width);
      const L = Number(dims == null ? void 0 : dims.length);
      const sig = JSON.stringify({
        layout: String(layoutString || ""),
        model: String(modelKeyParam || "").trim(),
        W: Math.round((W || 0) * 1e3) / 1e3,
        L: Math.round((L || 0) * 1e3) / 1e3,
        mode: sevenBedLayoutType,
        mlpX: Math.round(((mlp == null ? void 0 : mlp.x) || 0) * 1e3) / 1e3,
        mlpY: Math.round(((mlp == null ? void 0 : mlp.y) || 0) * 1e3) / 1e3
      });
      const invalidAutoRearPair = hasInvalidAutomaticRearPair(list, { widthM: W });
      if (lastSurroundResetSigRef.current === sig && !invalidAutoRearPair) {
        console.log("[SP resetSurroundPositions CALLBACK] NO-OP (same inputs)");
        return list;
      }
      lastSurroundResetSigRef.current = sig;
      console.log("[SP resetSurroundPositions CALLBACK] HIT", { layoutString, modelKeyParam, W, L, dims, speakerCount: Array.isArray(currentSpeakers) ? currentSpeakers.length : null });
      if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
        if (globalThis.__B44_LOGS) console.warn("[SP resetSurroundPositions] ABORT: invalid dims", { W, L, dims });
        return list;
      }
      const rawKey = String(modelKeyParam || "").trim();
      const normKey = typeof normaliseModelKey === "function" ? normaliseModelKey(rawKey) : rawKey;
      const keyLower = String(normKey || "").trim().toLowerCase();
      const modelOn = !!keyLower && keyLower !== "off" && keyLower !== "none";
      if (!modelOn) {
        if (globalThis.__B44_LOGS) console.log("[SP resetSurroundPositions] model OFF -> no placement");
        return list;
      }
      const earZ = 1.1;
      const INSET = 0.02;
      const major = parseInt(String(layoutString || "5.1").split(".")[0], 10) || 5;
      const useWidesInsteadOfRears = sevenBedLayoutType === "wides";
      const expectsRears = major >= 9 || major === 7 && !useWidesInsteadOfRears;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const hasXY = (s) => {
        var _a2, _b2;
        return Number.isFinite((_a2 = s == null ? void 0 : s.position) == null ? void 0 : _a2.x) && Number.isFinite((_b2 = s == null ? void 0 : s.position) == null ? void 0 : _b2.y);
      };
      const byCanon = /* @__PURE__ */ new Map();
      list.forEach((s) => byCanon.set(getCanonicalRole(s == null ? void 0 : s.role), s));
      const isValidRearPos = (canonRole, pos) => {
        if (canonRole !== "SBL" && canonRole !== "SBR") return true;
        if (!Number.isFinite(pos == null ? void 0 : pos.x) || !Number.isFinite(pos == null ? void 0 : pos.y)) return false;
        if (pos.y < L - 0.3) return false;
        if (canonRole === "SBL" && pos.x >= W * 0.5) return false;
        if (canonRole === "SBR" && pos.x <= W * 0.5) return false;
        return true;
      };
      const placementRsp = resolveCanonicalRsp({
        roomDims: { widthM: W },
        mlpX_m: appState == null ? void 0 : appState.mlpX_m,
        mlpY_m: appState == null ? void 0 : appState.mlpY_m,
        fallbackMlp: mlpPoint
      });
      const placementAimState = {
        aimFrontWidesAtMLP: appState == null ? void 0 : appState.aimFrontWidesAtMLP,
        aimSideSurroundsAtMLP: appState == null ? void 0 : appState.aimSideSurroundsAtMLP,
        aimRearSurroundsAtMLP: appState == null ? void 0 : appState.aimRearSurroundsAtMLP
      };
      const ensure = (canonRole, xFrac, yVal) => {
        const existing = byCanon.get(canonRole);
        if (!existing) return;
        const sm = String((existing == null ? void 0 : existing.model) || "").trim().toLowerCase();
        const speakerModelOn = !!sm && sm !== "off" && sm !== "none";
        const isUserPlaced = (existing == null ? void 0 : existing.positionSource) === "user";
        if (hasXY(existing) && (speakerModelOn || isUserPlaced) && isValidRearPos(canonRole, existing.position)) return;
        const seedPosition = isValidRearPos(canonRole, existing == null ? void 0 : existing.position) ? existing == null ? void 0 : existing.position : null;
        const resolved = resolveInitialWallPosition({
          role: canonRole,
          model: existing == null ? void 0 : existing.model,
          roomDims: { widthM: W, lengthM: L, heightM: Number(dims == null ? void 0 : dims.height) || null },
          rsp: placementRsp,
          aimState: placementAimState,
          lcrAngleInfo: null,
          seatingPositions,
          enableFrontWides: appState == null ? void 0 : appState.enableFrontWides,
          placedSpeakers: Array.from(byCanon.values()),
          existingPosition: seedPosition,
          getModelDimsM,
          getCanonicalRoleFn: getCanonicalRole
        });
        const x = Number.isFinite(resolved == null ? void 0 : resolved.x) ? resolved.x : clamp(W * xFrac, INSET, W - INSET);
        const y = Number.isFinite(resolved == null ? void 0 : resolved.y) ? resolved.y : clamp(yVal, INSET, L - INSET);
        const z = Number.isFinite(resolved == null ? void 0 : resolved.z) ? resolved.z : earZ;
        byCanon.set(canonRole, {
          ...existing,
          model: existing == null ? void 0 : existing.model,
          position: { ...existing.position || {}, x, y, z }
        });
      };
      ensure("SL", 0.02 / W, Number.isFinite(mlp == null ? void 0 : mlp.y) ? mlp.y : L * 0.58);
      ensure("SR", 1 - 0.02 / W, Number.isFinite(mlp == null ? void 0 : mlp.y) ? mlp.y : L * 0.58);
      ensure("LW", 0.15, L * 0.4);
      ensure("RW", 0.85, L * 0.4);
      if (expectsRears) {
        const backY = L - 0.1;
        ensure("SBL", 0.25, backY);
        ensure("SBR", 0.75, backY);
      }
      const out = Array.from(byCanon.values());
      const EPS = 1e-3;
      const posChanged = (a, b) => {
        if (!a || !b) return true;
        const dx = Math.abs((a.x ?? 0) - (b.x ?? 0));
        const dy = Math.abs((a.y ?? 0) - (b.y ?? 0));
        const dz = Math.abs((a.z ?? 0) - (b.z ?? 0));
        return dx > EPS || dy > EPS || dz > EPS;
      };
      const isSurroundRole = (role) => {
        const r = String(role || "").toUpperCase();
        return r === "SL" || r === "SR" || r === "SBL" || r === "SBR" || r === "LW" || r === "RW";
      };
      const currByRole = /* @__PURE__ */ new Map();
      list.forEach((s) => {
        const r = String((s == null ? void 0 : s.role) || "").toUpperCase();
        if (r) currByRole.set(r, s);
      });
      let anyChanged = false;
      out.forEach((s) => {
        if (!isSurroundRole(s == null ? void 0 : s.role)) return;
        const prev = currByRole.get(String(s.role).toUpperCase());
        if (!prev) {
          anyChanged = true;
          return;
        }
        if (posChanged(prev.position, s.position)) {
          anyChanged = true;
        }
      });
      if (!anyChanged) {
        console.log("[SP resetSurroundPositions CALLBACK] NO-OP (positions unchanged)");
        return list;
      }
      if (globalThis.__B44_LOGS) {
        const trace = out.filter((s) => ["SBL", "SBR"].includes(getCanonicalRole(s == null ? void 0 : s.role))).map((s) => {
          var _a2, _b2, _c2;
          return { role: s == null ? void 0 : s.role, model: s == null ? void 0 : s.model, x: (_a2 = s == null ? void 0 : s.position) == null ? void 0 : _a2.x, y: (_b2 = s == null ? void 0 : s.position) == null ? void 0 : _b2.y, z: (_c2 = s == null ? void 0 : s.position) == null ? void 0 : _c2.z };
        });
        console.log("[SP resetSurroundPositions] OUTPUT rears:", trace, { W, L, expectsRears, model: normKey });
      }
      return out;
    },
    [
      sevenBedLayoutType,
      // Initial placement context: the same published authorities the plan view
      // reads, so a placed speaker lands where it will stay.
      appState == null ? void 0 : appState.mlpX_m,
      appState == null ? void 0 : appState.mlpY_m,
      appState == null ? void 0 : appState.aimFrontWidesAtMLP,
      appState == null ? void 0 : appState.aimSideSurroundsAtMLP,
      appState == null ? void 0 : appState.aimRearSurroundsAtMLP,
      appState == null ? void 0 : appState.enableFrontWides,
      seatingPositions,
      getModelDimsM,
      mlpPoint
    ]
  );
  reactExports.useEffect(() => {
    if (!needsSurroundResetRef.current) return;
    const modelKey = String(lastSurroundModelKeyRef.current || "").trim();
    const ms = modelKey.toLowerCase();
    if (!modelKey || ms === "off" || ms === "none") {
      needsSurroundResetRef.current = false;
      return;
    }
    setSpeakers((prev) => {
      const layout = String(effectivePreset || "5.1").split(" ")[0].split("_")[0];
      const next = resetSurroundPositions(layout, mlpPoint, effectiveDims, prev, modelKey);
      if (__b44SameSpeakers(prev, next)) {
        console.log("[SP resetSurroundPositions CALLBACK] NO-OP (positions unchanged)");
        return prev;
      }
      return Array.isArray(next) ? next : prev;
    });
    needsSurroundResetRef.current = false;
  }, [setSpeakers, resetSurroundPositions, effectivePreset, mlpPoint, dimensions]);
  reactExports.useEffect(() => {
    var _a2;
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return;
    if (!mlpPoint || !effectiveDims) return;
    if (!effectivePreset) return;
    const masterSurroundModel = String(((_a2 = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _a2.master) || "off");
    const __layoutSig = __b44SigFor({
      preset: effectivePreset,
      useWides,
      globalModel: masterSurroundModel
    });
    if (__b44LastEffectSigRef.current.layoutHydrate === __layoutSig) return;
    __b44LastEffectSigRef.current.layoutHydrate = __layoutSig;
    if (!masterSurroundModel || masterSurroundModel === "off" || masterSurroundModel === "none") {
      if (globalThis.__B44_LOGS) console.log("[SP HYDRATE] Skipping: no global surround model");
      return;
    }
    if (globalThis.__B44_LOGS) console.log("[SP HYDRATE] Running for layout change", {
      preset: effectivePreset,
      useWides,
      globalModel: masterSurroundModel
    });
    setSpeakers((current) => {
      const reset = resetSurroundPositions(effectivePreset, mlpPoint, dimsSafe, current, masterSurroundModel);
      if (__b44SameSpeakers(current, reset)) return current;
      return reset;
    });
  }, [
    effectivePreset,
    useWides,
    (_i = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _i.master,
    placedSpeakers == null ? void 0 : placedSpeakers.length,
    mlpPoint,
    effectiveDims,
    resetSurroundPositions,
    setSpeakers
  ]);
  reactExports.useEffect(() => {
    var _a2;
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) {
      return;
    }
    if (!mlpPoint || !effectiveDims) return;
    const __sig = __b44SigFor({
      w: (effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM) ?? null,
      l: (effectiveDims == null ? void 0 : effectiveDims.length) ?? (effectiveDims == null ? void 0 : effectiveDims.lengthM) ?? null,
      h: (effectiveDims == null ? void 0 : effectiveDims.height) ?? (effectiveDims == null ? void 0 : effectiveDims.heightM) ?? null,
      mlpX: (mlpPoint == null ? void 0 : mlpPoint.x) ?? null,
      mlpY: (mlpPoint == null ? void 0 : mlpPoint.y) ?? null,
      preset: effectivePreset ?? null,
      globalModel: globalSurroundModel ?? null,
      roles: Array.from(allowedRoles).sort(),
      speakers: placedSpeakers.map((s) => {
        var _a3, _b2;
        return {
          role: (s == null ? void 0 : s.role) ?? null,
          model: (s == null ? void 0 : s.model) ?? null,
          x: ((_a3 = s == null ? void 0 : s.position) == null ? void 0 : _a3.x) ?? null,
          y: ((_b2 = s == null ? void 0 : s.position) == null ? void 0 : _b2.y) ?? null,
          source: (s == null ? void 0 : s.positionSource) ?? null
        };
      })
    });
    if (__b44LastEffectSigRef.current.speakerApply === __sig) return;
    __b44LastEffectSigRef.current.speakerApply = __sig;
    const W = Number((effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM));
    const L = Number((effectiveDims == null ? void 0 : effectiveDims.length) ?? (effectiveDims == null ? void 0 : effectiveDims.lengthM));
    if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
      if (globalThis.__B44_LOGS) console.warn("[SP speakerApply] ABORT: invalid room dimensions", { W, L });
      return;
    }
    const preserveUserPositions = (placedSpeakers || []).filter((s) => {
      const canon = getCanonicalRole(s.role);
      return SURROUND_BED_ROLES.has(canon) && s.positionSource === "user";
    });
    const uiModelRaw = String(((_a2 = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _a2.master) || "off").trim();
    const uiModelLower = uiModelRaw.toLowerCase();
    const modelKeyForPlacement = uiModelLower === "off" || uiModelLower === "none" ? null : uiModelRaw;
    const resetOut = Array.isArray(placedSpeakers) && placedSpeakers.length > 0 ? resetSurroundPositions(
      effectivePreset,
      mlpPoint,
      dimsSafe,
      placedSpeakers,
      modelKeyForPlacement
    ) : placedSpeakers || [];
    const nextSpeakers = resetOut.map((speaker) => {
      const userVersion = preserveUserPositions.find(
        (u) => getCanonicalRole(u.role) === getCanonicalRole(speaker.role)
      );
      return userVersion || speaker;
    });
    if (globalThis.__B44_LOGS) {
      console.log("[SP] speakerApply effect OUTPUT:", nextSpeakers.map((s) => ({
        role: s.role,
        model: s.model,
        hasPos: !!s.position
      })));
    }
    setSpeakers((current) => {
      if (!Array.isArray(nextSpeakers)) return current;
      if (__b44SameSpeakers(current, nextSpeakers)) return current;
      return nextSpeakers;
    });
    lastPresetRef.current = effectivePreset;
  }, [
    effectivePreset,
    (_j = surroundConfig == null ? void 0 : surroundConfig.value) == null ? void 0 : _j.master,
    mlpPoint == null ? void 0 : mlpPoint.x,
    mlpPoint == null ? void 0 : mlpPoint.y,
    effectiveDims == null ? void 0 : effectiveDims.width,
    effectiveDims == null ? void 0 : effectiveDims.widthM,
    effectiveDims == null ? void 0 : effectiveDims.length,
    effectiveDims == null ? void 0 : effectiveDims.lengthM,
    effectiveDims == null ? void 0 : effectiveDims.height,
    effectiveDims == null ? void 0 : effectiveDims.heightM,
    allowedRoles
  ]);
  const is7ChannelBed = effectivePreset && (effectivePreset.startsWith("7.1") || effectivePreset.startsWith("7.2"));
  reactExports.useEffect(() => {
    var _a2, _b2, _c2, _d2, _e2;
    if (!canWides || !effectiveDims) return;
    if (((_a2 = props == null ? void 0 : props.frontWideOverlay) == null ? void 0 : _a2.status) === "ok") return;
    const __sig = __b44SigFor({
      w: (effectiveDims == null ? void 0 : effectiveDims.width) ?? null,
      l: (effectiveDims == null ? void 0 : effectiveDims.length) ?? null,
      canWides,
      fl: (_b2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FL")) == null ? void 0 : _b2.position,
      fr: (_c2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FR")) == null ? void 0 : _c2.position,
      sl: (_d2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SL")) == null ? void 0 : _d2.position,
      sr: (_e2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SR")) == null ? void 0 : _e2.position,
      lw: placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "LW"),
      rw: placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "RW")
    });
    if (__b44LastEffectSigRef.current.fwMedian === __sig) return;
    __b44LastEffectSigRef.current.fwMedian = __sig;
    setSpeakers((prev) => {
      var _a3, _b3, _c3, _d3, _e3, _f2, _g2, _h2;
      const list = Array.isArray(prev) ? prev : [];
      if (!list.length) return prev;
      const hasFW = list.some((s) => {
        const canon = getCanonicalRole(s.role);
        return canon === "LW" || canon === "RW";
      });
      if (!hasFW) return prev;
      const W = Number((effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM)) || 0;
      const L = Number((effectiveDims == null ? void 0 : effectiveDims.length) ?? (effectiveDims == null ? void 0 : effectiveDims.lengthM)) || 0;
      if (!W || !L) return prev;
      const byCanon = /* @__PURE__ */ new Map();
      list.forEach((s) => {
        byCanon.set(getCanonicalRole(s.role), s);
      });
      let changed = false;
      const FLy = (_b3 = (_a3 = byCanon.get("FL")) == null ? void 0 : _a3.position) == null ? void 0 : _b3.y;
      const FRy = (_d3 = (_c3 = byCanon.get("FR")) == null ? void 0 : _c3.position) == null ? void 0 : _d3.y;
      const SLy = (_f2 = (_e3 = byCanon.get("SL")) == null ? void 0 : _e3.position) == null ? void 0 : _f2.y;
      const SRy = (_h2 = (_g2 = byCanon.get("SR")) == null ? void 0 : _g2.position) == null ? void 0 : _h2.y;
      const hasYAnchors = Number.isFinite(FLy) && Number.isFinite(FRy) && Number.isFinite(SLy) && Number.isFinite(SRy);
      const sharedMedianY = hasYAnchors ? ((FLy + SLy) / 2 + (FRy + SRy) / 2) / 2 : null;
      const updated = list.map((s) => {
        var _a4, _b4, _c4, _d4, _e4;
        const canon = getCanonicalRole(s.role);
        if (canon !== "LW" && canon !== "RW") return s;
        if (s.positionSource === "user") return s;
        const frontRole = canon === "LW" ? "FL" : "FR";
        const sideRole = canon === "LW" ? "SL" : "SR";
        const front = byCanon.get(frontRole);
        const side = byCanon.get(sideRole);
        const fx = (_a4 = front == null ? void 0 : front.position) == null ? void 0 : _a4.x;
        const fy = (_b4 = front == null ? void 0 : front.position) == null ? void 0 : _b4.y;
        const sx = (_c4 = side == null ? void 0 : side.position) == null ? void 0 : _c4.x;
        const sy = (_d4 = side == null ? void 0 : side.position) == null ? void 0 : _d4.y;
        if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(sx) || !Number.isFinite(sy)) {
          return s;
        }
        const medianY = Number.isFinite(sharedMedianY) ? sharedMedianY : (fy + sy) / 2;
        const hugging = getHuggingCenterLines(s.model, effectiveDims);
        const wallX = canon === "LW" ? hugging.leftWallX : hugging.rightWallX;
        let pos = {
          x: wallX,
          y: medianY,
          z: Number.isFinite((_e4 = s.position) == null ? void 0 : _e4.z) ? s.position.z : 1.1
        };
        pos = applyCornerClearance(pos, canon, s.model, effectiveDims, {});
        pos = applyRoomBoundsClamp(pos, s.model, effectiveDims);
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
          return s;
        }
        const old = s.position || {};
        const dx = Math.abs((old.x ?? 0) - pos.x);
        const dy = Math.abs((old.y ?? 0) - pos.y);
        if (dx < 1e-3 && dy < 1e-3) {
          return s;
        }
        changed = true;
        return { ...s, position: pos };
      });
      return changed ? updated : prev;
    });
  }, [
    canWides,
    effectiveDims == null ? void 0 : effectiveDims.width,
    effectiveDims == null ? void 0 : effectiveDims.widthM,
    effectiveDims == null ? void 0 : effectiveDims.length,
    effectiveDims == null ? void 0 : effectiveDims.lengthM,
    applyCornerClearance,
    applyRoomBoundsClamp,
    getHuggingCenterLines,
    setSpeakers,
    // React to changes in FL/FR/SL/SR positions
    (_l = (_k = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FL")) == null ? void 0 : _k.position) == null ? void 0 : _l.x,
    (_n = (_m = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FL")) == null ? void 0 : _m.position) == null ? void 0 : _n.y,
    (_p = (_o = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FR")) == null ? void 0 : _o.position) == null ? void 0 : _p.x,
    (_r = (_q = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FR")) == null ? void 0 : _q.position) == null ? void 0 : _r.y,
    (_t = (_s = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SL")) == null ? void 0 : _s.position) == null ? void 0 : _t.x,
    (_v = (_u = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SL")) == null ? void 0 : _u.position) == null ? void 0 : _v.y,
    (_x = (_w = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SR")) == null ? void 0 : _w.position) == null ? void 0 : _x.x,
    (_z = (_y = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SR")) == null ? void 0 : _y.position) == null ? void 0 : _z.y
  ]);
  reactExports.useEffect(() => {
    var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _i2, _j2, _k2, _l2, _m2, _n2, _o2;
    if (((_a2 = props == null ? void 0 : props.frontWideOverlay) == null ? void 0 : _a2.status) === "ok") return;
    const __sig = __b44SigFor({
      w: (effectiveDims == null ? void 0 : effectiveDims.width) ?? null,
      l: (effectiveDims == null ? void 0 : effectiveDims.length) ?? null,
      flY: (_c2 = (_b2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FL")) == null ? void 0 : _b2.position) == null ? void 0 : _c2.y,
      frY: (_e2 = (_d2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FR")) == null ? void 0 : _d2.position) == null ? void 0 : _e2.y,
      slY: (_g2 = (_f2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SL")) == null ? void 0 : _f2.position) == null ? void 0 : _g2.y,
      srY: (_i2 = (_h2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SR")) == null ? void 0 : _h2.position) == null ? void 0 : _i2.y,
      lwY: (_k2 = (_j2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "LW")) == null ? void 0 : _j2.position) == null ? void 0 : _k2.y,
      rwY: (_m2 = (_l2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "RW")) == null ? void 0 : _l2.position) == null ? void 0 : _m2.y,
      lwSrc: (_n2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "LW")) == null ? void 0 : _n2.positionSource,
      rwSrc: (_o2 = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "RW")) == null ? void 0 : _o2.positionSource
    });
    if (__b44LastEffectSigRef.current.fwYCorrect === __sig) return;
    __b44LastEffectSigRef.current.fwYCorrect = __sig;
    setSpeakers((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const get = (role) => prev.find((s) => s && s.role === role && s.position);
      const FL = get("FL");
      const FR = get("FR");
      const SL = get("SL");
      const SR = get("SR");
      const LW = get("LW");
      const RW = get("RW");
      if (!FL || !FR || !SL || !SR || !LW || !RW) return prev;
      if (LW.positionSource === "user" || RW.positionSource === "user") return prev;
      const targetYL = (FL.position.y + SL.position.y) / 2;
      const targetYR = (FR.position.y + SR.position.y) / 2;
      const targetY = (targetYL + targetYR) / 2;
      const EPS = 1e-3;
      const needsLeftAdjust = LW.positionSource !== "user" && Math.abs(LW.position.y - targetY) > EPS;
      const needsRightAdjust = RW.positionSource !== "user" && Math.abs(RW.position.y - targetY) > EPS;
      if (!needsLeftAdjust && !needsRightAdjust) {
        return prev;
      }
      return prev.map((sp) => {
        if (!sp || !sp.position) return sp;
        if (sp.role === "LW" && needsLeftAdjust) {
          return {
            ...sp,
            position: {
              ...sp.position,
              y: targetY
              // keep existing x (already wall-pinned)
            }
          };
        }
        if (sp.role === "RW" && needsRightAdjust) {
          return {
            ...sp,
            position: {
              ...sp.position,
              y: targetY
            }
          };
        }
        return sp;
      });
    });
  }, [
    effectiveDims == null ? void 0 : effectiveDims.width,
    effectiveDims == null ? void 0 : effectiveDims.widthM,
    effectiveDims == null ? void 0 : effectiveDims.length,
    effectiveDims == null ? void 0 : effectiveDims.lengthM,
    setSpeakers,
    // React to FL/FR/SL/SR position changes
    (_B = (_A = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FL")) == null ? void 0 : _A.position) == null ? void 0 : _B.y,
    (_D = (_C = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "FR")) == null ? void 0 : _C.position) == null ? void 0 : _D.y,
    (_F = (_E = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SL")) == null ? void 0 : _E.position) == null ? void 0 : _F.y,
    (_H = (_G = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "SR")) == null ? void 0 : _G.position) == null ? void 0 : _H.y
  ]);
  reactExports.useEffect(() => {
    var _a2, _b2, _c2;
    if (!canWides || !effectiveDims) return;
    if (((_a2 = props == null ? void 0 : props.frontWideOverlay) == null ? void 0 : _a2.status) === "ok") return;
    const W = Number((effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM));
    if (!Number.isFinite(W) || W <= 0) return;
    const lw = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "LW");
    const rw = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "RW");
    if (!lw || !rw || lw.positionSource === "user" || rw.positionSource === "user") return;
    if (!Number.isFinite((_b2 = lw.position) == null ? void 0 : _b2.x) || !Number.isFinite((_c2 = rw.position) == null ? void 0 : _c2.x)) return;
    const roomCenter = W / 2;
    const lwDist = roomCenter - lw.position.x;
    const rwDist = rw.position.x - roomCenter;
    const avgDist = (lwDist + rwDist) / 2;
    const EPS = 1e-4;
    if (Math.abs(lwDist - avgDist) > EPS || Math.abs(rwDist - avgDist) > EPS) {
      if (globalThis.__B44_LOGS) console.log("[SP] Applying FW X-symmetry correction");
      setSpeakers((prev) => {
        let changed = false;
        const next = prev.map((s) => {
          var _a3;
          const canon = getCanonicalRole(s.role);
          if ((canon === "LW" || canon === "RW") && s.positionSource !== "user" && Number.isFinite((_a3 = s.position) == null ? void 0 : _a3.x)) {
            const newX = canon === "LW" ? roomCenter - avgDist : roomCenter + avgDist;
            if (Math.abs(s.position.x - newX) > EPS) {
              changed = true;
              return { ...s, position: { ...s.position, x: newX } };
            }
          }
          return s;
        });
        return changed ? next : prev;
      });
    }
  }, [
    canWides,
    effectiveDims == null ? void 0 : effectiveDims.width,
    effectiveDims == null ? void 0 : effectiveDims.widthM,
    (_J = (_I = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "LW")) == null ? void 0 : _I.position) == null ? void 0 : _J.x,
    (_L = (_K = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "RW")) == null ? void 0 : _K.position) == null ? void 0 : _L.x,
    (_M = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "LW")) == null ? void 0 : _M.positionSource,
    (_N = placedSpeakers == null ? void 0 : placedSpeakers.find((s) => getCanonicalRole(s.role) === "RW")) == null ? void 0 : _N.positionSource,
    setSpeakers
  ]);
  const resetOnlyFrontWidesToDefaults = reactExports.useCallback(() => {
    if (!mlpPoint || !effectiveDims || !canWides) {
      if (showToast) {
        if (globalThis.__B44_LOGS) console.info("Front-Wide speakers are not enabled or room data missing.");
        showToast("Front-Wide speakers are not enabled or room data missing.", "info");
      }
      return;
    }
    setSpeakers((currentSpeakers) => {
      const otherSpeakers = currentSpeakers.filter((s) => {
        const canonicalRole = getCanonicalRole(s.role);
        return !["LW", "RW"].includes(canonicalRole);
      });
      const existingSpeakersMap = /* @__PURE__ */ new Map();
      currentSpeakers.forEach((s) => existingSpeakersMap.set(getCanonicalRole(s.role), s));
      const newFWSpeakers = [];
      const fwRoles = ["LW", "RW"];
      Number((effectiveDims == null ? void 0 : effectiveDims.width) ?? (effectiveDims == null ? void 0 : effectiveDims.widthM)) || 4.5;
      const L = Number((effectiveDims == null ? void 0 : effectiveDims.length) ?? (effectiveDims == null ? void 0 : effectiveDims.lengthM)) || 6;
      fwRoles.forEach((role) => {
        var _a2;
        const existing = existingSpeakersMap.get(role);
        let model = (existing == null ? void 0 : existing.model) || ((_a2 = existingSpeakersMap.get(role === "LW" ? "SL" : "SR")) == null ? void 0 : _a2.model) || "off";
        if (model === "off") return;
        let xAtWall;
        const medianY = L / 2;
        if (role === "LW") {
          const hugging = getHuggingCenterLines(model, effectiveDims);
          xAtWall = hugging.leftWallX;
        } else if (role === "RW") {
          const hugging = getHuggingCenterLines(model, effectiveDims);
          xAtWall = hugging.rightWallX;
        } else {
          return;
        }
        newFWSpeakers.push({
          id: (existing == null ? void 0 : existing.id) || `${role}-${timeNowMs()}`,
          role,
          model,
          position: {
            x: xAtWall,
            y: medianY,
            z: 1.1
          },
          rotation: { x: 0, y: 0, z: 0 },
          draggable: true
        });
      });
      return [...otherSpeakers, ...newFWSpeakers];
    });
    if (showToast) {
      if (globalThis.__B44_LOGS) console.log("Front-Wide speakers reset to median positions.");
      showToast("Front-Wide speakers reset to median positions.", "success");
    }
  }, [mlpPoint, effectiveDims, canWides, setSpeakers, showToast, getHuggingCenterLines]);
  reactExports.useEffect(() => {
    const handler = () => {
      window.dispatchEvent(new CustomEvent("b44:fw:resetToMedian"));
    };
    window.addEventListener("b44:fw:resetToMedian", handler);
    return () => {
      window.removeEventListener("b44:fw:resetToMedian", handler);
    };
  }, [resetOnlyFrontWidesToDefaults]);
  useFinalSafetyPass({ placedSpeakers, effectivePreset, useWides, effectiveDims, allowedRoles, setSpeakers, surroundConfig });
  reactExports.useEffect(() => {
    var _a2, _b2;
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return;
    const roomH = Number((effectiveDims == null ? void 0 : effectiveDims.height) ?? (effectiveDims == null ? void 0 : effectiveDims.heightM)) || 2.8;
    const autoH = computeAutoSurroundHeight(seatingPositions, roomH);
    const maxH = roomH - 0.3;
    const sideH = surroundHeightConfig.side.mode === "auto" ? autoH : Math.max(0.8, Math.min(maxH, Number(surroundHeightConfig.side.value) || autoH));
    const rearH = surroundHeightConfig.rear.mode === "auto" ? autoH : Math.max(0.8, Math.min(maxH, Number(surroundHeightConfig.rear.value) || autoH));
    (((_a2 = surroundHeightConfig.wide) == null ? void 0 : _a2.mode) ?? "auto") === "auto" ? autoH : Math.max(0.8, Math.min(maxH, Number((_b2 = surroundHeightConfig.wide) == null ? void 0 : _b2.value) || autoH));
    const SIDE_ROLES = /* @__PURE__ */ new Set(["SL", "SR", "SL1", "SR1", "SL2", "SR2"]);
    const REAR_ROLES = /* @__PURE__ */ new Set(["SBL", "SBR", "SBL1", "SBR1", "SBL2", "SBR2"]);
    setSpeakers((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((s) => {
        const canon = getCanonicalRole(s.role);
        const r = String(s.role || "").toUpperCase();
        let targetH = null;
        if (SIDE_ROLES.has(canon) || SIDE_ROLES.has(r)) targetH = sideH;
        else if (REAR_ROLES.has(canon) || REAR_ROLES.has(r)) targetH = rearH;
        if (targetH === null || !s.position) return s;
        if (Math.abs((s.position.z || 0) - targetH) < 1e-3) return s;
        changed = true;
        return { ...s, position: { ...s.position, z: targetH } };
      });
      return changed ? next : prev;
    });
  }, [
    surroundHeightConfig,
    seatingPositions,
    effectiveDims == null ? void 0 : effectiveDims.height,
    effectiveDims == null ? void 0 : effectiveDims.heightM,
    computeAutoSurroundHeight,
    setSpeakers,
    placedSpeakers == null ? void 0 : placedSpeakers.length
  ]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 font-sans", style: { fontFamily: "Didact Gothic, Century Gothic, sans-serif" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 mt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "system-config", className: "text-[#1B1A1A] font-bold text-base block", children: "System Configuration" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Select,
        {
          value: effectivePreset,
          onValueChange: (v) => {
            if (setDolbyConfig) setDolbyConfig(v);
            if (onDolbyPresetChange) onDolbyPresetChange(v);
            if (props.onImmediateDolbyUpdate) props.onImmediateDolbyUpdate(v);
          },
          disabled,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id: "system-config", className: "w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-2xl font-semibold", style: { color: "#213428" }, children: effectivePreset ? formatDolbyLabel(effectivePreset) : "Select configuration" }),
              effectivePreset && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "12px", color: "#9C9A95", marginLeft: "16px", flexShrink: 0, fontWeight: 500 }, children: p2LevelForFormat(effectivePreset) })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: Object.keys(audioConfigurations).map((preset) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: preset, style: { color: "#213428" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatDolbyLabel(preset) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "12px", color: "#9C9A95", marginLeft: "16px", flexShrink: 0, fontWeight: 500 }, children: p2LevelForFormat(preset) })
            ] }) }, preset)) })
          ]
        }
      )
    ] }),
    is7ChannelBed && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SevenLayoutSwitcher,
      {
        layout: sevenBedLayoutType,
        onLayoutChange: onSevenBedLayoutTypeChange,
        disabled
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsiblePanel, { title: "LCR", defaultOpen: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      LCRPanel,
      {
        setSpeakers,
        dimensions,
        lcrAimMode,
        onChangeLcrAimMode,
        lcrAngleDeg,
        mlpPoint,
        disabled,
        allSeatSplMetrics,
        onP12Update: props == null ? void 0 : props.onP12Update
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsiblePanel, { title: "Surround Channels", defaultOpen: false, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        !isNineBed && is7xBed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-4 p-3 rounded-lg border border-[#E6E4DD] bg-[#F8F8F7]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-[#1B1A1A]", children: "Use Front Wides instead of Rear Surrounds" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#625143] mt-1", children: "Toggles the 7-bed layer between SBL/SBR and LW/RW." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: useWides,
              onCheckedChange: (v) => {
                if (onSevenBedLayoutTypeChange) {
                  onSevenBedLayoutTypeChange(v ? "wides" : "rears");
                }
              },
              disabled
            }
          )
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          MemoizedUnifiedSurroundsConfig,
          {
            placedSpeakers,
            setSpeakers,
            mlpPoint,
            dolbyPreset: effectivePreset,
            sevenBedLayoutType,
            dimensions,
            getHuggingCenterLines,
            applyCornerClearance,
            applyRoomBoundsClamp,
            disabled,
            allowedRoles,
            canSides,
            canRears,
            canWides,
            is7xOrHigher,
            safePos,
            effectivePreset,
            useWides,
            resetSurroundPositions,
            surroundConfig,
            setSurroundConfig,
            needsSurroundResetRef,
            lastSurroundModelKeyRef,
            extraSurroundCount,
            onExtraSurroundCountChange,
            allowExtraSurrounds,
            surroundHeightConfig,
            setSurroundHeightConfig,
            autoSurroundHeight: computeAutoSurroundHeight(seatingPositions, Number((effectiveDims == null ? void 0 : effectiveDims.height) ?? (effectiveDims == null ? void 0 : effectiveDims.heightM)) || 2.8),
            roomHeight: Number((effectiveDims == null ? void 0 : effectiveDims.height) ?? (effectiveDims == null ? void 0 : effectiveDims.heightM)) || 2.8
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SurroundSplStrip,
          {
            allSeatSplMetrics,
            mlpSeat,
            dolbyLayout: effectivePreset,
            placedSpeakers,
            mlpPoint,
            roomDims: effectiveDims,
            setSpeakers,
            disabled,
            frontWideOverlay: props.frontWideOverlay,
            sevenBedLayoutType
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 mt-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: "Amplifier Power (Surrounds)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "text",
                inputMode: "numeric",
                pattern: "[0-9]*",
                value: surroundsPowerInputValue,
                onChange: (e) => {
                  const newValue = e.target.value;
                  if (newValue !== "" && !/^\d+$/.test(newValue)) return;
                  setSurroundsPowerInputValue(newValue);
                  if (newValue === "") return;
                  const val = parseInt(newValue, 10);
                  if (Number.isFinite(val) && val >= 1 && val <= 5e3) {
                    updateGlobalSpl == null ? void 0 : updateGlobalSpl({ surroundsW: val });
                  }
                },
                onBlur: (e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val) || val < 1 || val > 5e3) {
                    const lastValid = (splConfig == null ? void 0 : splConfig.surroundsW) || 100;
                    setSurroundsPowerInputValue(String(lastValid));
                  } else {
                    const clamped = Math.max(1, Math.min(5e3, val));
                    setSurroundsPowerInputValue(String(clamped));
                    if (clamped !== ((splConfig == null ? void 0 : splConfig.surroundsW) || 100)) {
                      updateGlobalSpl == null ? void 0 : updateGlobalSpl({ surroundsW: clamped });
                    }
                  }
                },
                disabled,
                className: "pr-8"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none", children: "W" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 mt-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-[#625143]", children: "Parameter 13. Non-screen speakers SPL capability at RSP" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                type: "button",
                size: "sm",
                variant: (splConfig == null ? void 0 : splConfig.p13Mode) === "minimum" || !(splConfig == null ? void 0 : splConfig.p13Mode) ? "default" : "outline",
                className: (splConfig == null ? void 0 : splConfig.p13Mode) === "minimum" || !(splConfig == null ? void 0 : splConfig.p13Mode) ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
                onClick: () => updateGlobalSpl == null ? void 0 : updateGlobalSpl({ p13Mode: "minimum" }),
                disabled,
                children: "Minimum"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                type: "button",
                size: "sm",
                variant: (splConfig == null ? void 0 : splConfig.p13Mode) === "recommended" ? "default" : "outline",
                className: (splConfig == null ? void 0 : splConfig.p13Mode) === "recommended" ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90" : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]",
                onClick: () => updateGlobalSpl == null ? void 0 : updateGlobalSpl({ p13Mode: "recommended" }),
                disabled,
                children: "Recommended"
              }
            )
          ] })
        ] }),
        (() => {
          var _a2;
          if (!allSeatSplMetrics) return null;
          const mlpMetrics = allSeatSplMetrics.get("mlp");
          const seatMetrics = mlpMetrics || (mlpSeat ? allSeatSplMetrics.get(mlpSeat.id) : null);
          if (!((_a2 = seatMetrics == null ? void 0 : seatMetrics.spl) == null ? void 0 : _a2.surrounds)) return null;
          const surroundTileSplDb = Object.values(seatMetrics.spl.surrounds).map((s) => s == null ? void 0 : s.value).filter((v) => Number.isFinite(v)).map((v) => Math.ceil(v));
          if (surroundTileSplDb.length === 0) return null;
          const pillBasisDb = Math.min(...surroundTileSplDb);
          const isMinimumMode = (splConfig == null ? void 0 : splConfig.p13Mode) === "minimum" || !(splConfig == null ? void 0 : splConfig.p13Mode);
          const thresholds = isMinimumMode ? P13_THRESHOLDS_MIN : P13_THRESHOLDS_REC;
          const level = computeRP22Level(pillBasisDb, thresholds);
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            RP22LabelledLevelPill,
            {
              level,
              label: "RP22 P13 (Surrounds)"
            }
          );
        })()
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      OverheadChannelsPanel,
      {
        overheadCount,
        overheadGlobalModel,
        setOverheadGlobalModel,
        overheadFrontOverride,
        setOverheadFrontOverride,
        overheadMidOverride,
        setOverheadMidOverride,
        overheadRearOverride,
        setOverheadRearOverride,
        useFrontGlobal,
        setUseFrontGlobal,
        useMidGlobal,
        setUseMidGlobal,
        useRearGlobal,
        setUseRearGlobal,
        disabled,
        placedSpeakers,
        setSpeakers,
        mlpPoint,
        effectivePreset,
        allSeatSplMetrics,
        mlpSeat
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      SubwooferPanel,
      {
        appState,
        disabled,
        frontSubsCfg,
        rearSubsCfg,
        subWarnings
      }
    )
  ] });
}
function SpeakerPlacement(props) {
  const { extraSurroundCount, onExtraSurroundCountChange, allowExtraSurrounds, ...restProps } = props;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    SpeakerPlacementImpl,
    {
      ...restProps,
      extraSurroundCount,
      onExtraSurroundCountChange,
      allowExtraSurrounds
    }
  );
}
export {
  SpeakerPlacement as default
};
