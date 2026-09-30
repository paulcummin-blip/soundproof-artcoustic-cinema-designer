// Confidence (A/B/C/D) and basis (Published / Calculated / ADI estimate /
// Insufficient) badges for a competitor comparison row.
//
// The comparison is only honest if its evidence quality travels with the number,
// so every row carries both: an ADI estimate can never look like published
// measured capability.

export default function ComparisonQualityBadges({ confidence, label, basis, tone }) {
  if (!confidence) return null;
  const color = tone || "#625143";
  return (
    <>
      <span
        title={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 8px",
          borderRadius: 999,
          border: `1px solid ${color}`,
          background: "#FFFFFF",
          fontSize: 11,
          fontWeight: 700,
          color,
          whiteSpace: "nowrap",
        }}
      >
        {confidence}
        <span style={{ fontWeight: 500, opacity: 0.85 }}>· {label}</span>
      </span>
      {basis && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 999,
            background: "#F1F0EE",
            border: "1px solid #DCDBD6",
            fontSize: 11,
            color: "#3E4349",
            whiteSpace: "nowrap",
          }}
        >
          {basis}
        </span>
      )}
    </>
  );
}