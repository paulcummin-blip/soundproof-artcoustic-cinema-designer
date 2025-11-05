export function getLevelColor(level) {
  switch (level) {
    case 1:
      return { fill: 'var(--rp22-l1-fill)', text: 'var(--rp22-l1-text)' };
    case 2:
      return { fill: 'var(--rp22-l2-fill)', text: 'var(--rp22-l2-text)' };
    case 3:
      return { fill: 'var(--rp22-l3-fill)', text: 'var(--rp22-l3-text)' };
    case 4:
      return { fill: 'var(--rp22-l4-fill)', text: 'var(--rp22-l4-text)' };
    default:
      return { fill: 'var(--rp22-na-fill)', text: 'var(--rp22-na-text)' };
  }
}

export function getLevelText(level) {
  switch (level) {
    case 4: return 'Excellent';
    case 3: return 'Good';
    case 2: return 'Acceptable';
    case 1: return 'Poor';
    default: return 'Fail';
  }
}