// Projects-page account-status strip with conditional visibility.
//
// Each section shows only when genuine, currently active data exists:
//
//   Professional Projects — always shown. Displays the dealer's genuine
//     available project-credit count and links to the Dealer Page when the
//     authenticated navigation resolver returns a URL.
//
//   Special access — shown only when the dealer has a genuine, currently
//     active special-access entitlement. The entire section is hidden when
//     no entitlement exists or it has expired. Existing unlimited
//     entitlements and their expiry dates are preserved.
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

import React from 'react';
import { formatPromotionEndDate } from '@/lib/commercial/useEffectivePromotion';
import { useDealerAccountNavigation } from './useDealerAccountNavigation';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#3E4349',
  border: '#DCDBD6',
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

  if (!showCapacityIndicator && !illustrativeHeader) return null;

  // --- Section visibility (genuine data only) -----------------------------

  // Professional Projects: always shown.
  const showProfessionalProjects = true;

  // Special access: only when a genuine, currently active entitlement exists.
  const showSpecialAccess = showCapacityIndicator && promotionEffective && !promoLoading;

  // Current offer: only when a genuine, active offer exists and the dealer
  // is eligible. Placeholder/illustrative offers are never displayed.
  const showCurrentOffer = Boolean(offerActive && dealerOfferEligible && offerLabel);

  // Access renewal: only when the 90-day access system is connected and a
  // genuine expiry date is available.
  const showAccessRenewal = Boolean(accessExpiry);

  const visibleCount = [
    showProfessionalProjects,
    showSpecialAccess,
    showCurrentOffer,
    showAccessRenewal,
  ].filter(Boolean).length;

  // If nothing is visible at all, render nothing.
  if (visibleCount === 0) return null;

  const gridClass = GRID_CLASS_BY_COUNT[visibleCount] || GRID_CLASS_BY_COUNT[4];

  // --- Professional Projects link ----------------------------------------
  // Only real dealers get a clickable Dealer Page link, never the admin
  // illustrative preview.
  const professionalProjectsLink = dealerPageUrl && !illustrativeHeader;
  const capacityValue = illustrativeHeader ? 3 : capacityLoading ? '...' : professionalCapacity;

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
        color: '#213428',
      }}
    >
      {/* Professional Projects — always shown */}
      {showProfessionalProjects && (
        <div style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Professional Projects</dt>
          <dd style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.35 }}>
            {professionalProjectsLink ? (
              <a
                href={dealerPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: BRAND.border }}
                title="View project-credit history on your Dealer Page"
              >
                <strong>{capacityValue}</strong>{' available'}
              </a>
            ) : (
              <span>
                <strong>{capacityValue}</strong>{' available'}
              </span>
            )}
          </dd>
          {illustrativeHeader && (
            <dd style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.subtext }}>Illustrative balance</dd>
          )}
        </div>
      )}

      {/* Special access — genuine active entitlement only */}
      {showSpecialAccess && (
        <div style={{ minWidth: 0 }} title={promoMessage || undefined}>
          <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Special access</dt>
          <dd style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.35 }}>Unlimited</dd>
          <dd style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.4 }}>
            {'Until '}{formatPromotionEndDate(promoEndsAt)}
          </dd>
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