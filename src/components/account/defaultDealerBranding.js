// Public presentation defaults copied from the approved admin setup on 2026-09-29.
// Never load another account's BrandAsset or copy its record ID/contact data.
export const APPROVED_DEALER_BRANDING = Object.freeze({
  hero_background_url: "https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/ef7baa7f1_GLOLakes1.jpeg",
  dealer_logo_url: "https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/e1022b903_Artcousticlogo_greycopy.png",
  white_logo_url: "https://base44.app/api/apps/6a1166c68ddc81e5ea2cdf6b/files/mp/public/6a1166c68ddc81e5ea2cdf6b/f7c3e802f_Artcoustic-logo_white_TRANSPARENT_BACKGROUND.png",
  heading: "PROFESSIONAL HOME CINEMA ENGINEERING",
  subheading: "POWERED BY ARTCOUSTIC DESIGN INTELLIGENCE (ADI)",
  company_name: "Artcoustic",
});

export function safeBrandImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Presentation-only merge. Saving still uses the raw account-owned record.
// An account switch must never briefly display the previous account's branding.
export function resolveDealerBrandPresentation(record, accountId) {
  const brand = accountId && record?.account_id === accountId ? record : null;
  const hero = safeBrandImageUrl(brand?.hero_background_url);
  const whiteLogo = safeBrandImageUrl(brand?.white_logo_url);
  const colourLogo = safeBrandImageUrl(brand?.dealer_logo_url);
  return {
    heroBg: hero || APPROVED_DEALER_BRANDING.hero_background_url,
    dealerLogo: whiteLogo || colourLogo || APPROVED_DEALER_BRANDING.white_logo_url,
    dealerName: brand?.display_name_override?.trim() || brand?.company_name?.trim() || APPROVED_DEALER_BRANDING.company_name,
    hasCustomHero: !!hero,
    hasCustomLogo: !!(whiteLogo || colourLogo),
  };
}
