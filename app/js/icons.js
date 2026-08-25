// Stroke icon set — same drawing language as the tab bar (24px box, round caps,
// currentColor) so buttons and alerts stop mixing emoji with real icons.

const P = {
  chart: '<path d="M4 20h16"/><path d="M7 20v-6.5"/><path d="M12 20V8"/><path d="M17 20V4.5"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  receipt: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21Z"/><path d="M9.5 8.5h5M9.5 12.5h5"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.7 1-5.85L3.5 9.75l5.9-.85Z"/>',
  truck: '<path d="M2.5 16.5v-4l2-4.5h9.5v8.5"/><path d="M14 10.5h4l3 3.5v2.5h-2"/><circle cx="7" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/><path d="M8.9 17.5h6.2"/>',
  message: '<path d="M20.5 12.4c0 3.9-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4.5 20.5l1.2-3.3A6.6 6.6 0 0 1 3.5 12.4c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z"/>',
  upload: '<path d="M12 16V4.5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M4 15v3.5A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2V15"/>',
  download: '<path d="M12 4.5V16"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4 15v3.5A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2V15"/>',
  sprout: '<path d="M12 20.5v-7"/><path d="M12 13.5C12 9.9 9.6 7.5 6 7.5c0 3.6 2.4 6 6 6Z"/><path d="M12 13.5c0-3.6 2.4-6 6-6 0 3.6-2.4 6-6 6Z"/>',
  printer: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="7.5" rx="2"/><path d="M7 14h10v6.5H7Z"/>',
  note: '<path d="M4.5 4.5h15v10l-5 5h-10Z"/><path d="M14.5 19.5v-5h5"/><path d="M8 9h8M8 12.5h5"/>',
  wrench: '<path d="M14.8 3.6a5 5 0 0 0-1.3 8l-9.6 9.6M14.8 3.6l5.6 5.6M20.4 9.2a5 5 0 0 1-8-1.3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 2.8v4M16 2.8v4"/>',
  calendarAdd: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 2.8v4M16 2.8v4"/><path d="M12 13v5M9.5 15.5h5"/>',
  save: '<path d="M4.5 4.5h11l4 4v11h-15Z"/><path d="M8 4.5v5h6v-5"/><rect x="8" y="13" width="8" height="6.5"/>',
  spend: '<path d="M3.5 8a2 2 0 0 1 2-2h11.5v3"/><rect x="3.5" y="8" width="17" height="11.5" rx="2"/><path d="M15 13.75h3"/>',
  trendUp: '<path d="M4 16.5 9.5 11l3.5 3.5L20 7.5"/><path d="M14.5 7.5H20V13"/>',
  warning: '<path d="M12 4.2 21 19.5H3Z"/><path d="M12 10v4.2"/><path d="M12 17.2h.01"/>',
  check: '<circle cx="12" cy="12" r="8.6"/><path d="m8.3 12.2 2.6 2.6 4.9-5"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/>',
  plus: '<circle cx="12" cy="12" r="8.6"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
};

// returns an <svg> element; `cls` lets callers size it (.ico-sm etc.)
export function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = P[name] || P.check;
  return svg;
}
