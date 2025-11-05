import React from "react";

const BRAND = {
  btnText: "#FFFFFF",
  green: "#2A6E3F",
  greenHover: "#27633A",
  blue:  "#1B4E7A",
  border: "#DCDBD6",
};

function ActionButton({ children, onClick, href, tone = "blue", disabled, title }) {
  const bg = tone === "green" ? BRAND.green : BRAND.blue;
  const style = {
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${disabled ? BRAND.border : bg}`,
    background: disabled ? "#A0A0A0" : bg,
    color: BRAND.btnText,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    textDecoration: "none",
    display: "inline-block",
  };
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style} title={title}>
      {children}
    </button>
  );
}

export default function PageHeaderActions({
  onExport,
  exportLabel = "Export PDF",
  demoHref,
  demoLabel = "Book a Demo",
  showExport = true
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {demoHref && (
        <ActionButton tone="green" href={demoHref} title="Book an Artcoustic demo">
          {demoLabel}
        </ActionButton>
      )}
      {showExport && (
        <ActionButton tone="blue" onClick={onExport} title="Export a printable PDF">
          {exportLabel}
        </ActionButton>
      )}
    </div>
  );
}