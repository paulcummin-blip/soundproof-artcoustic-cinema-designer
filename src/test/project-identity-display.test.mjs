// project-identity-display.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for project identity display.
//
// Product rule: wherever a project's identity is shown (Projects card, Active
// Project sidebar, Room Designer header) it shows the client, the project
// reference and the dealer, from the authoritative fields only — the stamped
// Project.dealer_name, falling back to the owning account when that account is
// a dealer identity account. An admin/internal account is never presented as a
// dealer: the name reads "Not assigned" instead.
//
// Display only: no project data model, ownership, pricing or report changes.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEALER_NOT_ASSIGNED,
  IDENTITY_NOT_SPECIFIED,
  resolveDealerIdentity,
  resolveIdentityFields,
} from '@/components/projects/projectIdentityAuthority.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

// The real traced record for the acceptance project.
const MARQUEE_HOME_PROJECT = {
  name: 'Marquee Home',
  client_name: '34 AR',
  project_reference: '34 AR',
  dealer_name: null,
  account_id: '6a2690efdfb8492ee7facc01',
};
const MARQUEE_HOME_ACCOUNT = { name: 'Sound Proof Admin Account', account_type: 'admin' };

const DEALER_ACCOUNT = { name: 'Elite Home Cinema Ltd', account_type: 'dealer' };

describe('PROJECT FIELDS TRACED', () => {
  it('reads client and reference from the project record', () => {
    const fields = resolveIdentityFields({
      client: MARQUEE_HOME_PROJECT.client_name,
      reference: MARQUEE_HOME_PROJECT.project_reference,
      dealerName: MARQUEE_HOME_PROJECT.dealer_name,
      account: MARQUEE_HOME_ACCOUNT,
    });

    expect(fields.client).toBe('34 AR');
    expect(fields.reference).toBe('34 AR');
    expect(fields.hasReference).toBe(true);
  });

  it('never hides an existing project reference', () => {
    const fields = resolveIdentityFields({ reference: 'AC-2026-014' });
    expect(fields.reference).toBe('AC-2026-014');
    expect(fields.hasReference).toBe(true);
  });

  it('states plainly when a field is not specified', () => {
    const fields = resolveIdentityFields({ client: '  ', reference: '' });
    expect(fields.client).toBe(IDENTITY_NOT_SPECIFIED);
    expect(fields.reference).toBe(IDENTITY_NOT_SPECIFIED);
    expect(fields.hasReference).toBe(false);
  });
});

describe('DEALER FIELD TRACED', () => {
  it('uses the dealer name stamped on the project first', () => {
    const dealer = resolveDealerIdentity({
      dealerName: 'Sound Proof Partner Ltd',
      account: DEALER_ACCOUNT,
    });
    expect(dealer).toEqual({ name: 'Sound Proof Partner Ltd', source: 'project', missing: false });
  });

  it('falls back to a dealer identity account when no name is stamped', () => {
    const dealer = resolveDealerIdentity({ dealerName: null, account: DEALER_ACCOUNT });
    expect(dealer.name).toBe('Elite Home Cinema Ltd');
    expect(dealer.source).toBe('account');
    expect(dealer.missing).toBe(false);
  });

  it('reports Not assigned for an admin-owned project with no dealer name', () => {
    const dealer = resolveDealerIdentity({ dealerName: null, account: MARQUEE_HOME_ACCOUNT });
    expect(dealer.name).toBe(DEALER_NOT_ASSIGNED);
    expect(dealer.missing).toBe(true);
    expect(dealer.source).toBeNull();
  });

  it('reports Not assigned when no dealer source exists at all', () => {
    const dealer = resolveDealerIdentity({});
    expect(dealer.name).toBe(DEALER_NOT_ASSIGNED);
    expect(dealer.missing).toBe(true);
  });

  it('never presents Sound Proof admin/internal accounts as a dealer', () => {
    for (const account_type of ['admin', 'internal', 'demo', 'client']) {
      const dealer = resolveDealerIdentity({
        dealerName: '',
        account: { name: 'Sound Proof Admin Account', account_type },
      });
      expect(dealer.name).toBe(DEALER_NOT_ASSIGNED);
    }
  });

  it('does not invent a second dealer field', () => {
    const authority = read('components/projects/projectIdentityAuthority.js');
    expect(authority).toMatch(/Project\.dealer_name/);
    expect(authority).not.toMatch(/dealer_business_name|dealer_company|brand_name/);
  });
});

