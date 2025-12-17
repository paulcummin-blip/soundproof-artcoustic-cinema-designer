import { getLevelColors } from '@/components/utils/rp22Colors';

export default function RP22GradingPill({ level = 4, children }) {
  const n = typeof level === 'number' ? Math.max(0, Math.min(4, level)) : 4;
  const label = children ?? (n === 0 ? 'Fail' : `L${n}`);

  const colors = getLevelColors(n);

  const styleBase = {
    border: `1px solid ${colors.border || '#E6E4DD'}`,
    borderRadius: 10,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: colors.bg,
    color: colors.text,
  };

  return <span style={styleBase}>{label}</span>;
}