// project-identity-display.test.mjs
// ---------------------------------------------------------------------------
// Regression tests for project identity display.
//
// Product rule: wherever a project's identity is shown (Projects card, Active
// Project sidebar, Room Designer header) it shows the project, the client and
// the project reference — and nothing else. Dealer identity is deliberately not
// surfaced in this block. A project with no reference omits the Reference row
// rather than printing a dash.
//
// The dealer identity authority itself is unchanged and still resolves the
// stamped Project.dealer_name against the owning account for the dealer
// surfaces; it is simply not consumed by the identity block.
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

  it('resolves the project name for surfaces without a heading', () => {
    expect(resolveIdentityFields({ projectName: ' Marquee Home ' }).project).toBe('Marquee Home');
    expect(resolveIdentityFields({}).project).toBeNull();
  });

  it('never prints a dash for a blank reference', () => {
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).toMatch(/if \(fields\.hasReference\)/);
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
    projectName: MARQUEE_HOME_PROJECT.name,
    client: MARQUEE_HOME_PROJECT.client_name,
    reference: MARQUEE_HOME_PROJECT.project_reference,
  });

  it('shows the project, its client and its reference', () => {
    expect(fields.project).toBe('Marquee Home');
    expect(fields.client).toBe('34 AR');
    expect(fields.reference).toBe('34 AR');
  });

  it('adds no dealer field to the display contract', () => {
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).not.toMatch(/label: "Dealer"/);
    expect(line).not.toMatch(/dealerName|account=\{/);
  });
});

describe('PROJECT CARD SHOWS IDENTITY', () => {
  it('shows the project name as the card heading', () => {
    const card = read('components/projects/ProjectCardPrototype.jsx');
    expect(card).toMatch(/\{p\.name \|\| "Untitled Project"\}/);
  });

  it('renders the client and reference identity block', () => {
    const card = read('components/projects/ProjectCardPrototype.jsx');
    expect(card).toMatch(/<ProjectIdentityLine/);
    expect(card).toMatch(/client=\{p\.client\}/);
    expect(card).toMatch(/reference=\{p\.project_reference\}/);
  });

  it('renders no dealer field on the card', () => {
    const card = read('components/projects/ProjectCardPrototype.jsx');
    expect(card).not.toMatch(/dealerName=\{p\.dealer_name\}/);
    expect(card).not.toMatch(/account=\{p\.account\}/);
  });

  it('keeps the configuration, target SPL, age and status on the card', () => {
    const card = read('components/projects/ProjectCardPrototype.jsx');
    expect(card).toMatch(/buildSystemSummary/);
    expect(card).toMatch(/Target SPL/);
    expect(card).toMatch(/formatAge/);
    expect(card).toMatch(/handleStatusChange/);
  });

  it('supplies the identity fields to the card from the project list', () => {
    const page = read('pages/Projects.jsx');
    expect(page).toMatch(/project_reference: p\.project_reference \|\| ""/);
    expect(page).toMatch(/client: p\.client_name \|\| ""/);
  });
});

describe('ACTIVE SIDEBAR SHOWS IDENTITY', () => {
  it('shows the project name as the sidebar heading', () => {
    const layout = read('Layout.jsx');
    expect(layout).toMatch(/\{activeProjectSummary\.name \|\| "Loading project…"\}/);
  });

  it('renders the client and reference identity block from the canonical hydration identity', () => {
    const layout = read('Layout.jsx');
    expect(layout).toMatch(/<ProjectIdentityLine/);
    expect(layout).toMatch(/orientation="stacked"/);
    expect(layout).toMatch(/client=\{activeProjectSummary\.client_name\}/);
    expect(layout).toMatch(/reference=\{activeProjectSummary\.project_reference\}/);
  });

  it('renders no dealer field beside the active project', () => {
    const layout = read('Layout.jsx');
    expect(layout).not.toMatch(/dealerName=\{activeProjectSummary/);
    expect(layout).not.toMatch(/account=\{activeProjectSummary\.dealer_account\}/);
  });

  it('publishes project, client and reference from the authoritative record', () => {
    const provider = read('components/state/ProjectHydrationProvider.jsx');
    expect(provider).toMatch(/projectReference: project\.project_reference \|\| null/);
    expect(provider).toMatch(/name: project\.name/);
    expect(provider).toMatch(/clientName: project\.client_name/);
  });
});

describe('ROOM DESIGNER HEADER SHOWS IDENTITY', () => {
  it('renders the identity line from the canonical identity', () => {
    const header = read('components/roomdesigner/RoomDesignerHeader.jsx');
    expect(header).toMatch(/useCanonicalProject/);
    expect(header).toMatch(/<ProjectIdentityLine/);
    expect(header).toMatch(/projectName=\{identity\.name\}/);
    expect(header).toMatch(/client=\{identity\.clientName\}/);
    expect(header).toMatch(/reference=\{identity\.projectReference\}/);
  });

  it('states the project on the header, which has no project heading', () => {
    const header = read('components/roomdesigner/RoomDesignerHeader.jsx');
    expect(header).toMatch(/showProject/);
  });

  it('renders no dealer field in the header', () => {
    const header = read('components/roomdesigner/RoomDesignerHeader.jsx');
    expect(header).not.toMatch(/dealerName=\{identity\.dealerName\}/);
    expect(header).not.toMatch(/accountType/);
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

  it('does not truncate the project, client or reference values', () => {
    const line = read('components/projects/ProjectIdentityLine.jsx');
    expect(line).not.toMatch(/textOverflow|ellipsis|truncate/);
  });
});