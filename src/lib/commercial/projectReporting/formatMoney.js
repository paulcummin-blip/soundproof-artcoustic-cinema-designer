/**
 * formatMoney.js
 * --------------
 * Display formatting for the reporting layer. Numbers stay numbers in the
 * derivation layer; formatting happens only at the edge.
 *
 * Pure: no React, no side effects.
 */

export function formatMoney(value, currency = 'GBP') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const code = String(currency || 'GBP').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${code}`;
  }
}

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-GB');
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(value)} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}