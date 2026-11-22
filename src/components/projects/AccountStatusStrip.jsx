// Projects-page account-status strip with conditional visibility.
//
// Project Tokens — the dealer-facing name for Professional Project capacity.
// 1 Project Token creates 1 new cinema project (up to 5 design variations).
// The underlying CapacityLedger, backend APIs and ledger transactions are
// unchanged; only the dealer-facing wording is standardised here.
//
//   Project Tokens — always shown. Displays the dealer's genuine available
//     Project Token count, a Purchase Project Tokens action (no payment yet,
//     shows a coming-soon message), and — when a genuine UNLIMITED_PRO_PROJECTS
//     promotion is effective — the promotional entitlement directly below the
//     balance. Links to the Dealer Page when the authenticated navigation
//     resolver returns a URL.
//
//   Current offer — shown only when a genuine, active offer exists and the
//     dealer is eligible. Placeholder/illustrative offers are never
//     displayed. No genuine offer data is wired yet, so this section is
//     hidden until an offer prop is supplied.
//
//   Access renewal — shown only when the 90-day access system is connected
//     and a genuine renewal status is available. Until then, invented dates
//     and "No renewal due" placeholders are not displayed.
//
// The grid auto-reflows to the number of visible sections, retaining the
// existing card styling. All account-status information stays on the
// Projects page only.

import React, { useState } from 'react';
import { formatPromotionEndDate, formatPromotionEndDateLong } from '@/lib/commercial/useEffectivePromotion';
import { useDealerAccountNavigation } from './useDealerAccountNavigation';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#3E4349',
  border: '#DCDBD6',
  green: '#213428',
};

const RENEWAL_WINDOW_DAYS = 14;
const OVERDUE_COLOR = '#B23A3A';

const GRID_CLASS_BY_COUNT = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
};

function isRenewalWindowActive(expiryIso) {
  if (!expiryIso) return false;
  const expiryMs = new Date(expiryIso).getTime();
  if (!Number.isFinite(expiryMs)) return false;
  const windowMs = RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() >= expiryMs - windowMs;
}

function isOverdue(expiryIso) {
  if (!expiryIso) return false;
  const expiryMs = new Date(expiryIso).getTime();
  if (!Number.isFinite(expiryMs)) return false;
  return Date.now() >= expiryMs;
}

