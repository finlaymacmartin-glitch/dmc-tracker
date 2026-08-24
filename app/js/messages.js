// Prefilled client texts: payment requests, on-my-way, review asks.
// One tap opens the share sheet (Messages/Mail on iPhone); desktop falls back to clipboard.

import { getMeta } from './db.js';
import { money, fmtDate } from './models.js';

export async function getBusiness() {
  return (await getMeta('business')) || { etransfer: '', reviewLink: '' };
}

function firstName(client) {
  return (client?.name || '').split(' ')[0] || 'there';
}

export function paymentRequestText(client, inv, balance, business) {
  const pay = business.etransfer
    ? `You can e-transfer to ${business.etransfer}.`
    : 'E-transfer or cash both work.';
  const due = inv.dueDate ? ` by ${fmtDate(inv.dueDate)}` : '';
  return `Hi ${firstName(client)}, it's Delisle Mowing. Invoice ${inv.number} — ${money(balance)} is due${due}. ${pay} Thanks!`;
}

export function onMyWayText(client) {
  const where = client.address ? ` to ${client.address}` : '';
  return `Hi ${firstName(client)}, it's Delisle Mowing — on my way${where} now. See you soon!`;
}

export function reviewRequestText(client, business) {
  const link = business.reviewLink ? ` ${business.reviewLink}` : '';
  return `Hi ${firstName(client)}, thanks for your business! If you were happy with the work, a quick Google review would mean a lot:${link} — Delisle Mowing`;
}

// Share via the native sheet where available; otherwise copy to clipboard.
export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
