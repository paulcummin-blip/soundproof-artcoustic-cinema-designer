import { getLevelColors } from '@/components/utils/rp22Colors';

export default function RP22GradingPill({ level = 4, count, children, compact = false, style }) {
  // Normalize level to safe value
  const normalizeLevel = (lvl) => {
    if (typeof lvl === 'number') {
      return Math.max(0, Math.min(4, lvl));
    }
    
    const str = String(lvl || '').toUpperCase();
    if (str === 'L1') return 1;
    if (str === 'L2') return 2;
    if (str === 'L3') return 3;
    if (str === 'L4') return 4;
    if (str === 'FAIL') return 0;
    if (str === 'N/A') return -2;
    if (str === 'NO DATA') return -3;
    
    // Treat undefined, "—", "-", or unknown values as neutral
    return -1;
  };
  
  const n = normalizeLevel(level);
  const baseLabel = n === -1 ? '—' : n === -2 ? 'N/A' : n === -3 ? 'NO DATA' : n === 0 ? 'FAIL' : `L${n}`;
  const label = children ?? (count !== undefined ? `${baseLabel}: ${count}` : baseLabel);

  const colors = (n === -1 || n === -2 || n === -3)
    ? { bg: '#F3F4F6', border: '#E5E7EB', text: '#9CA3AF' } 
    : getLevelColors(n);

  // Safety: ensure colors object always has required fields
  const safeColors = {
    bg: colors?.bg || '#F3F4F6',
    border: colors?.border || '#E5E7EB',
    text: colors?.text || '#9CA3AF'
  };

  const styleBase = {
    border: `1px solid ${safeColors.border}`,
    borderRadius: '6px',
    padding: compact ? '4px 7px' : '6px 12px',
    fontSize: compact ? '10px' : '13px',
    fontWeight: 600,
    lineHeight: '1.2',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: safeColors.bg,
    color: safeColors.text,
    whiteSpace: 'nowrap',
    minWidth: '40px',
    ...style,
  };

  return <span style={styleBase}>{label}</span>;
}