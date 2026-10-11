import { R as React, j as jsxRuntimeExports } from "./index-BdFovajD.js";
function StepperInput({
  value,
  onChange,
  step = 0.01,
  min = -Infinity,
  max = Infinity,
  readOnly = false,
  decimals = 2,
  className = "",
  disabled = false,
  placeholder = ""
}) {
  const [draft, setDraft] = React.useState(null);
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const round = (v) => Math.round(v / step) * step;
  const displayValue = draft !== null ? draft : Number.isFinite(value) ? value.toFixed(decimals) : "";
  const handleChange = (e) => {
    if (readOnly) return;
    const raw = e.target.value;
    if (/^-?\d*\.?\d*$/.test(raw) || raw === "") {
      setDraft(raw);
    }
  };
  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      onChange(clamp(round(parsed)));
    }
    setDraft(null);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") commitDraft();
    if (e.key === "ArrowUp") {
      e.preventDefault();
      step_(1);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step_(-1);
    }
  };
  const step_ = (dir) => {
    if (disabled || readOnly || typeof onChange !== "function") return;
    const current = Number.isFinite(value) ? value : 0;
    const next = clamp(round(current + dir * step));
    setDraft(null);
    onChange(next);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative flex items-stretch ${disabled ? "opacity-50" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "text",
        inputMode: "decimal",
        value: displayValue,
        onChange: handleChange,
        onBlur: commitDraft,
        onKeyDown: handleKeyDown,
        readOnly,
        disabled,
        placeholder,
        className: [
          "w-full rounded-md border px-3 py-1.5 text-sm",
          "border-[#DCDBD6] text-[#1B1A1A]",
          readOnly ? "bg-[#F8F8F7]" : "bg-white",
          "focus:outline-none focus:ring-1 focus:ring-[#213428]",
          "pr-7",
          // leave room for stepper buttons
          className
        ].filter(Boolean).join(" "),
        style: { cursor: readOnly ? "default" : void 0 }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#DCDBD6]", style: { width: 22 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          tabIndex: -1,
          disabled,
          onMouseDown: (e) => {
            e.preventDefault();
            step_(1);
          },
          className: "flex-1 flex items-center justify-center hover:bg-[#F0EFEA] active:bg-[#E8E6DF] transition-colors",
          style: { fontSize: 8, color: "#625143", borderBottom: "1px solid #DCDBD6", borderRadius: "0 6px 0 0" },
          "aria-label": "Increase",
          children: "▲"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          tabIndex: -1,
          disabled,
          onMouseDown: (e) => {
            e.preventDefault();
            step_(-1);
          },
          className: "flex-1 flex items-center justify-center hover:bg-[#F0EFEA] active:bg-[#E8E6DF] transition-colors",
          style: { fontSize: 8, color: "#625143", borderRadius: "0 0 6px 0" },
          "aria-label": "Decrease",
          children: "▼"
        }
      )
    ] })
  ] });
}
export {
  StepperInput as S
};
