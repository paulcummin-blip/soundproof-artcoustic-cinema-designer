/**
 * ProposalCoverPage
 * -----------------
 * The client-facing cover page for a proposal / client design report.
 *
 * Used for BOTH the on-screen Proposal Editor cover and the exported PDF
 * cover, so the two are identical by construction.
 *
 * Cover hierarchy:
 *   1. full-bleed background image, cropped to cover, with a dark overlay so
 *      white text stays readable
 *   2. the Sound Proof × Artcoustic main branding lockup
 *   3. dealer and project identity — dealer name, project name, project
 *      reference — placed BELOW the lockup with generous spacing
 *   4. the report title (Cinema Design Proposal / System Design Comparison)
 *   5. the bottom strap line and the generated date
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

// The agreed brand font, with the app-wide fallback chain.
const FONT = 'Didact Gothic, Century Gothic, sans-serif';

const SP_WORDMARK = 'SOUND PROOF';
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
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.30em',
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
  reportTitle,
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
        {/* ── 2. Main branding lockup — Sound Proof × Artcoustic ── */}
        <div className="px-8 pt-10 flex items-center justify-center gap-4">
          <span
            style={{
              fontSize: 30,
              fontWeight: 300,
              letterSpacing: '0.14em',
              lineHeight: 1,
              color: WHITE,
              whiteSpace: 'nowrap',
            }}
          >
            {SP_WORDMARK}
          </span>
          <span
            style={{
              fontSize: 17,
              fontWeight: 300,
              lineHeight: 1,
              color: 'rgba(255,255,255,0.55)',
              userSelect: 'none',
            }}
          >
            ×
          </span>
          <img
            src={logoSrc}
            alt="Artcoustic"
            style={{
              maxHeight: 52,
              maxWidth: 190,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        </div>

        {/* ── 3. Dealer and project identity — below the lockup ── */}
        <div className="px-8 text-center" style={{ marginTop: 46 }}>
          {dealerName && (
            <div
              style={{
                fontSize: 23,
                fontWeight: 400,
                letterSpacing: '0.07em',
                lineHeight: 1.25,
                color: WHITE,
              }}
            >
              {dealerName}
            </div>
          )}

          <div style={{ marginTop: dealerName ? 38 : 0 }}>
            <IdentityValue
              label="Project:"
              value={projectName}
              valueSize={27}
              valueSpacing="0.02em"
            />
          </div>

          {hasReference && (
            <div style={{ marginTop: 30 }}>
              <IdentityValue
                label="Reference:"
                value={String(projectReference).trim()}
                valueSize={15}
                valueSpacing="0.10em"
              />
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* ── 4. Report title — lower third ── */}
        <div className="px-8 text-center">
          <div
            style={{
              fontSize: 20,
              fontWeight: 300,
              letterSpacing: '0.20em',
              textTransform: 'uppercase',
              lineHeight: 1.3,
              color: WHITE,
            }}
          >
            {reportTitle || 'Cinema Design Proposal'}
          </div>
          <div
            style={{
              width: 56,
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.55)',
              margin: '20px auto 0',
            }}
          />
        </div>

        {/* ── 5. Bottom strap line and generated date ── */}
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