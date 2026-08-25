// "How do you want to send it?" — one sheet for every prefilled client message.
// Text and Email hand the message straight to Messages / Mail already written;
// copying is the last resort, not the default.

import { el, openModal, closeModal, toast } from '../app.js';
import { icon } from '../icons.js';
import { smsLink, emailLink, copyText, shareText } from '../messages.js';

// title: sheet heading · subject: used only for email
export function sendSheet(title, client, text, subject = 'Delisle Mowing') {
  const phone = (client?.phone || '').trim();
  const email = (client?.email || '').trim();

  const opt = (name, label, sub, onclick) =>
    el('button', { class: 'send-opt', type: 'button', onclick },
      icon(name), el('span', {},
        el('span', { class: 'send-label' }, label),
        el('span', { class: 'send-sub' }, sub)));

  const body = [
    el('div', { class: 'send-preview' }, text),
  ];

  if (phone) {
    body.push(opt('message', 'Text message', phone, () => {
      window.location.href = smsLink(phone, text);
      closeModal();
    }));
  }
  if (email) {
    body.push(opt('mail', 'Email', email, () => {
      window.location.href = emailLink(email, subject, text);
      closeModal();
    }));
  }
  if (!phone && !email) {
    body.push(el('div', { class: 'row-sub', style: 'margin-bottom:10px' },
      'No phone or email saved for this client — add one on their Edit screen and you can send straight from here.'));
  }
  if (navigator.share) {
    body.push(opt('share', 'Other apps…', 'WhatsApp, Messenger, anything else', async () => {
      closeModal();
      const r = await shareText(text);
      if (r === 'shared') toast('Sent ✔');
    }));
  }
  body.push(opt('note', 'Copy the words', 'paste it wherever you like', async () => {
    closeModal();
    toast(await copyText(text) === 'copied' ? 'Copied — paste it into a message' : 'Could not copy');
  }));

  openModal(title, body);
}
