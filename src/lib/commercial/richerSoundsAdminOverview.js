// Richer Sounds Delegated Administration — pure overview helpers.
//
// A read-only surface over the existing authorities (Account,
// AccountMembership, ExternalAccountLink, Project, CapacityLedger,
// AccountUserAudit). This module never writes and never introduces a second
// credit or access model. Formatting helpers mirror accountAccessOverview so
// the two admin surfaces read identically.
//
// For the first checkpoint the page uses the SAMPLE_* generators below so the
// screen renders before the backend exists. The real build replaces the data
// source with the readRicherSoundsAdmin backend function; the helpers and
// shapes stay the same.

import {
  formatGBP,
  formatDate,
  formatDateTime,
} from "./accountAccessOverview";

export { formatGBP, formatDate, formatDateTime };

// The master Richer Sounds account is identified dynamically: the
// RICHER_SOUNDS account whose active Partner Portal link carries trading
// number "93" with a stamped portal_dealer_account_id. No config record is
// required for the first build.
export const RICHER_SOUNDS_MASTER_TRADING_NUMBER = "93";

// Re-export the access-state derivations so the RS page shows eligibility and
// activation exactly as the Account Access surface does.
export {
  soundproofEligibilityState,
  soundproofActivationState,
  buildActivationPill,
  occupiedMembers,
  primaryMember,
  resolveLastActivity,
  buildCreditDetail,
} from "./accountAccessOverview";

// ---------------------------------------------------------------- transfer state

export const TRANSFER_STATES = ["pending", "completed", "partial", "reversed", "failed"];

export function transferStateTone(state) {
  if (state === "completed") return "ok";
  if (state === "pending") return "warn";
  if (state === "partial") return "warn";
  if (state === "reversed") return "info";
  if (state === "failed") return "danger";
  return "muted";
}

// ---------------------------------------------------------------- sample data

