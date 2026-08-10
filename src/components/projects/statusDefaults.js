// Default project status definitions + legacy migration mapper.
// Projects reference the stable status_id (stored in Project.project_status).
// The display label and colour come from the ProjectStatus record for the
// account. These defaults are seeded per account on first use (see
// useProjectStatuses). Existing raw/legacy project_status values map safely
// into the default ids via normalizeStatusId.

export const DEFAULT_STATUSES = [
  { status_id: "prospective", label: "Prospective", sort_order: 1, color: "#625143", is_default: true, is_archived: false },
  { status_id: "live",        label: "Live",        sort_order: 2, color: "#213428", is_default: true, is_archived: false },
  { status_id: "completed",   label: "Completed",   sort_order: 3, color: "#C1B6AD", is_default: true, is_archived: false },
  { status_id: "lost",        label: "Lost",        sort_order: 4, color: "#4A230F", is_default: true, is_archived: false },
];

// Legacy / raw project_status value -> canonical default status_id.
// Handles old capitalised labels ("Live") and common aliases.
const LEGACY_MAP = {
  live: "live",
  active: "live",
  in_progress: "live",
  prospective: "prospective",
  prospect: "prospective",
  lead: "prospective",
  completed: "completed",
  won: "completed",
  lost: "lost",
};

// Map any raw project_status value to a stable status_id.
// - Legacy labels (case-insensitive) -> default id.
// - Custom status_ids (slugs/uuids) pass through unchanged.
// - Empty/null -> "prospective" (the default).
export function normalizeStatusId(raw) {
  if (raw == null) return "prospective";
  const key = String(raw).trim().toLowerCase();
  if (LEGACY_MAP[key]) return LEGACY_MAP[key];
  return String(raw).trim();
}

// Resolve a status definition by raw status value against a list of defs.
export function getStatusDef(statusId, statuses) {
  const id = normalizeStatusId(statusId);
  return (statuses || []).find((s) => s.status_id === id) || null;
}

// Resolve a display label. Falls back to a capitalised id for unknown values
// so legacy/custom values always render something sensible.
export function getStatusLabel(statusId, statuses) {
  const def = getStatusDef(statusId, statuses);
  if (def) return def.label;
  const id = normalizeStatusId(statusId);
  if (id && id !== "prospective") {
    return id.charAt(0).toUpperCase() + id.slice(1);
  }
  return "Prospective";
}

// Resolve a colour. Falls back to the default palette, then a neutral grey.
export function getStatusColor(statusId, statuses) {
  const def = getStatusDef(statusId, statuses);
  if (def && def.color) return def.color;
  const id = normalizeStatusId(statusId);
  const fallback = DEFAULT_STATUSES.find((d) => d.status_id === id);
  return fallback?.color || "#625143";
}