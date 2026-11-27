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

import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
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

  // Collapsible Project Tokens panel — the expanded/collapsed preference is
  // remembered across visits to the Projects page. Defaults to expanded so a
  // first-time dealer sees the full detail, promotional information and the
  // Purchase Project Tokens button.
  const PROJECT_TOKENS_COLLAPSED_KEY = 'b44_project_tokens_collapsed';
  const [tokensCollapsed, setTokensCollapsed] = useState(() => {
    try { return localStorage.getItem(PROJECT_TOKENS_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(PROJECT_TOKENS_COLLAPSED_KEY, tokensCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [tokensCollapsed]);

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

  // Compact-header summary values (shown in both collapsed and expanded states).
  const promoExpiryLabel = showPromotionBlock && promoEndsAt
    ? formatPromotionEndDateLong(promoEndsAt)
    : null;

  return (
    <div
      style={{
        margin: '18px 0 0',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        background: '#F3F0EB',
        color: BRAND.green,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setTokensCollapsed((v) => !v)}
        aria-expanded={!tokensCollapsed}
        aria-controls="project-tokens-panel"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 24px',
          background: 'transparent',
          border: 'none',
          borderBottom: tokensCollapsed ? 'none' : `1px solid ${BRAND.border}`,
          cursor: 'pointer',
          color: 'inherit',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Project Tokens</span>
          <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35 }}>
            <strong>{capacityValue}</strong>{' available'}
          </span>
          {promoExpiryLabel && (
            <span style={{ fontSize: 13, color: BRAND.subtext }}>
              {'Unlimited creation until '}{promoExpiryLabel}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 text-[#625143] transition-transform ${tokensCollapsed ? 'rotate-0' : 'rotate-180'}`}
        />
      </button>
      {!tokensCollapsed && (
      <dl
        id="project-tokens-panel"
        aria-label="Account status"
        className={`grid gap-x-8 gap-y-5 ${gridClass}`}
        style={{
          margin: 0,
          padding: '16px 24px 20px',
          color: BRAND.green,
        }}
      >
...
      </dl>
      )}
    </div>
  );
}