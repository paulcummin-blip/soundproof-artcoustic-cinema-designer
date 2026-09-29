/**
 * ProposalCoverPage
 * -----------------
 * The client-facing cover page for a proposal / client design report.
 *
 * Used for BOTH the on-screen Proposal Editor cover and the exported PDF
 * cover, so the two are identical by construction.
 *
 * Cover hierarchy (top → bottom):
 *   1. full-bleed background image, cropped to cover, with a dark overlay so
 *      white text stays readable
 *   2. top third — the stacked Sound Proof × partner lockup, using the same
 *      brand hierarchy as the app header (see BrandLockup)
 *   3. middle / lower-middle — dealer name (partner/dealer accounts only), then
 *      the project name and project reference. Deliberately small: the project
 *      name is identity, never the visual hero of the cover.
 *   4. bottom — the generated date and the approved Sound Proof strap line
 *
 * The cover carries NO document title. The document type is metadata and lives
 * in the workspace toolbar, not in a large generic headline on the page.
 *
 * Background priority:
 *   1. the project's selected cover image (ProposalAsset cover_image)
 *   2. the Sound Proof / dealer hero image — the same image as the app header
 *
 * Every identity element is pure white, matching the Sound Proof wordmark.
 * Nothing on this cover is ever grey placeholder text.
 */

import React from 'react';
import { useBrandImage } from '@/components/account/useBrandImage';
import { APPROVED_DEALER_BRANDING } from '@/components/account/defaultDealerBranding';
import BrandLockup from '@/components/ui/BrandLockup';

// The agreed brand font, with the app-wide fallback chain.
const FONT = 'Didact Gothic, Century Gothic, sans-serif';

const WHITE = '#FFFFFF';

/** Cover date in UK format — DD/MM/YYYY. */
function formatCoverDate(value) {
  if (!value) return null;
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight, which can shift
  // the day in a timezone behind UTC. Read the parts directly instead.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Small letterspaced label above an identity value. */
function IdentityValue({ label, value, valueSize = 26, valueSpacing = '0.02em' }) {
  if (!value) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.26em',
          textTransform: 'uppercase',
          color: WHITE,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: valueSize,
          fontWeight: 300,
          letterSpacing: valueSpacing,
          lineHeight: 1.2,
          color: WHITE,
          marginTop: 8,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ProposalCoverPage({
  projectName,
  dealerName,
  projectReference,
  coverImageUrl,
  heroImageUrl,
  logoUrl,
  generatedDate,
}) {
  // Approved art stays visible while a dealer upload loads, and a failed
  // upload returns to the approved default.
  const heroSrc = useBrandImage(heroImageUrl, APPROVED_DEALER_BRANDING.hero_background_url);
  const logoSrc = useBrandImage(logoUrl, APPROVED_DEALER_BRANDING.white_logo_url);
  const backgroundSrc = coverImageUrl || heroSrc;
  const dateLabel = formatCoverDate(generatedDate);
  const hasReference = !!(projectReference && String(projectReference).trim());

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: '#1B1A1A', fontFamily: FONT }}
    >
      {/* ── 1. Full-bleed cover background ── */}
      <img
        src={backgroundSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: 'cover', objectPosition: 'center', filter: 'brightness(0.94)' }}
      />

      {/* Dark overlay — keeps white branding and text readable */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.42)' }} />
      {/* Top-weighted gradient so the lockup and identity block stay legible */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.34) 40%, rgba(0,0,0,0.26) 64%, rgba(0,0,0,0.84) 100%)',
        }}
      />

      <div className="relative h-full flex flex-col">
        {/* ── 2. Top third — stacked brand lockup ── */}
        <div
          style={{
            flex: '1 1 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 32px 0',
          }}
        >
          <BrandLockup spFontSize={34} partnerLogoUrl={logoSrc} />
        </div>

        {/* ── 3. Middle / lower-middle — project identity ── */}
        <div
          style={{
            flex: '1 1 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '0 32px',
          }}
        >
          {dealerName && (
            <div
              style={{
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: '0.08em',
                lineHeight: 1.3,
                color: WHITE,
              }}
            >
              {dealerName}
            </div>
          )}

          <div style={{ marginTop: dealerName ? 28 : 0, width: '100%' }}>
            <IdentityValue
              label="Project"
              value={projectName}
              valueSize={21}
              valueSpacing="0.02em"
            />
          </div>

          {hasReference && (
            <div style={{ marginTop: 26, width: '100%' }}>
              <IdentityValue
                label="Reference"
                value={String(projectReference).trim()}
                valueSize={12}
                valueSpacing="0.10em"
              />
            </div>
          )}
        </div>

        {/* ── 4. Bottom — generated date and approved strap line ── */}
        <div
          className="px-8 py-4 flex items-center justify-between gap-6"
          style={{
            marginTop: 26,
            backgroundColor: 'rgba(0,0,0,0.42)',
            borderTop: '1px solid rgba(255,255,255,0.16)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              color: WHITE,
              whiteSpace: 'nowrap',
            }}
          >
            {dateLabel || ''}
          </span>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: WHITE,
                lineHeight: 1.3,
              }}
            >
              {APPROVED_DEALER_BRANDING.heading}
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: WHITE,
                lineHeight: 1.3,
                marginTop: 3,
              }}
            >
              {APPROVED_DEALER_BRANDING.subheading}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}