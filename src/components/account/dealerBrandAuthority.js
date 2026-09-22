import { base44 } from "@/api/base44Client";

export const DEALER_BRAND_UPDATED_EVENT = "sound-proof:dealer-brand-updated";

const WRITABLE_FIELDS = new Set([
  "company_name",
  "dealer_logo_url",
  "white_logo_url",
  "hero_background_url",
  "display_name_override",
  "tagline",
  "address",
  "telephone",
  "email",
  "website",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "google_maps_url",
  "vat_number",
  "company_registration_number",
  "about_us",
  "why_choose_us",
  "warranty",
  "terms_conditions",
  "primary_colour",
  "secondary_colour",
  "accent_colour",
  "include_about_us",
  "include_warranty",
  "include_product_gallery",
  "include_rp22_overview",
  "include_technical_appendix",
  "proposal_tone",
]);

function updatedTimestamp(record) {
  const value = Date.parse(record?.updated_date || record?.created_date || "");
  return Number.isFinite(value) ? value : 0;
}

export function selectCanonicalDealerBrand(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  return [...records].sort((a, b) => updatedTimestamp(b) - updatedTimestamp(a))[0] || null;
}

export function sanitiseDealerBrandValues(values = {}) {
  const payload = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (WRITABLE_FIELDS.has(key)) payload[key] = value;
  }
  return payload;
}

export async function loadDealerBrand(accountId) {
  if (!accountId) return null;
  const records = await base44.entities.BrandAsset.filter({ account_id: accountId });
  return selectCanonicalDealerBrand(records);
}

export function publishDealerBrand(accountId, brand) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEALER_BRAND_UPDATED_EVENT, {
    detail: { accountId: String(accountId || ""), brand: brand || null },
  }));
}

export async function saveDealerBrand({ accountId, record = null, values = {} }) {
  if (!accountId) throw new Error("Dealer account identity is unavailable.");

  const existing = record?.id ? record : await loadDealerBrand(accountId);
  const payload = {
    ...sanitiseDealerBrandValues(values),
    account_id: accountId,
  };

  const saved = existing?.id
    ? await base44.entities.BrandAsset.update(existing.id, payload)
    : await base44.entities.BrandAsset.create(payload);

  publishDealerBrand(accountId, saved);
  return saved;
}
