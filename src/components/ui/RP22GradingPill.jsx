export default function RP22GradingPill({ level = 4, children }) {
  const n = typeof level === 'number' ? Math.max(0, Math.min(4, level)) : 4;
  const label = children ?? (n === 0 ? 'Fail' : `L${n}`);

  // Map level to colors using same logic as RP22/RP23 bars (from rp22Colors.js)
  const bgColor = 
    n === 4 ? '#2A6E3F' :   // Green (L4)
    n === 3 ? '#2A6E3F' :   // Green (L3)
    n === 2 ? '#935F1A' :   // Amber (L2)
              '#7A1E19';    // Red (L1/Fail)

  const styleBase = {
    border: '1px solid #E6E4DD',
    borderRadius: 10,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: bgColor,
    color: '#FFFFFF',  // Light text for all colored backgrounds
  };

  return <span style={styleBase}>{label}</span>;
}