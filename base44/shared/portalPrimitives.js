/**
 * Small shared primitives for the Partner Portal modules.
 *
 * Leaf module: imports nothing, so the SSO authority, the bridge transport and
 * the launch consumption path can all use them without an import cycle.
 */

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function uniqueRows(entity, query) {
  const rows = await entity.filter(query);
  return Array.isArray(rows) ? rows : [];
}