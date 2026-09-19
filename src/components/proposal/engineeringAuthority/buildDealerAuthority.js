/**
 * buildDealerAuthority.js
 * --------------------------------
 * Layer 1 — Dealer/brand sub-authority.
 * Pure function. No GPT. No side effects.
 * Returns factual dealer information only — no formatting, no marketing.
 */

export function buildDealerAuthority(brandAsset) {
  if (!brandAsset) {
    return {
      company_name: '',
      contact: {
        address: '',
        telephone: '',
        email: '',
        website: '',
        linkedin: '',
        instagram: '',
        facebook: '',
        youtube: '',
      },
      about_us: '',
      why_choose_us: '',
      warranty: '',
      terms_conditions: '',
      branding: {
        dealer_logo_url: null,
        white_logo_url: null,
        primary_colour: '#213428',
        secondary_colour: '#3E4349',
        accent_colour: '#625143',
      },
      proposal_defaults: {
        include_about_us: true,
        include_warranty: true,
        include_product_gallery: true,
        include_rp22_overview: true,
        include_technical_appendix: true,
      },
      proposal_tone: 'luxury_residential',
    };
  }

  return {
    company_name: brandAsset.company_name || '',
    contact: {
      address: brandAsset.address || '',
      telephone: brandAsset.telephone || '',
      email: brandAsset.email || '',
      website: brandAsset.website || '',
      linkedin: brandAsset.linkedin || '',
      instagram: brandAsset.instagram || '',
      facebook: brandAsset.facebook || '',
      youtube: brandAsset.youtube || '',
    },
    about_us: brandAsset.about_us || '',
    why_choose_us: brandAsset.why_choose_us || '',
    warranty: brandAsset.warranty || '',
    terms_conditions: brandAsset.terms_conditions || '',
    branding: {
      dealer_logo_url: brandAsset.dealer_logo_url || null,
      white_logo_url: brandAsset.white_logo_url || null,
      primary_colour: brandAsset.primary_colour || '#213428',
      secondary_colour: brandAsset.secondary_colour || '#3E4349',
      accent_colour: brandAsset.accent_colour || '#625143',
    },
    proposal_defaults: {
      include_about_us: brandAsset.include_about_us ?? true,
      include_warranty: brandAsset.include_warranty ?? true,
      include_product_gallery: brandAsset.include_product_gallery ?? true,
      include_rp22_overview: brandAsset.include_rp22_overview ?? true,
      include_technical_appendix: brandAsset.include_technical_appendix ?? true,
    },
    proposal_tone: brandAsset.proposal_tone || 'luxury_residential',
  };
}