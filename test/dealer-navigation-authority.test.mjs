import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTNER_PORTAL_SELF_URL,
  resolveDealerAccountNavigation,
} from '../base44/shared/dealerNavigationAuthority.js';

const ICUBED_ACCOUNT_ID = '6a832be3d4e6c6df3df23ee3';
const ICUBED_LINK_ID = '6a832be32b9fd00b81845b58';
const ICUBED_PARTNER_USER_ID = 'b9d453e8-3386-4294-bd99-7ad2d80120b2';

const user = {
  id: 'future-icubed-sound-proof-user',
  role: 'user',
  account_id: ICUBED_ACCOUNT_ID,
};

const account = {
  id: ICUBED_ACCOUNT_ID,
  name: 'iCubed Home Cinema',
  account_type: 'dealer',
  status: 'active',
};

const icubedLink = {
  id: ICUBED_LINK_ID,
  account_id: ICUBED_ACCOUNT_ID,
  source_system: 'ARTCOUSTIC_PARTNER_PORTAL',
  partner_user_id: ICUBED_PARTNER_USER_ID,
  active: true,
};

test('iCubed resolves to the fixed Partner Portal self-view route', () => {
  const result = resolveDealerAccountNavigation({
    user,
    account,
    accountLinks: [icubedLink],
    identityLinks: [icubedLink],
  });

  assert.deepEqual(result, {
    eligible: true,
    url: PARTNER_PORTAL_SELF_URL,
  });

  const url = new URL(result.url);
  assert.equal(url.origin, 'https://partners.artcousticpartners.uk');
  assert.equal(url.pathname, '/dashboard');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.equal(result.url.includes(ICUBED_ACCOUNT_ID), false);
  assert.equal(result.url.includes(ICUBED_PARTNER_USER_ID), false);
});

test('a second dealer id cannot be selected because no client selector exists', () => {
  const otherDealerLink = {
    ...icubedLink,
    id: 'other-link',
    account_id: 'other-account',
    partner_user_id: 'other-partner-user',
  };

  const result = resolveDealerAccountNavigation({
    user,
    account,
    accountLinks: [otherDealerLink],
    identityLinks: [otherDealerLink],
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'CANONICAL_LINK_NOT_UNIQUE');
});

test('duplicate canonical links fail closed', () => {
  const result = resolveDealerAccountNavigation({
    user,
    account,
    accountLinks: [icubedLink, { ...icubedLink, id: 'duplicate-link' }],
    identityLinks: [icubedLink],
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'CANONICAL_LINK_NOT_UNIQUE');
});

test('a Partner Portal identity shared by two accounts fails closed', () => {
  const result = resolveDealerAccountNavigation({
    user,
    account,
    accountLinks: [icubedLink],
    identityLinks: [
      icubedLink,
      { ...icubedLink, id: 'other-link', account_id: 'other-account' },
    ],
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'PARTNER_IDENTITY_NOT_UNIQUE');
});

test('central admin never receives dealer-targeted navigation', () => {
  const result = resolveDealerAccountNavigation({
    user: { ...user, role: 'admin' },
    account,
    accountLinks: [icubedLink],
    identityLinks: [icubedLink],
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'NOT_DEALER_USER');
});

test('inactive or suspended dealer accounts fail closed', () => {
  for (const status of ['inactive', 'suspended']) {
    const result = resolveDealerAccountNavigation({
      user,
      account: { ...account, status },
      accountLinks: [icubedLink],
      identityLinks: [icubedLink],
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'ACCOUNT_NOT_ELIGIBLE');
  }
});
