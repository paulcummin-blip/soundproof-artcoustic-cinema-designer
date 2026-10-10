/** A schedule row's physical quantity is data, never part of the model name. */
export function parseReportProduct(value, role) {
  if (!value || value === 'None specified') return null;
  const centre = String(value).match(/^(.+?)\s*×\s*(\d+)\s+centre cabinets(?:\s*\(([^)]+)\))?$/);
  const ordinary = String(value).match(/^(.+?)\s*×\s*(\d+)\s*(?:\(([^)]+)\))?$/);
  const match = centre || ordinary;
  return { role, model: match ? match[1].trim() : String(value).trim(),
    quantity: match ? Number(match[2]) : 1, position: centre ? null : match?.[3] || null,
    ...(centre ? { structure: 'dual-centre', channel_count: 1, cabinet_count: Number(match[2]),
      orientation: match[3] || null } : {}) };
}
export function renderReportProduct(entry) {
  const base = entry.quantity > 1 ? `${entry.model} × ${entry.quantity}` : entry.model;
  if (entry.structure === 'dual-centre') return `${base} centre cabinets${entry.orientation ? ` (${entry.orientation})` : ''}`;
  return entry.position ? `${base} (${entry.position})` : base;
}