describe('ACCEPTANCE PROJECT — MARQUEE HOME', () => {
  const fields = resolveIdentityFields({
    client: MARQUEE_HOME_PROJECT.client_name,
    reference: MARQUEE_HOME_PROJECT.project_reference,
    dealerName: MARQUEE_HOME_PROJECT.dealer_name,
    account: MARQUEE_HOME_ACCOUNT,
  });

  it('shows client, reference and an honest dealer state', () => {
    expect(fields.client).toBe('34 AR');
    expect(fields.reference).toBe('34 AR');
    expect(fields.dealer).toBe(DEALER_NOT_ASSIGNED);
  });
});

describe('PROJECT CARD SHOWS IDENTITY', () => {
  it('renders client, reference and dealer on the card', () => {
    const card = read('components/projects/ProjectCardPrototype.jsx');
    expect(card).toMatch(/<ProjectIdentityLine/);
    expect(card).toMatch(/reference=\{p\.project_reference\}/);
    expect(card).toMatch(/dealerName=\{p\.dealer_name\}/);
    expect(card).toMatch(/account=\{p\.account\}/);
  });

  it('keeps the configuration, target SPL, age and status on the card', () => {
    const card = read('components/projects/ProjectCardPrototype.jsx');
    expect(card).toMatch(/buildSystemSummary/);
    expect(card).toMatch(/Target SPL/);
    expect(card).toMatch(/formatAge/);
    expect(card).toMatch(/handleStatusChange/);
  });

  it('supplies the dealer fields to the card from the project list', () => {
    const page = read('pages/Projects.jsx');
    expect(page).toMatch(/dealer_name: rawP\.dealer_name \|\| null/);
    expect(page).toMatch(/account: accountById\[rawP\.account_id\] \|\| null/);
    expect(page).toMatch(/project_reference: p\.project_reference \|\| ""/);
  });
});

describe('ACTIVE SIDEBAR SHOWS IDENTITY', () => {
  it('renders the identity block from the canonical hydration identity', () => {
    const layout = read('Layout.jsx');
    expect(layout).toMatch(/<ProjectIdentityLine/);
    expect(layout).toMatch(/orientation="stacked"/);
    expect(layout).toMatch(/project_reference: identity\?\.projectReference \|\| null/);
    expect(layout).toMatch(/dealer_name: identity\?\.dealerName \|\| null/);
  });

  it('publishes reference and dealer from the authoritative project record', () => {
    const provider = read('components/state/ProjectHydrationProvider.jsx');
    expect(provider).toMatch(/projectReference: project\.project_reference \|\| null/);
    expect(provider).toMatch(/dealerName: project\.dealer_name \|\| null/);
    expect(provider).toMatch(/accountType: account\.account_type \|\| null/);
  });
});

describe('ROOM DESIGNER HEADER SHOWS IDENTITY', () => {
  it('renders the identity line from the canonical identity', () => {
    const header = read('components/roomdesigner/RoomDesignerHeader.jsx');
    expect(header).toMatch(/useCanonicalProject/);
    expect(header).toMatch(/<ProjectIdentityLine/);
    expect(header).toMatch(/reference=\{identity\.projectReference\}/);
    expect(header).toMatch(/dealerName=\{identity\.dealerName\}/);
  });

  it('keeps the editable version field as the single version display', () => {
    const header = read('components/roomdesigner/RoomDesignerHeader.jsx');
    expect(header).toMatch(/<VersionNameField projectId=\{effectiveProjectId\} \/>/);
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).toMatch(/showVersion = false/);
  });
});

describe('EDIT MODAL STILL SAVES VALUES', () => {
  it('leaves the edit payload for client name and reference untouched', () => {
    const dialog = read('components/projects/NewProjectDialog.jsx');
    expect(dialog).toMatch(/project_reference: payload\.project_reference/);
    expect(dialog).toMatch(/client_name/);
  });

  it('keeps the saved reference and dealer in the updated card state', () => {
    const page = read('pages/Projects.jsx');
    expect(page).toMatch(/project_reference: updated\.project_reference \?\? p\.project_reference/);
    expect(page).toMatch(/dealer_name: updated\.dealer_name \?\? p\.dealer_name/);
  });
});

describe('NO LAYOUT OVERFLOW', () => {
  it('wraps the inline identity line instead of overflowing', () => {
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).toMatch(/flexWrap: "wrap"/);
    expect(line).toMatch(/whiteSpace: "nowrap"/);
  });

  it('keeps each stacked row on its own line', () => {
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).toMatch(/flexDirection: "column"/);
  });

  it('does not truncate the client, reference or dealer values', () => {
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).not.toMatch(/textOverflow|ellipsis|truncate/);
  });
});