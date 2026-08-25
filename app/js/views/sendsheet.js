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
    body.push(opt('message', 'Text message', phone, () => handoff(smsLink(phone, text), text, 'Messages')));
  }
  if (email) {
    body.push(opt('mail', 'Email', email, () => handoff(emailLink(email, subject, text), text, 'Mail')));
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

// Hand off to Messages/Mail. On a phone the app takes over and this page goes
// hidden. On a desktop with no handler nothing happens at all — so if we're still
// here a moment later, copy the text and say so rather than looking broken.
function handoff(link, text, appName) {
  let left = false;
  const gone = () => { left = true; };
  document.addEventListener('visibilitychange', gone, { once: true });
  window.addEventListener('pagehide', gone, { once: true });
  window.location.href = link;
  closeModal();
  setTimeout(async () => {
    document.removeEventListener('visibilitychange', gone);
    window.removeEventListener('pagehide', gone);
    if (left || document.visibilityState === 'hidden') return; // the app opened — nothing to say
    const copied = await copyText(text) === 'copied';
    toast(copied
      ? `No ${appName} app on this device — copied instead. On your iPhone this opens ${appName}.`
      : `This device can’t open ${appName}. On your iPhone it opens ${appName}, message ready.`);
  }, 1200);
}
