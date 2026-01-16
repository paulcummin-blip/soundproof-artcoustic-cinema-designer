import { getLevelColors } from '@/components/utils/rp22Colors';

export default function RP22GradingPill({ level = 4, children }) {
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
    
    // Treat undefined, "—", "-", or unknown values as neutral
    return -1;
  };
  
  const n = normalizeLevel(level);
  const label = children ?? (n === -1 ? '—' : n === 0 ? 'FAIL' : `L${n}`);

  const colors = n === -1 
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
    borderRadius: 10,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: safeColors.bg,
    color: safeColors.text,
  };

  return <span style={styleBase}>{label}</span>;
}