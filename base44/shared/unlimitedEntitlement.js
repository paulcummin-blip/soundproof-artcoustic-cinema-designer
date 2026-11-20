/**
 * Select the current unlimited promotion with the latest end date. Extend the
 * displayed entitlement through contiguous future windows, without changing
 * any stored promotion or attributing today's usage to a future promotion.
 */
export function resolveUnlimitedEntitlement(promotions, now = Date.now()) {
  const valid = (Array.isArray(promotions) ? promotions : []).filter(p =>
    p?.promotion_type === 'UNLIMITED_PRO_PROJECTS' && p.status === 'ACTIVE' &&
    Number.isFinite(Date.parse(p.starts_at)) && Number.isFinite(Date.parse(p.ends_at)) &&
    Date.parse(p.ends_at) > Date.parse(p.starts_at)
  );
  const current = valid.filter(p => Date.parse(p.starts_at) <= now && now < Date.parse(p.ends_at));
  current.sort((a,b) => Date.parse(b.ends_at) - Date.parse(a.ends_at) ||
    String(a.id || '').localeCompare(String(b.id || '')));
  const best = current[0];
  if (!best) return null;
  let end = Date.parse(best.ends_at);
  // Sorting by start makes a single pass sufficient for an overlapping chain.
  for (const p of [...valid].sort((a,b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
    if (Date.parse(p.starts_at) <= end && Date.parse(p.ends_at) > end) end = Date.parse(p.ends_at);
  }
  return {...best, effective_ends_at: new Date(end).toISOString()};
}