export default function AccountStatusStrip({
  showCapacityIndicator,
  illustrativeHeader,
  professionalCapacity,
  capacityLoading,
  promotionEffective,
  promoLoading,
  promoMessage,
  promoEndsAt,
  // Future genuine-offer data — null until an active, eligible offer exists.
  // When supplied (offerActive && dealerEligible), the Current offer section
  // appears automatically.
  offerActive = false,
  dealerOfferEligible = false,
  offerLabel = null,
  offerEndDate = null,
  // 90-day access system — null until connected. When accessExpiry is
  // supplied, the Access renewal section appears automatically.
  accessExpiry = null,
  renewalUrl = null,
}) {
  const { url: dealerPageUrl } = useDealerAccountNavigation();
  const [purchaseMessageVisible, setPurchaseMessageVisible] = useState(false);

  if (!showCapacityIndicator && !illustrativeHeader) return null;

  // --- Section visibility (genuine data only) -----------------------------

  // Project Tokens: always shown.
  const showProjectTokens = true;

  // Current offer: only when a genuine, active offer exists and the dealer
  // is eligible. Placeholder/illustrative offers are never displayed.
  const showCurrentOffer = Boolean(offerActive && dealerOfferEligible && offerLabel);

  // Access renewal: only when the 90-day access system is connected and a
  // genuine expiry date is available.
  const showAccessRenewal = Boolean(accessExpiry);

  const visibleCount = [
    showProjectTokens,
    showCurrentOffer,
    showAccessRenewal,
  ].filter(Boolean).length;

  // If nothing is visible at all, render nothing.
  if (visibleCount === 0) return null;

  const gridClass = GRID_CLASS_BY_COUNT[visibleCount] || GRID_CLASS_BY_COUNT[4];

  // --- Project Tokens link & balance ------------------------------------
  // Only real dealers get a clickable Dealer Page link, never the admin
  // illustrative preview. The Purchase Project Tokens button is shown only
  // for real dealers (not the admin illustrative header preview).
  const projectTokensLink = dealerPageUrl && !illustrativeHeader;
  const capacityValue = illustrativeHeader ? 3 : capacityLoading ? '...' : professionalCapacity;
  const canPurchase = showCapacityIndicator && !illustrativeHeader;
  const showPromotionBlock = showCapacityIndicator && !illustrativeHeader
    && promotionEffective && !promoLoading;

  // --- Access renewal state ---------------------------------------------
  const overdue = showAccessRenewal && isOverdue(accessExpiry);
  const inRenewalWindow = showAccessRenewal && isRenewalWindowActive(accessExpiry);
  const renewalLinkActive = showAccessRenewal && !!renewalUrl && (inRenewalWindow || overdue);

  return (
    <dl
      aria-label="Account status"
      className={`grid gap-x-8 gap-y-5 ${gridClass}`}
      style={{
        margin: '18px 0 0',
        padding: '20px 24px',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        background: '#F3F0EB',
        color: BRAND.green,
      }}
    >
      {/* Project Tokens — always shown */}
      {showProjectTokens && (
        <div style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Project Tokens</dt>
          <dd style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.35, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {projectTokensLink ? (
              <a
                href={dealerPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: BRAND.border }}
                title="View your Project Token history on your Dealer Page"
              >
                <strong>{capacityValue}</strong>{' available'}
              </a>
            ) : (
              <span>
                <strong>{capacityValue}</strong>{' available'}
              </span>
            )}
            {canPurchase && (
              <button
                type="button"
                onClick={() => setPurchaseMessageVisible((v) => !v)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                  background: '#FFFFFF',
                  color: BRAND.text,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                Purchase Project Tokens
              </button>
            )}
          </dd>
          <dd style={{ margin: '6px 0 0', fontSize: 12, color: BRAND.subtext }}>
            1 token creates 1 new project, with up to 5 design variations.
          </dd>

          {/* Purchase coming-soon message — no payment, no balance change */}
          {canPurchase && purchaseMessageVisible && (
            <dd style={{
              margin: '10px 0 0',
              padding: '12px 14px',
              background: '#FFFFFF',
              border: `1px solid ${BRAND.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: BRAND.subtext,
              lineHeight: 1.45,
            }}>
              Online Project Token purchases are coming soon. Please contact Artcoustic if you need additional tokens.
            </dd>
          )}

          {/* Unlimited Projects promotion — directly below the balance */}
          {showPromotionBlock && (
            <dd style={{
              margin: '12px 0 0',
              padding: '14px 16px',
              background: '#FFFFFF',
              border: `1px solid ${BRAND.green}`,
              borderLeft: `3px solid ${BRAND.green}`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, lineHeight: 1.35 }}>
                Unlimited project creation until {formatPromotionEndDateLong(promoEndsAt)}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: BRAND.subtext, lineHeight: 1.5 }}>
                Your Project Tokens won&rsquo;t be used during this promotion. All projects and design variations you create will remain available afterwards.
              </div>
            </dd>
          )}

          {illustrativeHeader && (
            <dd style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.subtext }}>Illustrative balance</dd>
          )}
        </div>
      )}

      {/* Current offer — genuine active, eligible offer only */}
      {showCurrentOffer && (
        <div style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Current offer</dt>
          <dd style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>{offerLabel}</dd>
          {offerEndDate && (
            <dd style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.4 }}>
              {'Ends '}{formatPromotionEndDate(offerEndDate)}
            </dd>
          )}
        </div>
      )}

      {/* Access renewal — genuine 90-day system only */}
      {showAccessRenewal && (
        <div style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Access renewal</dt>
          <dd style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>
            {renewalLinkActive ? (
              <a
                href={renewalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: overdue ? OVERDUE_COLOR : 'inherit',
                  textDecoration: 'underline',
                }}
              >
                {'Renew by '}{formatPromotionEndDate(accessExpiry)}
              </a>
            ) : (
              `Renew by ${formatPromotionEndDate(accessExpiry)}`
            )}
          </dd>
          {overdue && (
            <dd style={{ margin: '6px 0 0', fontSize: 13, color: OVERDUE_COLOR }}>{'Overdue'}</dd>
          )}
        </div>
      )}
    </dl>
  );
}