// Sample data for the first checkpoint only. Shapes mirror the real backend
// response so swapping the data source is a one-line change.
export function buildSampleRicherSoundsAdminData() {
  const accounts = [
    {
      account: {
        id: "sample-93",
        name: "Custom Install - 93",
        account_type: "dealer",
        status: "active",
        territory: "UK",
        dealer_group: "RICHER_SOUNDS",
        soundproof_eligible: true,
        soundproof_access_expires_at: null,
        last_access_at: "2026-11-22T09:12:00Z",
        contact_email: "ci93@richersounds.com",
      },
      isMaster: true,
      tradingNumber: "93",
      portalDealerAccountId: "b71adb10-8056-46be-a589-32acd954b018",
      portalUserId: "7a9e906f-f613-4919-b2ab-5e4155cd102e",
      mappingStatus: "verified",
      eligibilityState: { label: "Approved", tone: "ok" },
      activationState: { label: "Active", tone: "ok" },
      activationPill: { label: "Active", tone: "ok" },
      seatsUsed: 3,
      seatsMaximum: 5,
      credits: { available: 100, used: 4, rewarded: 0, purchased: 100, manual: 0, promotional: 0, trial: 0, internal: 0, distributor: 0, reversed: 0 },
      projectCount: 4,
      lastActivity: new Date("2026-11-22T09:12:00Z").getTime(),
      primaryEmail: "ci93@richersounds.com",
      members: [
        { email: "ci93@richersounds.com", full_name: "CI 93 Admin", is_account_admin: true, status: "active", access_level: "FULL_ACCESS" },
        { email: "designer93@richersounds.com", full_name: "CI 93 Designer", is_account_admin: false, status: "active", access_level: "FULL_ACCESS" },
      ],
      projects: [
        { id: "p-93-1", name: "Notting Hill Townhouse", client_name: "Private", project_status: "Live", lifecycle_status: "Active", updated_date: "2026-11-20T10:00:00Z", commercial_tier: "PROFESSIONAL", commercial_source: "PURCHASED" },
      ],
      audits: [],
    },
    {
      account: {
        id: "sample-bristol",
        name: "Bristol - 24",
        account_type: "dealer",
        status: "active",
        territory: "UK",
        dealer_group: "RICHER_SOUNDS",
        soundproof_eligible: true,
        soundproof_access_expires_at: "2027-02-20T00:00:00Z",
        last_access_at: "2026-11-21T14:30:00Z",
        contact_email: "bristol@richersounds.com",
      },
      isMaster: false,
      tradingNumber: null,
      portalDealerAccountId: null,
      portalUserId: "bc97c3b7-b034-4bf9-a9e2-e3f4387e2549",
      mappingStatus: "unresolved",
      eligibilityState: { label: "Approved", tone: "ok" },
      activationState: { label: "Active", tone: "ok" },
      activationPill: { label: "Active · 88d left", tone: "ok" },
      seatsUsed: 2,
      seatsMaximum: 5,
      credits: { available: 5, used: 1, rewarded: 0, purchased: 0, manual: 0, promotional: 0, trial: 0, internal: 0, distributor: 0, reversed: 0 },
      projectCount: 1,
      lastActivity: new Date("2026-11-21T14:30:00Z").getTime(),
      primaryEmail: "bristol@richersounds.com",
      members: [
        { email: "bristol@richersounds.com", full_name: "Bristol Admin", is_account_admin: true, status: "active", access_level: "FULL_ACCESS" },
      ],
      projects: [
        { id: "p-brs-1", name: "Clifton Cinema Room", client_name: "Mr Smith", project_status: "Live", lifecycle_status: "Active", updated_date: "2026-11-18T16:00:00Z", commercial_tier: "PROFESSIONAL", commercial_source: "RICHER_SOUNDS_TRANSFER" },
      ],
      audits: [
        { action: "SOUNDPROOF_ENABLE", occurred_at: "2026-11-21T14:00:00Z", actor_email: "paul@artcoustic.com", target_email: "bristol@richersounds.com" },
      ],
    },
    {
      account: {
        id: "sample-liverpool",
        name: "Liverpool - 30",
        account_type: "dealer",
        status: "inactive",
        territory: "UK",
        dealer_group: "RICHER_SOUNDS",
        soundproof_eligible: true,
        soundproof_access_expires_at: null,
        last_access_at: null,
        contact_email: "liverpool@richersounds.com",
      },
      isMaster: false,
      tradingNumber: null,
      portalDealerAccountId: null,
      portalUserId: "f22a9f8f-e61a-40fd-9652-532565bfa2e6",
      mappingStatus: "unresolved",
      eligibilityState: { label: "Approved", tone: "ok" },
      activationState: { label: "Not Activated", tone: "muted" },
      activationPill: { label: "Not Activated · 2d waiting", tone: "muted" },
      seatsUsed: 0,
      seatsMaximum: 5,
      credits: { available: 0, used: 0, rewarded: 0, purchased: 0, manual: 0, promotional: 0, trial: 0, internal: 0, distributor: 0, reversed: 0 },
      projectCount: 0,
      lastActivity: null,
      primaryEmail: null,
      members: [],
      projects: [],
      audits: [
        { action: "SOUNDPROOF_ELIGIBILITY_SET", occurred_at: "2026-11-22T11:00:00Z", actor_email: "paul@artcoustic.com", target_email: "liverpool@richersounds.com" },
      ],
    },
    {
      account: {
        id: "sample-chelsea",
        name: "Chelsea - 27",
        account_type: "dealer",
        status: "inactive",
        territory: "UK",
        dealer_group: "RICHER_SOUNDS",
        soundproof_eligible: false,
        soundproof_access_expires_at: null,
        last_access_at: null,
        contact_email: "chelsea@richersounds.com",
      },
      isMaster: false,
      tradingNumber: null,
      portalDealerAccountId: null,
      portalUserId: "ea963aaf-0a8c-45a5-a6aa-2f5f8841945f",
      mappingStatus: "unresolved",
      eligibilityState: { label: "Not Approved", tone: "muted" },
      activationState: { label: "Not Activated", tone: "muted" },
      activationPill: { label: "Not Activated", tone: "muted" },
      seatsUsed: 0,
      seatsMaximum: 5,
      credits: { available: 0, used: 0, rewarded: 0, purchased: 0, manual: 0, promotional: 0, trial: 0, internal: 0, distributor: 0, reversed: 0 },
      projectCount: 0,
      lastActivity: null,
      primaryEmail: null,
      members: [],
      projects: [],
      audits: [],
    },
  ];

  const transfers = [
    {
      transfer_id: "t-1",
      source_account_id: "sample-93",
      source_account_name: "Custom Install - 93",
      destination_account_id: "sample-bristol",
      destination_account_name: "Bristol - 24",
      amount: 5,
      actor_email: "ci93@richersounds.com",
      created_at: "2026-11-19T12:00:00Z",
      completed_at: "2026-11-19T12:00:05Z",
      state: "completed",
      note: "Onboarding credit allocation",
    },
  ];

  const activity = [
    { occurred_at: "2026-11-21T14:30:00Z", account_name: "Bristol - 24", action: "account activated", detail: "Sound Proof access enabled" },
    { occurred_at: "2026-11-19T12:00:05Z", account_name: "Custom Install - 93", action: "credit transferred", detail: "5 credits to Bristol - 24" },
    { occurred_at: "2026-11-18T16:00:00Z", account_name: "Bristol - 24", action: "project created", detail: "Clifton Cinema Room" },
  ];

  return {
    masterAccount: accounts.find((a) => a.isMaster) || null,
    accounts,
    transfers,
    activity,
    unresolvedMappingCount: accounts.filter((a) => !a.isMaster && a.mappingStatus === "unresolved").length,
  };
}