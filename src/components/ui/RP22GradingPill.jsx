export default function RP22GradingPill({ level = 4, children }) {
  const n = typeof level === 'number' ? Math.max(0, Math.min(4, level)) : 4;
  const label = children ?? (n === 0 ? 'Fail' : `L${n}`);

  const styleBase = {
    border: '1px solid #C1B6AD',
    borderRadius: 10,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4
  };

  const palette =
    n === 4 ? { background: '#F6F3EE', color: '#213428' } :   // L4 (brand green on sand)
    n === 3 ? { background: '#E9ECEF', color: '#3E4349' } :   // L3 (cool grey, dark text)
    n === 2 ? { background: '#EFEAE4', color: '#625143' } :   // L2 (warm sand, brown text)
              { background: '#FBE9E7', color: '#A7302F' };    // L1/Fail (soft red, brand red text)

  return <span style={{ ...styleBase, ...palette }}>{label}</span>;
}