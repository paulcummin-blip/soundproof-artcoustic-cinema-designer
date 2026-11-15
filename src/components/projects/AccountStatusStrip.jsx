// Projects-page four-column account-status strip.
//
// Column 1 — Professional Projects: the available project-credit count,
//   clickable to the dealer's own Lovable / Partner Portal Dealer Page
//   when the authenticated navigation resolver returns a URL.
//
// Column 2 — Special access: unlimited-access promotion entitlement,
//   shown only while an effective promotion is active. Never replaced by
//   a standard 90-day expiry.
//
// Column 3 — Current offer: illustrative offer preview.
//
// Column 4 — Access renewal: shows the access-expiry date when one is
//   available from the backend. The renewal link is active only during the
//   final 14 days before expiry, or when overdue. Renewal itself must be
//   confirmed by an authenticated backend call (one per 90-day period); it
//   is never inferred from opening a URL. Until the Lovable renewal
//   endpoint and access-expiry source exist, the column shows a neutral
//   "No renewal due" state — no invented dates, no simulated renewals.
//
// All account-status information lives on the Projects page only.

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
  // Future Lovable integration — null until the access-expiry source and
  // renewal endpoint are wired. Passed as props so the strip is ready
  // without any code changes when the integration lands.
  accessExpiry = null,
  renewalUrl = null,
}) {
  const { url: dealerPageUrl } = useDealerAccountNavigation();

  if (!showCapacityIndicator && !illustrativeHeader) return null;

  const showSpecialAccess =
    (showCapacityIndicator && promotionEffective && !promoLoading) || illustrativeHeader;

  // Access renewal is only meaningful for real dealers (not the admin
  // illustrative preview). A real expiry date is required before the
  // renewal link can activate.
  const hasRealExpiry = !illustrativeHeader && !!accessExpiry;
  const overdue = hasRealExpiry && isOverdue(accessExpiry);
  const inRenewalWindow = hasRealExpiry && isRenewalWindowActive(accessExpiry);
  const renewalLinkActive = hasRealExpiry && !!renewalUrl && (inRenewalWindow || overdue);

  // Professional Projects link — only for real dealers with a resolved
  // Dealer Page URL, never in the admin illustrative preview.
  const professionalProjectsLink = dealerPageUrl && !illustrativeHeader;

  const capacityValue = illustrativeHeader ? 3 : capacityLoading ? '...' : professionalCapacity;

  return (
    <dl
      aria-label="Project credits, special access and illustrative offer and renewal"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-5"
      style={{
        margin: '18px 0 0',
        padding: '20px 24px',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        background: '#F3F0EB',
        color: '#213428',
      }}
    >
      {/* Professional Projects */}
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

      {/* Special access (unlimited entitlement — never replaced by 90-day expiry) */}
      {showSpecialAccess && (
        <div style={{ minWidth: 0 }} title={illustrativeHeader ? undefined : promoMessage || undefined}>
          <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Special access</dt>
          <dd style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.35 }}>Unlimited</dd>
          <dd style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.4 }}>
            {'Until '}{illustrativeHeader ? '31 Dec 2026' : formatPromotionEndDate(promoEndsAt)}
            {illustrativeHeader && (
              <span style={{ display: 'block', fontSize: 13, color: BRAND.subtext }}>Illustrative entitlement</span>
            )}
          </dd>
        </div>
      )}

      {/* Current offer */}
      <div style={{ minWidth: 0 }}>
        <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {'Current offer '}<span style={{ fontSize: 12, fontWeight: 400, color: BRAND.subtext }}>{'· Preview'}</span>
        </dt>
        <dd style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>{'3 months free access'}</dd>
        <dd style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.4 }}>{'Ends 31 Dec 2026'}</dd>
        <dd style={{ margin: '4px 0 0', fontSize: 13, color: BRAND.subtext }}>{'Illustrative offer and date'}</dd>
      </div>

      {/* Access renewal */}
      <div style={{ minWidth: 0 }}>
        <dt style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {'Access renewal '}
          {illustrativeHeader && (
            <span style={{ fontSize: 12, fontWeight: 400, color: BRAND.subtext }}>{'· Preview'}</span>
          )}
        </dt>
        {illustrativeHeader ? (
          <>
            <dd style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>{'Renew by 15 Feb 2027'}</dd>
            <dd style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.subtext }}>{'Illustrative date'}</dd>
          </>
        ) : hasRealExpiry ? (
          <>
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
          </>
        ) : (
          <>
            <dd style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.4, color: BRAND.subtext }}>
              {'—'}
            </dd>
            <dd style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.subtext }}>{'No renewal due'}</dd>
          </>
        )}
      </div>
    </dl>
  );
}